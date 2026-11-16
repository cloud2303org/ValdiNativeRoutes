import UIKit
import ValdiRuntime

// MARK: - Portal Host View (`<BottomSheetProvider>`)

@objc(VRBottomSheetPortalHostView)
final class VRBottomSheetPortalHostView: UIView {
    private var isDeallocating = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        isDeallocating = true
    }

    override func clipsToBoundsByDefault() -> Bool { false }

    override func didAddSubview(_ subview: UIView) {
        super.didAddSubview(subview)
        if let sheet = subview as? VRBottomSheetView {
            sheet.portalOwner = self
        }
        syncSheetStack()
    }

    override func willRemoveSubview(_ subview: UIView) {
        if let sheet = subview as? VRBottomSheetView, sheet.portalOwner === self {
            sheet.portalOwner = nil
        }
        super.willRemoveSubview(subview)
        guard !isDeallocating else { return }
        DispatchQueue.main.async { [weak self] in
            self?.syncSheetStack()
        }
    }

    func syncSheetStack() {
        let sheets = subviews
            .compactMap { $0 as? VRBottomSheetView }
            .filter { !$0.windowOverlay }
            .sorted { $0.openOrder < $1.openOrder }

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (idx, sheet) in sheets.enumerated() {
            sheet.layer.zPosition = CGFloat(idx)
        }
        CATransaction.commit()
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        let sheets = subviews
            .compactMap { $0 as? VRBottomSheetView }
            .filter { !$0.windowOverlay && !$0.isHidden && $0.alpha > 0.01 }
            .sorted { $0.openOrder > $1.openOrder }

        for sheet in sheets {
            let local = sheet.convert(point, from: self)
            if sheet.hostingView.isPointInteractive(local) {
                return true
            }
        }
        return false
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
        let sheets = subviews
            .compactMap { $0 as? VRBottomSheetView }
            .filter { !$0.windowOverlay && !$0.isHidden && $0.alpha > 0.01 }
            .sorted { $0.openOrder > $1.openOrder }

        for sheet in sheets {
            let local = sheet.convert(point, from: self)
            if let hit = sheet.hostingView.hitTest(local, with: event) {
                return hit
            }
        }
        return nil
    }

    // Hardware Escape support for presented sheets with `onCloseRequest`
    override var keyCommands: [UIKeyCommand]? {
        let hasActiveEscapeTarget = subviews
            .compactMap { $0 as? VRBottomSheetView }
            .contains { !$0.windowOverlay && $0.hostingView.interceptsCloseOrEscape }
        guard hasActiveEscapeTarget else { return nil }
        let cmd = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(handleEscapeKey))
        if #available(iOS 15.0, *) {
            cmd.wantsPriorityOverSystemBehavior = true
        }
        return [cmd]
    }

    @objc private func handleEscapeKey() {
        let topTarget = subviews
            .compactMap { $0 as? VRBottomSheetView }
            .filter { !$0.windowOverlay && $0.hostingView.interceptsCloseOrEscape }
            .max(by: { $0.openOrder < $1.openOrder })
        topTarget?.hostingView.emitCloseRequestFromSystem()
    }
}

// MARK: - Window Overlay Container (`windowOverlay == true`)

final class VRBottomSheetOverlayContainerView: UIView {
    private static var windowMap = NSMapTable<UIWindow, VRBottomSheetOverlayContainerView>.weakToWeakObjects()

    static func obtain(for window: UIWindow) -> VRBottomSheetOverlayContainerView {
        if let existing = windowMap.object(forKey: window), existing.superview === window {
            window.bringSubviewToFront(existing)
            return existing
        }
        let container = VRBottomSheetOverlayContainerView(frame: window.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(container)
        windowMap.setObject(container, forKey: window)
        return container
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    func attach(_ hostingView: VRBottomSheetHostingView) {
        if hostingView.superview !== self {
            hostingView.removeFromSuperview()
            hostingView.frame = bounds
            hostingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(hostingView)
        }
        resortHosts()
    }

    func detach(_ hostingView: VRBottomSheetHostingView) {
        if hostingView.superview === self {
            hostingView.removeFromSuperview()
        }
        if subviews.isEmpty {
            removeFromSuperview()
        } else {
            resortHosts()
        }
    }

    func resortHosts() {
        let hosts = subviews.compactMap { $0 as? VRBottomSheetHostingView }.sorted { $0.openOrder < $1.openOrder }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (idx, host) in hosts.enumerated() {
            host.layer.zPosition = CGFloat(idx)
        }
        CATransaction.commit()
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        let hosts = subviews
            .compactMap { $0 as? VRBottomSheetHostingView }
            .sorted { $0.openOrder > $1.openOrder }
        for host in hosts {
            let local = host.convert(point, from: self)
            if host.isPointInteractive(local) {
                return true
            }
        }
        return false
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
        let hosts = subviews
            .compactMap { $0 as? VRBottomSheetHostingView }
            .sorted { $0.openOrder > $1.openOrder }
        for host in hosts {
            let local = host.convert(point, from: self)
            if let hit = host.hitTest(local, with: event) {
                return hit
            }
        }
        return nil
    }
}

// MARK: - Main Sheet Custom View (`VRBottomSheetView`)

@objc(VRBottomSheetView)
final class VRBottomSheetView: UIView, SCValdiContentViewProviding {
    let hostingView = VRBottomSheetHostingView()
    weak var portalOwner: VRBottomSheetPortalHostView?

    var openOrder: Int = 0 {
        didSet {
            guard openOrder != oldValue else { return }
            hostingView.openOrder = openOrder
            portalOwner?.syncSheetStack()
            (hostingView.superview as? VRBottomSheetOverlayContainerView)?.resortHosts()
        }
    }

    var windowOverlay: Bool = false {
        didSet {
            guard windowOverlay != oldValue else { return }
            syncHostPlacement()
            portalOwner?.syncSheetStack()
        }
    }

    private var onNativeGeometry: (any SCValdiFunction)?
    private var onNativeIndexChange: (any SCValdiFunction)?
    private var onNativeSettle: (any SCValdiFunction)?
    private var onNativePositionChange: (any SCValdiFunction)?
    private var onNativeCloseRequest: (any SCValdiFunction)?

    private var surfaceCornerRadii: [CGFloat] = [0, 0, 0, 0]
    private var surfaceCornerCurve: String = "circular"

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false

        hostingView.frame = bounds
        hostingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(hostingView)

        hostingView.onGeometryChanged = { [weak self] width, height, surfaceHeight, inset in
            guard let self, let fn = self.onNativeGeometry else { return }
            let marshaller = SCValdiMarshallerCreate()
            defer { SCValdiMarshallerDestroy(marshaller) }
            SCValdiMarshallerPushDouble(marshaller, width)
            SCValdiMarshallerPushDouble(marshaller, height)
            SCValdiMarshallerPushDouble(marshaller, surfaceHeight)
            SCValdiMarshallerPushDouble(marshaller, inset)
            SCValdiFunctionSafePerform(fn, marshaller)
        }

        hostingView.onIndexChanged = { [weak self] index in
            guard let self, let fn = self.onNativeIndexChange else { return }
            let marshaller = SCValdiMarshallerCreate()
            defer { SCValdiMarshallerDestroy(marshaller) }
            SCValdiMarshallerPushInt(marshaller, Int32(index))
            SCValdiFunctionSafePerform(fn, marshaller)
        }

        hostingView.onSettleChanged = { [weak self] index in
            guard let self else { return }
            if let fn = self.onNativeSettle {
                let marshaller = SCValdiMarshallerCreate()
                defer { SCValdiMarshallerDestroy(marshaller) }
                SCValdiMarshallerPushInt(marshaller, Int32(index))
                SCValdiFunctionSafePerform(fn, marshaller)
            }
            self.syncHostPlacement()
        }

        hostingView.onPositionChanged = { [weak self] position, fractionalIndex in
            guard let self, let fn = self.onNativePositionChange else { return }
            let marshaller = SCValdiMarshallerCreate()
            defer { SCValdiMarshallerDestroy(marshaller) }
            SCValdiMarshallerPushDouble(marshaller, position)
            SCValdiMarshallerPushDouble(marshaller, fractionalIndex)
            SCValdiFunctionSafePerform(fn, marshaller)
        }

        hostingView.onCloseRequest = { [weak self] in
            guard let self, let fn = self.onNativeCloseRequest else { return }
            let marshaller = SCValdiMarshallerCreate()
            defer { SCValdiMarshallerDestroy(marshaller) }
            SCValdiFunctionSafePerform(fn, marshaller)
        }

        hostingView.onPresentationChanged = { [weak self] in
            guard let self else { return }
            self.portalOwner?.syncSheetStack()
            self.syncHostPlacement()
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }

    func contentViewForInsertingValdiChildren() -> UIView? {
        hostingView.clipContainer
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if hostingView.superview === self {
            hostingView.frame = bounds
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        syncHostPlacement()
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        !windowOverlay && hostingView.isPointInteractive(point)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !windowOverlay else { return nil }
        return hostingView.hitTest(point, with: event)
    }

    private func syncHostPlacement() {
        guard let currentWindow = window else {
            if let overlay = hostingView.superview as? VRBottomSheetOverlayContainerView {
                overlay.detach(hostingView)
            }
            if hostingView.superview !== self {
                hostingView.frame = bounds
                addSubview(hostingView)
            }
            return
        }

        if windowOverlay {
            let overlay = VRBottomSheetOverlayContainerView.obtain(for: currentWindow)
            overlay.attach(hostingView)
        } else {
            if let overlay = hostingView.superview as? VRBottomSheetOverlayContainerView {
                overlay.detach(hostingView)
            }
            if hostingView.superview !== self {
                hostingView.frame = bounds
                addSubview(hostingView)
            }
        }
    }

    override func valdi_prepareForPoolReuse() {
        super.valdi_prepareForPoolReuse()
        if let overlay = hostingView.superview as? VRBottomSheetOverlayContainerView {
            overlay.detach(hostingView)
        }
        if hostingView.superview !== self {
            hostingView.frame = bounds
            addSubview(hostingView)
        }
        onNativeGeometry = nil
        onNativeIndexChange = nil
        onNativeSettle = nil
        onNativePositionChange = nil
        onNativeCloseRequest = nil
        windowOverlay = false
        openOrder = 0
        hostingView.committedContentRegionInset = nil
        hostingView.setRawDetents([])
        hostingView.setRequestedIndex(-1)
    }

    // ---- Attribute Decoding ----

    private func applyDetentsArray(_ array: [Any]?) {
        guard let array else {
            hostingView.setRawDetents([])
            return
        }
        let specs: [VRBSRawDetentSpec] = array.compactMap { item in
            guard let dict = item as? [String: Any] else { return nil }
            let kindStr = (dict["kind"] as? String) ?? "points"
            let kind = VRBSDetentKind(rawValue: kindStr) ?? .points
            return VRBSRawDetentSpec(
                value: CGFloat((dict["value"] as? NSNumber)?.doubleValue ?? 0),
                kind: kind,
                programmatic: (dict["programmatic"] as? Bool) ?? false,
                usesStatusBarTopInset: (dict["usesStatusBarTopInset"] as? Bool) ?? false,
                insetTop: CGFloat((dict["insetTop"] as? NSNumber)?.doubleValue ?? 0),
                insetLeft: CGFloat((dict["insetLeft"] as? NSNumber)?.doubleValue ?? 0),
                insetRight: CGFloat((dict["insetRight"] as? NSNumber)?.doubleValue ?? 0),
                insetBottom: CGFloat((dict["insetBottom"] as? NSNumber)?.doubleValue ?? 0),
                widestCard: (dict["widestCard"] as? Bool) ?? false,
                scrimOpacity: CGFloat((dict["scrimOpacity"] as? NSNumber)?.doubleValue ?? 1)
            )
        }
        hostingView.setRawDetents(specs)
    }

    private func applyCornerRadii(_ array: [Any]?) {
        if let array, array.count >= 4 {
            surfaceCornerRadii = (0..<4).map { idx in
                CGFloat((array[idx] as? NSNumber)?.doubleValue ?? 0)
            }
        } else {
            surfaceCornerRadii = [0, 0, 0, 0]
        }
        hostingView.setSurfaceCornerStyle(radii: surfaceCornerRadii, curveString: surfaceCornerCurve)
    }

    private func applyCornerCurve(_ curve: String?) {
        surfaceCornerCurve = curve ?? "circular"
        hostingView.setSurfaceCornerStyle(radii: surfaceCornerRadii, curveString: surfaceCornerCurve)
    }

    private func applySurfaceShadows(_ array: [Any]?) {
        guard let array else {
            hostingView.setSurfaceShadows([])
            return
        }
        let shadows: [VRBSCardShadow] = array.compactMap { item in
            guard let dict = item as? [String: Any] else { return nil }
            let colorArgb = Int32(truncatingIfNeeded: (dict["colorArgb"] as? NSNumber)?.int64Value ?? 0)
            let opacity = Float((dict["opacity"] as? NSNumber)?.doubleValue ?? 1.0)
            guard opacity > 0 else { return nil }
            return VRBSCardShadow(
                offsetX: CGFloat((dict["offsetX"] as? NSNumber)?.doubleValue ?? 0),
                offsetY: CGFloat((dict["offsetY"] as? NSNumber)?.doubleValue ?? 0),
                blurRadius: CGFloat((dict["blurRadius"] as? NSNumber)?.doubleValue ?? 0),
                spreadDistance: CGFloat((dict["spreadDistance"] as? NSNumber)?.doubleValue ?? 0),
                colorArgb: colorArgb,
                opacity: opacity,
                excludesInterior: (dict["excludesInterior"] as? Bool) ?? true
            )
        }
        hostingView.setSurfaceShadows(shadows)
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("detents", invalidateLayoutOnChange: false, withArrayBlock: { view, array, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.applyDetentsArray(array)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.applyDetentsArray(nil)
        })

        attributesBinder.bindAttribute("detentIndex", invalidateLayoutOnChange: false, withIntBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.setRequestedIndex(value)
            v.syncHostPlacement()
            return true
        }, resetBlock: { view, _ in
            guard let v = view as? VRBottomSheetView else { return }
            v.hostingView.setRequestedIndex(-1)
            v.syncHostPlacement()
        })

        attributesBinder.bindAttribute("animateIn", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.animateIn = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.animateIn = true
        })

        attributesBinder.bindAttribute("animateContentHeight", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.animateContentHeight = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.animateContentHeight = true
        })

        attributesBinder.bindAttribute("modal", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.modal = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.modal = false
        })

        attributesBinder.bindAttribute("windowOverlay", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.windowOverlay = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.windowOverlay = false
        })

        attributesBinder.bindAttribute("openOrder", invalidateLayoutOnChange: false, withIntBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.openOrder = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.openOrder = 0
        })

        attributesBinder.bindAttribute("scrollExpandCoordination", invalidateLayoutOnChange: false, withIntBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.scrollExpandCoordination = VRBSScrollCoordinationLevel.fromWireValue(value)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.scrollExpandCoordination = .handoff
        })

        attributesBinder.bindAttribute("scrollCollapseCoordination", invalidateLayoutOnChange: false, withIntBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.scrollCollapseCoordination = VRBSScrollCoordinationLevel.fromWireValue(value)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.scrollCollapseCoordination = .handoff
        })

        attributesBinder.bindAttribute("settleDuration", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.settleDurationSeconds = value > 0 ? value : VRBSMath.defaultSettleDurationSeconds
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.settleDurationSeconds = VRBSMath.defaultSettleDurationSeconds
        })

        attributesBinder.bindAttribute("hasCloseRequestHandler", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.hasCloseRequestHandler = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.hasCloseRequestHandler = false
        })

        attributesBinder.bindAttribute("scrimColorArgb", invalidateLayoutOnChange: false, withIntBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.setScrimColorArgb(Int32(truncatingIfNeeded: value))
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.setScrimColorArgb(0x52000000)
        })

        attributesBinder.bindAttribute("scrimAccessibilityLabel", invalidateLayoutOnChange: false, withStringBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.hostingView.setScrimAccessibilityLabel(value ?? "Close sheet")
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.setScrimAccessibilityLabel("Close sheet")
        })

        attributesBinder.bindAttribute("surfaceCornerRadii", invalidateLayoutOnChange: false, withArrayBlock: { view, array, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.applyCornerRadii(array)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.applyCornerRadii(nil)
        })

        attributesBinder.bindAttribute("surfaceCornerCurve", invalidateLayoutOnChange: false, withStringBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.applyCornerCurve(value)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.applyCornerCurve(nil)
        })

        attributesBinder.bindAttribute("surfaceShadows", invalidateLayoutOnChange: false, withArrayBlock: { view, array, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            v.applySurfaceShadows(array)
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.applySurfaceShadows(nil)
        })

        attributesBinder.bindAttribute("surfaceElevation", invalidateLayoutOnChange: false, withDouble: { _, _, _ in
            // Android-only elevation prop; iOS uses surfaceShadows.
            true
        }, resetBlock: { _, _ in })

        attributesBinder.bindAttribute("surfaceShadowColorArgb", invalidateLayoutOnChange: false, withIntBlock: { _, _, _ in
            true
        }, resetBlock: { _, _ in })

        attributesBinder.bindAttribute("committedContentRegionInset", invalidateLayoutOnChange: false, withUntypedBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            if let num = value as? NSNumber {
                v.hostingView.committedContentRegionInset = CGFloat(num.doubleValue)
            } else {
                v.hostingView.committedContentRegionInset = nil
            }
            return true
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.hostingView.committedContentRegionInset = nil
        })

        attributesBinder.bindAttribute("onNativeGeometry", withFunctionBlock: { view, fn in
            (view as? VRBottomSheetView)?.onNativeGeometry = fn
        }, resetBlock: { view in
            (view as? VRBottomSheetView)?.onNativeGeometry = nil
        })

        attributesBinder.bindAttribute("onNativeIndexChange", withFunctionBlock: { view, fn in
            (view as? VRBottomSheetView)?.onNativeIndexChange = fn
        }, resetBlock: { view in
            (view as? VRBottomSheetView)?.onNativeIndexChange = nil
        })

        attributesBinder.bindAttribute("onNativeSettle", withFunctionBlock: { view, fn in
            (view as? VRBottomSheetView)?.onNativeSettle = fn
        }, resetBlock: { view in
            (view as? VRBottomSheetView)?.onNativeSettle = nil
        })

        attributesBinder.bindAttribute("onNativePositionChange", withFunctionBlock: { view, fn in
            (view as? VRBottomSheetView)?.onNativePositionChange = fn
        }, resetBlock: { view in
            (view as? VRBottomSheetView)?.onNativePositionChange = nil
        })

        attributesBinder.bindAttribute("onNativeCloseRequest", withFunctionBlock: { view, fn in
            (view as? VRBottomSheetView)?.onNativeCloseRequest = fn
        }, resetBlock: { view in
            (view as? VRBottomSheetView)?.onNativeCloseRequest = nil
        })
    }
}
