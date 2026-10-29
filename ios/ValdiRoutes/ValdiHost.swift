import UIKit
import ValdiRuntime

/// One Valdi runtime for the whole app; every page is a root view inside it.
final class ValdiHost {
    static let shared = ValdiHost()

    private let runtimeManager: SCValdiRuntimeManager = {
        let manager = SCValdiRuntimeManager()
        // The over-the-air package's modules and images (ValdiOta.swift), chosen before the runtime starts.
        let modules = ValdiOta.start()
        // Applied when the runtime starts, after Valdi's default loader, so remote <image> sources go through SDWebImage.
        manager.updateConfiguration {
            $0.imageLoaders = [AppImageLoader()]
            $0.customModuleProvider = modules
            // Device.observeDarkMode (theme.ts) only hears about the appearance with this on.
            $0.allowDarkMode = true
        }
        return manager
    }()

    private var runtime: SCValdiRuntime { runtimeManager.mainRuntime! }

    /// The route table, tab bar and first page, from startApp (app.ts) once it has run; on the main thread.
    func start(completion: @escaping (RouteTable) -> Void) {
        if let started { return completion(started) }
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        let runtime = self.runtime
        runtime.registerNativeModuleFactory(CalculatorCreateModuleFactory())
        VRInstallAppUI.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: appUIHost) {}
        VRInstallBleHost.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: bleHost) {}
        VRInstallPermissionHost.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: permissionHost, androidSdk: 0) {}
        VRInstallWifiHost.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: wifiHost) {}
        // No NfcHost: nfc/native.ts answers NOT_SUPPORTED on iOS before it looks one up.
        VRInstallVisionHost.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: visionHost) {}
        VRInstallStorageHost.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, host: storageHost.host) {}
        // App-wide objects (the SQLite connection, api, the router) are created here, not in a page.
        #if DEBUG
        let debug = true
        #else
        let debug = false
        #endif
        VRStartApp.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, debug: debug, navigation: navigationHost,
                          tokens: tokenStore.store) { json in
            // A startApp that threw still completes, with an empty string; its error is in the log. The launch fails
            // before confirming, so an over-the-air package it ran from is rolled back at the next start.
            guard let table = RouteTable.parse(json) else { fatalError("startApp returned no route table: '\(json)'") }
            // The modules loaded and ran: a newly installed package is good. Only then look for the next one.
            ValdiOta.confirmLaunch()
            Task.detached(priority: .background) { await ValdiOta.checkForUpdate() }
            DispatchQueue.main.async { [self] in
                started = table
                waiting.forEach { $0(table) }
                waiting.removeAll()
            }
        }
    }

    private var started: RouteTable?
    private var waiting: [(RouteTable) -> Void] = []

    /// The navigator JS drives (RootController's).
    weak var navigator: Navigator?

    /// The res/ images of app_pages: app_pages.bundle, which the "Valdi modules" build phase (tools/valdi-rolldown) puts in
    /// the app's resources, next to the generated classes (ios/Generated/valdi).
    static let resourceBundle: Bundle? = Bundle(for: VRNavigationHost.self).url(forResource: "app_pages", withExtension: "bundle")
        .flatMap(Bundle.init(url:))

    /// `router` (routes.ts) lands here on the JS thread; the navigator lives on the main thread.
    private lazy var navigationHost = VRNavigationHost(
        push: { [weak self] route, params, presentation, navigation in
            self?.onNavigator { $0.open(route, paramsJson: params, presentation: Presentation(presentation),
                                        navigation: NavigationOptions(json: navigation)) }
        },
        pushForResult: { [weak self] route, params, presentation, navigation, onResult in
            self?.onNavigator {
                $0.open(route, paramsJson: params, presentation: Presentation(presentation),
                        navigation: NavigationOptions(json: navigation)) { json, canceled in onResult(json, canceled) }
            }
        },
        replace: { [weak self] route, params, navigation in
            self?.onNavigator { $0.replace(route, paramsJson: params, navigation: NavigationOptions(json: navigation)) }
        },
        back: { [weak self] delta in self?.onNavigator { $0.back(Int(delta)) } },
        popToRoot: { [weak self] in self?.onNavigator { $0.popToRoot() } },
        reset: { [weak self] route, params in self?.onNavigator { $0.reset(route, paramsJson: params) } },
        switchTab: { [weak self] tab in self?.onNavigator { $0.switchTab(tab) } },
        setStatusBarStyle: { [weak self] style in self?.onNavigator { $0.setStatusBarStyle(style) } },
        currentPages: { [weak self] done in
            DispatchQueue.main.async { done(self?.navigator?.currentPages() ?? "[]") }
        }
    )

    private func onNavigator(_ action: @escaping (Navigator) -> Void) {
        DispatchQueue.main.async { [weak self] in self?.navigator.map(action) }
    }

    /// `api` in TS lands here; requests are already validated and defaulted there. Called on the JS thread. Held here
    /// for the app's lifetime: JS only references native functions weakly, so a host nobody holds gets released.
    private lazy var appUIHost: VRAppUIHost = makeAppUIHost()

    /// `api`'s Bluetooth methods, on the shared BleCore.
    private let bleHost = BleHostImpl()

    /// `runDemo` of vision/VisionHost.ts, on the C++ VisionCore.
    private let visionHost = VisionHostImpl()

    /// Runtime permissions for permissions/index.ts; on iOS only openSettings does anything.
    private let permissionHost = PermissionHostImpl()

    /// `api`'s Wi-Fi methods, on the shared WifiCore.
    private let wifiHost = WifiHostImpl()

    /// auth.ts's token, in the Keychain.
    private let tokenStore = TokenStoreImpl()

    /// `api.*StorageSync`, in MMKV.
    private let storageHost = StorageHostImpl()

    private func makeAppUIHost() -> VRAppUIHost {
        VRAppUIHost(
            showModal: { request, done in
                let options = ModalOptions(
                    title: request.title, content: request.content, showCancel: request.showCancel,
                    confirmText: request.confirmText, cancelText: request.cancelText, editable: request.editable,
                    placeholderText: request.placeholderText, defaultText: request.defaultText
                )
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        _ = AppUI.shared.showModal(options) { result in
                            switch result {
                            case let .success(reply):
                                done("", VRModalReply(confirm: reply.confirm, cancel: reply.cancel, content: reply.content))
                            case let .failure(error):
                                done(error.localizedDescription, VRModalReply(confirm: false, cancel: true, content: ""))
                            }
                        }
                    }
                }
            },
            showActionSheet: { request, done in
                Self.present(.actionSheet(ActionSheetOptions(alertText: request.title, itemList: request.itemList)), done)
            },
            showPicker: { request, done in
                Self.present(.picker(PickerOptions(
                    title: request.title, options: request.options.map { PickerOption($0.value, label: $0.label) },
                    value: request.value, confirmText: request.confirmText, cancelText: request.cancelText
                )), done)
            },
            showDatePicker: { request, done in
                Self.present(.datePicker(DatePickerOptions(
                    title: request.title, mode: request.mode, value: request.value, minYear: Int(request.minYear),
                    maxYear: Int(request.maxYear), confirmText: request.confirmText, cancelText: request.cancelText
                )), done)
            },
            showBottomSheet: { request, done in
                Self.present(.bottomSheet(BottomSheetOptions(
                    title: request.title, content: request.content, confirmText: request.confirmText,
                    cancelText: request.cancelText, showCancel: request.showCancel, dismissible: request.dismissible
                )), done)
            },
            previewImage: { request, done in
                Self.present(.imagePreview(ImagePreviewOptions(urls: request.urls, current: request.current)), done)
            },
            scanCode: { done in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        AppUI.shared.scanCode { result in
                            switch result {
                            case let .success(reply): done("", VRScanCodeReply(result: reply.result, scanType: reply.scanType))
                            case let .failure(error): done(error.localizedDescription, VRScanCodeReply(result: "", scanType: ""))
                            }
                        }
                    }
                }
            },
            pickAttachments: { source, limit, mimeTypes, done in
                let options = AttachmentPickOptions(limit: limit.isFinite ? Int(min(max(1, limit), 20)) : 1, mimeTypes: mimeTypes)
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        AppUI.shared.pickAttachments(source, options) { result in
                            switch result {
                            case let .success(selection):
                                done("", VRAttachmentSelection(canceled: selection.canceled, assets: selection.assets.map {
                                    VRAttachmentAsset(id2: $0.id, uri: $0.uri, name: $0.name, mimeType: $0.mimeType, size: $0.size)
                                }))
                            case let .failure(error):
                                done(error.localizedDescription, VRAttachmentSelection(canceled: false, assets: []))
                            }
                        }
                    }
                }
            },
            clearAttachmentCache: { done in
                Task {
                    do {
                        try await AppUI.clearAttachmentCache()
                        done("")
                    } catch {
                        done(error.localizedDescription)
                    }
                }
            },
            showToast: { request, done in
                Self.onMain(done) {
                    try AppUI.shared.showToast(ToastOptions(title: request.title, icon: request.icon,
                                                            duration: request.duration, mask: request.mask))
                }
            },
            hideToast: { done in Self.onMain(done) { AppUI.shared.hideToast() } },
            showLoading: { request, done in
                Self.onMain(done) { try AppUI.shared.showLoading(LoadingOptions(title: request.title, mask: request.mask)) }
            },
            hideLoading: { done in Self.onMain(done) { AppUI.shared.hideLoading() } }
        )
    }

    private static func present(_ options: PresentationOptions, _ done: @escaping (String, VRPresentationReply) -> Void) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                _ = AppUI.shared.showPresentation(options) { result in
                    switch result {
                    case let .success(reply):
                        done("", VRPresentationReply(confirm: reply.confirm, cancel: reply.cancel, value: reply.value,
                                                     index: Double(reply.index)))
                    case let .failure(error):
                        done(error.localizedDescription, VRPresentationReply(confirm: false, cancel: true, value: "", index: -1))
                    }
                }
            }
        }
    }

    private static func onMain(_ done: @escaping (String) -> Void, _ action: @escaping @MainActor () throws -> Void) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                do {
                    try action()
                    done("")
                } catch {
                    done(error.localizedDescription)
                }
            }
        }
    }

    func createPage(_ entry: PageEntry, insets: UIEdgeInsets, navigator: Navigator) -> SCValdiRootView {
        let viewModel = viewModel(entry, insets)
        let context = pageContext(entry, navigator)
        // One generated root view class per @Component, named by its @ExportModel ios name.
        let rootView: SCValdiRootView = switch entry.definition.component {
        case "LoginPage@app_pages/src/LoginPage":
            VRLoginPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "HomePage@app_pages/src/HomePage":
            VRHomePage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "DetailPage@app_pages/src/DetailPage":
            VRDetailPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "FormPage@app_pages/src/FormPage":
            VRFormPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "BlePage@app_pages/src/BlePage":
            VRBlePage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "PresentationPage@app_pages/src/PresentationPage":
            VRPresentationPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "VisionPage@app_pages/src/VisionPage":
            VRVisionPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "RouteAnimationPage@app_pages/src/RouteAnimationPage":
            VRRouteAnimationPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "DevicePage@app_pages/src/DevicePage":
            VRDevicePage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "WheelPage@app_pages/src/WheelPage":
            VRWheelPage(viewModel: viewModel, componentContext: context, runtime: runtime)
        case "CalculatorComponent@calculator/src/CalculatorComponent":
            CalculatorRootView(viewModelUntyped: viewModel, componentContextUntyped: context, runtime: runtime)
        default:
            fatalError("\(entry.route) has no iOS root view class")
        }
        // Valdi's own accessibility tree (labels, buttons) for VoiceOver and UI automation; off unless asked for. The
        // Android runtime exposes its views' accessibility by default.
        rootView.valdiContext?.enableAccessibility = true
        return rootView
    }

    func updateInsets(_ entry: PageEntry, insets: UIEdgeInsets) {
        entry.rootView?.valdiContext?.viewModel = viewModel(entry, insets)
    }

    /// The page's visibility changed (Navigator.updateVisibility); a page without its view yet gets it on creation.
    func updateVisibility(_ entry: PageEntry) {
        guard let insets = entry.appliedInsets else { return }
        entry.rootView?.valdiContext?.viewModel = viewModel(entry, insets)
    }

    private func viewModel(_ entry: PageEntry, _ insets: UIEdgeInsets) -> VRPageViewModel {
        VRPageViewModel(
            pageId: entry.id,
            route: entry.route,
            paramsJson: entry.paramsJson,
            presentation: entry.presentation.rawValue,
            insets: VRPageInsets(top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right),
            visible: entry.visible,
            visibilityReason: entry.visibilityReason
        )
    }

    // TS calls these on the JS thread; navigation state lives on the main thread. A tab page is not on the stack, so
    // both do nothing for it.
    private func pageContext(_ entry: PageEntry, _ navigator: Navigator) -> VRPageContext {
        VRPageContext(
            finish: { result in DispatchQueue.main.async { navigator.finish(entry.id, resultJson: result) } },
            back: { DispatchQueue.main.async { navigator.cancel(entry.id) } }
        )
    }
}

struct RouteDefinition {
    let kind: String
    let title: String
    let component: String?
}

/// One tab of TAB_BAR; icons are res/ image names in app_pages.bundle.
struct Tab {
    let tab: String
    let route: String
    let text: String
    let icon: String
    let selectedIcon: String?
}

struct TabBar {
    let route: String
    let tabs: [Tab]
}

/// What startApp (app.ts) returns: the routes, the tab bar and the first page.
struct RouteTable {
    private let routes: [String: RouteDefinition]
    let tabBar: TabBar?
    let root: String

    subscript(route: String) -> RouteDefinition {
        guard let definition = routes[route] else { fatalError("Unknown route: \(route)") }
        return definition
    }

    /// nil unless it is startApp's table, with its root among the routes.
    static func parse(_ json: String) -> RouteTable? {
        guard let start = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any],
              let root = start["root"] as? String, (start["routes"] as? [String: Any])?[root] != nil
        else { return nil }
        // Routes may also carry `options`; routes.ts has already resolved them into each push.
        let routes = start["routes"] as? [String: [String: Any]] ?? [:]
        let bar = start["tabBar"] as? [String: Any]
        return RouteTable(
            routes: routes.mapValues { route in
                RouteDefinition(kind: route["kind"] as? String ?? "", title: route["title"] as? String ?? "",
                                component: route["component"] as? String)
            },
            tabBar: bar.map { bar in
                TabBar(route: bar["route"] as? String ?? "", tabs: (bar["tabs"] as? [[String: Any]] ?? []).map {
                    Tab(tab: $0["tab"] as? String ?? "", route: $0["route"] as? String ?? "", text: $0["text"] as? String ?? "",
                        icon: $0["icon"] as? String ?? "", selectedIcon: $0["selectedIcon"] as? String)
                })
            },
            root: root
        )
    }
}
