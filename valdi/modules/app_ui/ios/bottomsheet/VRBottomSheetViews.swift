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

    private var onNativeGeometry: (any SCValdiFunction)? {
        didSet {
            if onNativeGeometry != nil {
                hostingView.replayGeometryIfAvailable()
            }
        }
    }
    private var onNativeIndexChange: (any SCValdiFunction)?
    private var onNativeSettle: (any SCValdiFunction)?
    private var onNativePositionChange: (any SCValdiFunction)?
    private var onNativeCloseRequest: (any SCValdiFunction)?

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
            SCValdiMarshallerPushDouble(marshaller, Double(self.hostingView.bounds.width))
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
        onNativeGeometry = nil
        onNativeIndexChange = nil
        onNativeSettle = nil
        onNativePositionChange = nil
        onNativeCloseRequest = nil
        resetConfig()
    }

    // ---- Typed Config Application ----

    private func applyConfigUntyped(_ value: Any?) -> Bool {
        guard let config = try? VRWheelObjectBinding.decode(value, as: VRBottomSheetConfig.self) as? VRBottomSheetConfig else {
            resetConfig()
            return false
        }
        applyConfig(config)
        return true
    }

    private func applyConfig(_ config: VRBottomSheetConfig) {
        windowOverlay = config.windowOverlay
        openOrder = Int(config.openOrder)
        hostingView.animateIn = config.animateIn
        hostingView.animateContentHeight = config.animateContentHeight
        hostingView.modal = config.modal
        hostingView.scrollExpandCoordination = VRBSScrollCoordinationLevel.fromWireValue(Int(config.scrollExpandCoordination))
        hostingView.scrollCollapseCoordination = VRBSScrollCoordinationLevel.fromWireValue(Int(config.scrollCollapseCoordination))
        hostingView.settleDurationSeconds = config.settleDuration > 0
            ? CGFloat(config.settleDuration)
            : VRBSMath.defaultSettleDurationSeconds
        hostingView.hasCloseRequestHandler = config.hasCloseRequestHandler
        hostingView.setScrimColorArgb(Int32(truncatingIfNeeded: Int64(config.scrimColorArgb)))
        hostingView.setScrimAccessibilityLabel(config.scrimAccessibilityLabel)

        let radii = config.surfaceCornerRadii.map { CGFloat($0.doubleValue) }
        hostingView.setSurfaceCornerStyle(radii: radii, curveString: config.surfaceCornerCurve.rawValue)

        let shadows: [VRBSCardShadow] = config.surfaceShadows.compactMap { shadow in
            let opacity = Float(shadow.opacity)
            guard opacity > 0 else { return nil }
            return VRBSCardShadow(
                offsetX: CGFloat(shadow.offsetX),
                offsetY: CGFloat(shadow.offsetY),
                blurRadius: CGFloat(shadow.blurRadius),
                spreadDistance: CGFloat(shadow.spreadDistance),
                colorArgb: Int32(truncatingIfNeeded: Int64(shadow.colorArgb)),
                opacity: opacity,
                excludesInterior: shadow.excludesInterior
            )
        }
        hostingView.setSurfaceShadows(shadows)

        hostingView.committedContentRegionInset = config.committedContentRegionInset.map { CGFloat($0.doubleValue) }

        let detents: [VRBSRawDetentSpec] = config.detents.map { item in
            let kind = VRBSDetentKind(rawValue: item.kind.rawValue) ?? .points
            return VRBSRawDetentSpec(
                value: CGFloat(item.value),
                kind: kind,
                programmatic: item.programmatic,
                usesStatusBarTopInset: item.usesStatusBarTopInset,
                insetTop: CGFloat(item.insetTop),
                insetLeft: CGFloat(item.insetLeft),
                insetRight: CGFloat(item.insetRight),
                insetBottom: CGFloat(item.insetBottom),
                widestCard: item.widestCard,
                maxWidth: CGFloat(item.maxWidth),
                placementBias: CGFloat(item.placementBias),
                scrimOpacity: CGFloat(item.scrimOpacity)
            )
        }
        hostingView.setRawDetents(detents)
        hostingView.setRequestedIndex(Int(config.detentIndex))
        syncHostPlacement()
    }

    private func resetConfig() {
        if let overlay = hostingView.superview as? VRBottomSheetOverlayContainerView {
            overlay.detach(hostingView)
        }
        if hostingView.superview !== self {
            hostingView.frame = bounds
            addSubview(hostingView)
        }
        windowOverlay = false
        openOrder = 0
        hostingView.resetForRecycling()
        hostingView.animateIn = true
        hostingView.animateContentHeight = true
        hostingView.modal = false
        hostingView.scrollExpandCoordination = .handoff
        hostingView.scrollCollapseCoordination = .handoff
        hostingView.settleDurationSeconds = VRBSMath.defaultSettleDurationSeconds
        hostingView.hasCloseRequestHandler = false
        hostingView.setScrimColorArgb(0x52000000)
        hostingView.setScrimAccessibilityLabel("Close sheet")
        hostingView.setSurfaceCornerStyle(radii: [0, 0, 0, 0], curveString: "circular")
        hostingView.setSurfaceShadows([])
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("config", invalidateLayoutOnChange: false, withUntypedBlock: { view, value, _ in
            guard let v = view as? VRBottomSheetView else { return false }
            return v.applyConfigUntyped(value)
        }, resetBlock: { view, _ in
            (view as? VRBottomSheetView)?.resetConfig()
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
