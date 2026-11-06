import SwiftUI
import UIKit

/// What a native page gets: its params, and the navigator it shares with the Valdi pages.
struct NativePage {
    let entry: PageEntry
    let navigator: Navigator

    var params: [String: Any] { entry.params }

    /// Closes this page and delivers the result to whoever opened it with pushForResult.
    func finish(_ result: [String: Any]) {
        navigator.finish(entry.id, result: result)
    }

    func back() { navigator.cancel(entry.id) }

    /// As Page.setStatusBarStyle: "auto", "light" or "dark"; reset to "auto" each time the page comes back.
    func setStatusBarStyle(_ style: String) {
        precondition(["auto", "light", "dark"].contains(style), "Bad status bar style: \(style)")
        navigator.setStatusBarStyle(style)
    }
}

/// The native pages, by route: the routes with kind 'native' in routes.ts. A UIKit controller or a SwiftUI view.
enum NativeScreens {
    private static let screens: [String: (NativePage) -> UIViewController] = registerDefaults()

    static func contains(_ name: String) -> Bool { screens[name] != nil }

    static func make(_ page: NativePage) -> UIViewController {
        guard let make = screens[page.entry.definition.nativeName ?? ""] else { fatalError("No native screen registered for \(page.entry.route)") }
        return make(page)
    }

    private static func registerDefaults() -> [String: (NativePage) -> UIViewController] {
        ["picker": { UIHostingController(rootView: PickerScreen(page: $0)) }]
    }
}

private let fruits = ["苹果", "香蕉", "橙子", "葡萄", "西瓜"]

/// A plain SwiftUI page in the same stack, returning a result to the Valdi page that opened it.
struct PickerScreen: View {
    let page: NativePage

    var body: some View {
        List {
            Section("SwiftUI 页面，选一项返回给 Valdi 页面") {
                ForEach(fruits, id: \.self) { fruit in
                    Button(fruit) { page.finish(["value": fruit]) }
                }
            }
            Button("从原生页 push Valdi 详情页") {
                page.navigator.open("detail", params: ["id": 100, "from": "原生页"])
            }
            Button("原生调用 switchTab('wheels')") { page.navigator.switchTab("wheels") }
            // Native pages call the same AppUI directly, without going through JS.
            Button("原生调用 showModal") {
                Task {
                    let answer = try await app.ui.showModal(ModalOptions(title: "原生调用", content: "app.ui.showModal"))
                    _ = try await app.ui.showToast(ToastOptions(title: answer.confirm ? "原生页点了确定" : "原生页点了取消", icon: "none"))
                }
            }
        }
    }
}
