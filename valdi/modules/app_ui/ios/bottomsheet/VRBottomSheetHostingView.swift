import UIKit

/// Clips Valdi sheet children (`VRBottomSheetSurfaceView`, `VRBottomSheetContentWrapperView`)
/// to the dynamic card rectangle and per-corner radii while keeping full container bounds so
/// Valdi's Yoga child layout coordinates remain unshifted.
final class VRBottomSheetCardClipView: UIView {
    private var cardRect: CGRect = .zero
    private var cornerRadii: [CGFloat] = [0, 0, 0, 0]
    private var cornerCurve: CALayerCornerCurve = .circular
    private var clipsToCard: Bool = false

    private let rectMaskLayer = CALayer()
    private let pathMaskLayer = CAShapeLayer()

    var onSubviewHierarchyChanged: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false
        rectMaskLayer.backgroundColor = UIColor.black.cgColor
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }

    override func didAddSubview(_ subview: UIView) {
        super.didAddSubview(subview)
        onSubviewHierarchyChanged?()
    }

    override func willRemoveSubview(_ subview: UIView) {
        super.willRemoveSubview(subview)
        guard let handler = onSubviewHierarchyChanged else { return }
        DispatchQueue.main.async {
            handler()
        }
    }

    func updateStyle(radii: [CGFloat], curve: CALayerCornerCurve, clipsToCard: Bool) {
        let safeRadii = (0..<4).map { idx in max(0, idx < radii.count ? radii[idx] : 0) }
        guard safeRadii != cornerRadii || curve != cornerCurve || clipsToCard != self.clipsToCard else {
            return
        }
        cornerRadii = safeRadii
        cornerCurve = curve
        self.clipsToCard = clipsToCard
        applyMask()
    }

    func updateCardRect(_ rect: CGRect) {
        guard rect != cardRect else { return }
        cardRect = rect
        applyMask()
    }

    var currentCardRect: CGRect { cardRect }

    func cardContains(_ point: CGPoint) -> Bool {
        guard cardRect.width > 0, cardRect.height > 0, cardRect.contains(point) else { return false }
        let limit = min(cardRect.width, cardRect.height) * 0.5
        let tl = min(cornerRadii[0], limit)
        let tr = min(cornerRadii[1], limit)
        let br = min(cornerRadii[2], limit)
        let bl = min(cornerRadii[3], limit)
        if tl == 0 && tr == 0 && br == 0 && bl == 0 { return true }

        let x = point.x
        let y = point.y
        if x < cardRect.minX + tl && y < cardRect.minY + tl {
            return inCircle(x: x, y: y, cx: cardRect.minX + tl, cy: cardRect.minY + tl, r: tl)
        }
        if x > cardRect.maxX - tr && y < cardRect.minY + tr {
            return inCircle(x: x, y: y, cx: cardRect.maxX - tr, cy: cardRect.minY + tr, r: tr)
        }
        if x > cardRect.maxX - br && y > cardRect.maxY - br {
            return inCircle(x: x, y: y, cx: cardRect.maxX - br, cy: cardRect.maxY - br, r: br)
        }
        if x < cardRect.minX + bl && y > cardRect.maxY - bl {
            return inCircle(x: x, y: y, cx: cardRect.minX + bl, cy: cardRect.maxY - bl, r: bl)
        }
        return true
    }

    private func inCircle(x: CGFloat, y: CGFloat, cx: CGFloat, cy: CGFloat, r: CGFloat) -> Bool {
        let dx = x - cx
        let dy = y - cy
        return dx * dx + dy * dy <= r * r
    }

    private func applyMask() {
        let hasRadii = cornerRadii.contains { $0 > 0 }
        guard hasRadii || clipsToCard else {
            if layer.mask != nil { layer.mask = nil }
            return
        }
        guard cardRect.width > 0, cardRect.height > 0 else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            rectMaskLayer.frame = .zero
            if layer.mask !== rectMaskLayer { layer.mask = rectMaskLayer }
            CATransaction.commit()
            return
        }

        let tl = cornerRadii[0]
        let tr = cornerRadii[1]
        let br = cornerRadii[2]
        let bl = cornerRadii[3]

        let nonzero = cornerRadii.filter { $0 > 0 }
        let singleRadiusValue = nonzero.first ?? 0
        let canUseFastMaskLayer = !hasRadii || nonzero.allSatisfy { abs($0 - singleRadiusValue) < 0.01 }

        if canUseFastMaskLayer {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            rectMaskLayer.frame = cardRect
            let limit = min(cardRect.width, cardRect.height) * 0.5
            rectMaskLayer.cornerRadius = hasRadii ? min(singleRadiusValue, limit) : 0
            rectMaskLayer.cornerCurve = cornerCurve
            var masked: CACornerMask = []
            if tl > 0 { masked.insert(.layerMinXMinYCorner) }
            if tr > 0 { masked.insert(.layerMaxXMinYCorner) }
            if br > 0 { masked.insert(.layerMaxXMaxYCorner) }
            if bl > 0 { masked.insert(.layerMinXMaxYCorner) }
            rectMaskLayer.maskedCorners = masked
            if layer.mask !== rectMaskLayer { layer.mask = rectMaskLayer }
            CATransaction.commit()
        } else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            pathMaskLayer.path = VRBSRoundedRectCGPath(rect: cardRect, radii: cornerRadii)
            if layer.mask !== pathMaskLayer { layer.mask = pathMaskLayer }
            CATransaction.commit()
        }
    }
}

func VRBSRoundedRectCGPath(rect: CGRect, radii: [CGFloat]) -> CGPath {
    guard rect.width > 0, rect.height > 0 else { return CGPath(rect: .zero, transform: nil) }
    let limit = min(rect.width, rect.height) * 0.5
    let tl = min(max(0, radii.count > 0 ? radii[0] : 0), limit)
    let tr = min(max(0, radii.count > 1 ? radii[1] : 0), limit)
    let br = min(max(0, radii.count > 2 ? radii[2] : 0), limit)
    let bl = min(max(0, radii.count > 3 ? radii[3] : 0), limit)

    let path = CGMutablePath()
    path.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
    if tr > 0 {
        path.addArc(
            center: CGPoint(x: rect.maxX - tr, y: rect.minY + tr),
            radius: tr,
            startAngle: -.pi * 0.5,
            endAngle: 0,
            clockwise: false
        )
    }
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
    if br > 0 {
        path.addArc(
            center: CGPoint(x: rect.maxX - br, y: rect.maxY - br),
            radius: br,
            startAngle: 0,
            endAngle: .pi * 0.5,
            clockwise: false
        )
    }
    path.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
    if bl > 0 {
        path.addArc(
            center: CGPoint(x: rect.minX + bl, y: rect.maxY - bl),
            radius: bl,
            startAngle: .pi * 0.5,
            endAngle: .pi,
            clockwise: false
        )
    }
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
    if tl > 0 {
        path.addArc(
            center: CGPoint(x: rect.minX + tl, y: rect.minY + tl),
            radius: tl,
            startAngle: .pi,
            endAngle: -.pi * 0.5,
            clockwise: false
        )
    }
    path.closeSubpath()
    return path
}

// MARK: - Core iOS Sheet Hosting View

final class VRBottomSheetHostingView: UIView, UIGestureRecognizerDelegate {
    private enum PanMode {
        case undecided
        case sheet
        case scroll
    }

    // ---- Callbacks ----
    var onGeometryChanged: ((_ width: Double, _ height: Double, _ surfaceHeight: Double, _ inset: Double) -> Void)?
    var onIndexChanged: ((Int) -> Void)?
    var onSettleChanged: ((Int) -> Void)?
    var onPositionChanged: ((_ position: Double, _ fractionalIndex: Double) -> Void)?
    var onCloseRequest: (() -> Void)?
    var onPresentationChanged: (() -> Void)?

    // ---- Public Props ----
    var openOrder: Int = 0
    var animateIn: Bool = true
    var animateContentHeight: Bool = true
    var modal: Bool = false {
        didSet {
            guard modal != oldValue else { return }
            syncVisualsForCurrentOffset()
            syncAccessibility()
            onPresentationChanged?()
        }
    }
    var hasCloseRequestHandler: Bool = false {
        didSet {
            guard hasCloseRequestHandler != oldValue else { return }
            syncAccessibility()
            onPresentationChanged?()
        }
    }
    var dismissible: Bool = true {
        didSet {
            guard dismissible != oldValue else { return }
            syncAccessibility()
            if !dismissible && isDraggingSheet {
                sheetPanGesture.isEnabled = false
                sheetPanGesture.isEnabled = true
            }
        }
    }
    var interactionEnabled: Bool = true {
        didSet {
            guard interactionEnabled != oldValue else { return }
            if !interactionEnabled && isDraggingSheet {
                sheetPanGesture.isEnabled = false
                sheetPanGesture.isEnabled = true
            }
        }
    }
    var scrollExpandCoordination: VRBSScrollCoordinationLevel = .handoff
    var scrollCollapseCoordination: VRBSScrollCoordinationLevel = .handoff
    var settleDurationSeconds: CGFloat = VRBSMath.defaultSettleDurationSeconds
    var committedContentRegionInset: CGFloat? {
        didSet {
            guard committedContentRegionInset != oldValue else { return }
            syncVisualsForCurrentOffset()
        }
    }

    // ---- Internal State ----
    private var rawDetents: [VRBSRawDetentSpec] = []
    private var resolvedDetents: [VRBSDetentSpec] = []
    private var requestedIndex: Int = -1
    private var currentTargetIndex: Int = -1
    private var lastReportedIndex: Int = -1
    private var hasInitializedPresentation: Bool = false
    private var sawOpenRequestBeforeInit: Bool = false

    private var containerSize: CGSize = .zero
    private var measuredNaturalContentHeight: CGFloat = 0
    private var hasMeasuredContentHeight: Bool = false

    private var sheetOffsetY: CGFloat = 0
    private var activeSpring: VRBSCriticalSpring?
    private var activeSpringTargetIndex: Int = -1
    private var displayLink: CADisplayLink?

    private var cornerRadii: [CGFloat] = [0, 0, 0, 0]
    private var cornerCurve: CALayerCornerCurve = .circular
    private var cardShadows: [VRBSCardShadow] = []
    private var shadowLayers: [CALayer] = []
    private var shadowMaskLayers: [CAShapeLayer] = []

    private var scrimBaseColor: UIColor = VRBSColorFromArgb(0x52000000)
    private var lastGeometryTuple: (CGFloat, CGFloat, CGFloat, CGFloat)?
    private var lastPositionTuple: (CGFloat, CGFloat)?

    // ---- Subviews ----
    private let scrimView = UIView()
    private let scrimAccessibilityView = VRBottomSheetScrimAccessibilityView()
    private let shadowHostView = UIView()
    let sheetContainer = UIView()
    let clipContainer = VRBottomSheetCardClipView()

    private weak var markerView: VRBottomSheetMarkerView?

    // ---- Gestures & Scroll Coordination ----
    private var sheetPanGesture: VRBSSheetPanGestureRecognizer!
    private var scrimTapGesture: UITapGestureRecognizer!
    private var isDraggingSheet: Bool = false
    private var panMode: PanMode = .undecided
    private weak var coordinatedScrollView: UIScrollView?
    private var pinnedContentOffsetY: CGFloat = 0
    private var savedShowsVerticalIndicator: Bool?
    private var lastPanTranslationY: CGFloat = 0
    private var didCancelChildTouchesForCurrentDrag: Bool = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false

        scrimView.backgroundColor = scrimBaseColor
        scrimView.alpha = 0
        scrimView.isHidden = true
        addSubview(scrimView)

        scrimAccessibilityView.onActivate = { [weak self] in
            self?.handleDismissTrigger()
        }
        addSubview(scrimAccessibilityView)

        shadowHostView.backgroundColor = .clear
        shadowHostView.isUserInteractionEnabled = false
        addSubview(shadowHostView)

        sheetContainer.backgroundColor = .clear
        sheetContainer.clipsToBounds = false
        sheetContainer.addSubview(clipContainer)
        addSubview(sheetContainer)

        clipContainer.onSubviewHierarchyChanged = { [weak self] in
            self?.refreshSpecialDescendants()
        }

        let pan = VRBSSheetPanGestureRecognizer(target: self, action: #selector(handleSheetPan(_:)))
        pan.delegate = self
        pan.cancelsTouchesInView = false
        pan.delaysTouchesBegan = false
        pan.delaysTouchesEnded = false
        sheetContainer.addGestureRecognizer(pan)
        sheetPanGesture = pan

        let scrimTap = UITapGestureRecognizer(target: self, action: #selector(handleScrimTap(_:)))
        scrimTap.delegate = self
        scrimTap.cancelsTouchesInView = false
        addGestureRecognizer(scrimTap)
        scrimTapGesture = scrimTap
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        clipContainer.onSubviewHierarchyChanged = nil
        scrimAccessibilityView.onActivate = nil
        stopSpring()
    }

    func setScrimColor(_ color: UIColor) {
        scrimBaseColor = color
        scrimView.backgroundColor = color
        syncVisualsForCurrentOffset()
    }

    // ---- Descendant Discovery (`VRBottomSheetContentWrapperView`, `VRBottomSheetMarkerView`) ----

    func refreshSpecialDescendants() {
        var foundMarker: VRBottomSheetMarkerView?

        for sub in clipContainer.subviews {
            if let c = sub as? VRBottomSheetContentWrapperView {
                c.onSubviewHierarchyChanged = { [weak self] in
                    self?.refreshSpecialDescendants()
                }
                for inner in c.subviews {
                    if let m = inner as? VRBottomSheetMarkerView {
                        foundMarker = m
                    }
                }
            }
        }

        if markerView !== foundMarker {
            markerView?.onMarkerTopChanged = nil
            markerView = foundMarker
            foundMarker?.onMarkerTopChanged = { [weak self] naturalTop in
                self?.onNaturalContentHeightMeasured(naturalTop)
            }
            if let m = foundMarker, m.bounds.width > 0 || m.frame.minY > 0 {
                onNaturalContentHeightMeasured(max(0, m.frame.minY))
            }
        }
        syncVisualsForCurrentOffset()
    }

    private func onNaturalContentHeightMeasured(_ height: CGFloat) {
        let hadMeasurement = hasMeasuredContentHeight
        if hadMeasurement && abs(height - measuredNaturalContentHeight) < 0.25 { return }
        measuredNaturalContentHeight = max(0, height)
        hasMeasuredContentHeight = true
        if rawDetents.contains(where: { $0.kind == .content }) && containerSize.height > 0 {
            recomputeDetentsAndSync(animateResize: hadMeasurement && animateContentHeight && isPresented)
        }
    }

    // ---- Prop Setters ----

    func setRawDetents(_ specs: [VRBSRawDetentSpec]) {
        guard specs != rawDetents else { return }
        rawDetents = specs
        if containerSize.height > 0 {
            recomputeDetentsAndSync(animateResize: hasInitializedPresentation && animateContentHeight && isPresented)
        }
    }

    func setRequestedIndex(_ index: Int, animated: Bool = true) {
        let clamped = clampRequestedIndex(index)
        if !hasInitializedPresentation && clamped >= 0 {
            sawOpenRequestBeforeInit = true
        }
        if !animated && hasInitializedPresentation {
            requestedIndex = clamped
            if containerSize.height > 0 {
                snapToIndex(clamped, initialVelocity: 0, animated: false, emitIndexCallback: false)
            }
            return
        }
        if clamped == requestedIndex && hasInitializedPresentation { return }
        requestedIndex = clamped
        guard containerSize.height > 0 else { return }

        if !hasInitializedPresentation {
            let prevAnimateIn = animateIn
            if !animated { animateIn = false }
            recomputeDetentsAndSync(animateResize: false)
            animateIn = prevAnimateIn
            return
        }
        if clamped != currentTargetIndex || (activeSpring == nil && !isDraggingSheet && abs(targetOffset(for: clamped) - sheetOffsetY) > 0.5) {
            snapToIndex(clamped, initialVelocity: 0, animated: animated, emitIndexCallback: false)
        }
    }

    func setScrimColorArgb(_ argb: Int32) {
        setScrimColor(VRBSColorFromArgb(argb))
    }

    func setScrimAccessibilityLabel(_ label: String) {
        scrimAccessibilityView.accessibilityLabel = label.isEmpty ? "Close sheet" : label
    }

    func setSurfaceCornerStyle(radii: [CGFloat], curveString: String) {
        let safeRadii = (0..<4).map { i in max(0, i < radii.count ? radii[i] : 0) }
        let nextCurve: CALayerCornerCurve = (curveString == "continuous") ? .continuous : .circular
        guard safeRadii != cornerRadii || nextCurve != cornerCurve else { return }
        cornerRadii = safeRadii
        cornerCurve = nextCurve
        syncVisualsForCurrentOffset()
    }

    func setSurfaceShadows(_ shadows: [VRBSCardShadow]) {
        guard shadows != cardShadows else { return }
        cardShadows = shadows
        rebuildShadowLayers()
        syncVisualsForCurrentOffset()
    }

    private func rebuildShadowLayers() {
        shadowLayers.forEach { $0.removeFromSuperlayer() }
        shadowLayers.removeAll()
        shadowMaskLayers.removeAll()

        for shadow in cardShadows where shadow.opacity > 0 {
            let layer = CALayer()
            layer.shadowColor = shadow.uiColor.cgColor
            var baseAlpha: CGFloat = 1
            shadow.uiColor.getRed(nil, green: nil, blue: nil, alpha: &baseAlpha)
            layer.shadowOpacity = Float(baseAlpha) * shadow.opacity
            layer.shadowOffset = CGSize(width: shadow.offsetX, height: shadow.offsetY)
            layer.shadowRadius = max(0, shadow.blurRadius * 0.5)
            shadowHostView.layer.addSublayer(layer)
            shadowLayers.append(layer)

            let maskLayer = CAShapeLayer()
            maskLayer.fillRule = .evenOdd
            if shadow.excludesInterior {
                layer.mask = maskLayer
            }
            shadowMaskLayers.append(maskLayer)
        }
    }

    // ---- Queries & Hit Testing ----

    var openHeight: CGFloat {
        max(0, containerSize.height - sheetOffsetY)
    }

    var isAnimating: Bool {
        activeSpring != nil
    }

    var isPresented: Bool {
        containerSize.height > 0 && (currentTargetIndex >= 0 || openHeight > 0.5)
    }

    var isModalPresented: Bool {
        modal && isPresented
    }

    var interceptsCloseOrEscape: Bool {
        isPresented && hasCloseRequestHandler
    }

    private var canUserDismissOrRequestClose: Bool {
        dismissible && (modal || hasCloseRequestHandler)
    }

    func isPointInteractive(_ point: CGPoint) -> Bool {
        guard isPresented else { return false }
        if isPointInPresentedCard(point) { return true }
        return modal && !scrimView.isHidden && scrimView.alpha > 0.001
    }

    func isPointInPresentedCard(_ point: CGPoint) -> Bool {
        guard isPresented else { return false }
        let local = CGPoint(x: point.x, y: point.y - sheetOffsetY)
        return clipContainer.cardContains(local)
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        isPointInteractive(point)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, interactionEnabled, !isHidden, alpha > 0.01, isPointInteractive(point) else {
            return nil
        }
        let localInSheet = CGPoint(x: point.x, y: point.y - sheetOffsetY)
        if clipContainer.cardContains(localInSheet) {
            if let hit = clipContainer.hitTest(localInSheet, with: event) {
                return hit
            }
            return sheetContainer
        }
        if modal && !scrimView.isHidden && scrimView.alpha > 0.001 {
            return self
        }
        return nil
    }

    // ---- Accessibility ----

    override func accessibilityPerformEscape() -> Bool {
        guard isPresented, canUserDismissOrRequestClose else { return false }
        handleDismissTrigger()
        return true
    }

    private func syncAccessibility() {
        let activeModal = modal && isPresented
        accessibilityViewIsModal = activeModal
        scrimAccessibilityView.isAccessibilityElement = activeModal && canUserDismissOrRequestClose
        sheetContainer.accessibilityElementsHidden = !isPresented
    }

    // ---- Layout & Detent Resolution ----

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        if containerSize.height > 0 && rawDetents.contains(where: { $0.usesStatusBarTopInset }) {
            recomputeDetentsAndSync(animateResize: false)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let size = bounds.size
        scrimView.frame = bounds
        scrimAccessibilityView.frame = bounds
        shadowHostView.frame = bounds

        let sizeChanged = size != containerSize
        containerSize = size

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        sheetContainer.bounds = CGRect(origin: .zero, size: size)
        sheetContainer.center = CGPoint(x: size.width * 0.5, y: size.height * 0.5 + sheetOffsetY)
        clipContainer.frame = CGRect(origin: .zero, size: size)
        CATransaction.commit()

        refreshSpecialDescendants()

        if size.width > 0 && size.height > 0 && (sizeChanged || !hasInitializedPresentation) {
            recomputeDetentsAndSync(animateResize: false)
        } else if sizeChanged {
            syncVisualsForCurrentOffset()
        }
    }

    private func currentStatusBarTopInset() -> CGFloat {
        if let sbHeight = window?.windowScene?.statusBarManager?.statusBarFrame.height, sbHeight > 0 {
            return max(sbHeight, safeAreaInsets.top)
        }
        return safeAreaInsets.top
    }

    private func recomputeDetentsAndSync(animateResize: Bool) {
        guard containerSize.width > 0, containerSize.height > 0 else { return }
        let statusTop = currentStatusBarTopInset()

        resolvedDetents = rawDetents.map { raw in
            let topInset = raw.usesStatusBarTopInset ? statusTop : max(0, raw.insetTop)
            let bottomInset = max(0, raw.insetBottom)
            let leftInset = max(0, raw.insetLeft)
            let rightInset = max(0, raw.insetRight)
            let availableCardHeight = max(0, containerSize.height - topInset - bottomInset)

            let rawCardHeight: CGFloat
            switch raw.kind {
            case .points:
                rawCardHeight = raw.value
            case .percentage:
                rawCardHeight = raw.value * availableCardHeight
            case .content:
                rawCardHeight = hasMeasuredContentHeight ? measuredNaturalContentHeight : 0
            }
            let clampedHeight = min(availableCardHeight, max(0, rawCardHeight))
            return VRBSDetentSpec(
                height: clampedHeight,
                programmatic: raw.programmatic,
                insets: VRBSDetentInsets(left: leftInset, right: rightInset, bottom: bottomInset),
                scrimOpacity: raw.scrimOpacity
            )
        }

        emitGeometryIfNeeded(statusTop: statusTop)

        let desired = clampRequestedIndex(requestedIndex)
        if !hasInitializedPresentation {
            if desired >= 0 {
                sawOpenRequestBeforeInit = true
            }
            let waitingForContent = desired >= 0 &&
                desired < rawDetents.count &&
                rawDetents[desired].kind == .content &&
                !hasMeasuredContentHeight

            if waitingForContent {
                sheetOffsetY = containerSize.height
                currentTargetIndex = -1
                syncVisualsForCurrentOffset()
                return
            }

            let notifyPreInitCancel = desired < 0 && sawOpenRequestBeforeInit
            sawOpenRequestBeforeInit = false
            hasInitializedPresentation = true
            currentTargetIndex = desired
            lastReportedIndex = desired

            if desired >= 0 && animateIn {
                sheetOffsetY = containerSize.height
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?()
                startSpring(to: targetOffset(for: desired), initialVelocity: 0, targetIndex: desired)
            } else {
                sheetOffsetY = targetOffset(for: desired)
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?()
                emitPositionIfNeeded()
                if notifyPreInitCancel {
                    onSettleChanged?(desired)
                }
            }
            return
        }

        currentTargetIndex = desired
        let newOffset = targetOffset(for: desired)
        if isDraggingSheet {
            syncVisualsForCurrentOffset()
            emitPositionIfNeeded()
        } else if animateResize || activeSpring != nil {
            startSpring(to: newOffset, initialVelocity: 0, targetIndex: desired)
        } else {
            stopSpring()
            sheetOffsetY = newOffset
            syncVisualsForCurrentOffset()
            emitPositionIfNeeded()
        }
    }

    private func emitGeometryIfNeeded(statusTop: CGFloat) {
        guard containerSize.width > 0, containerSize.height > 0 else { return }
        let widestRaw = rawDetents.first(where: { $0.widestCard }) ?? rawDetents.first
        let widestInset = widestRaw.map { min($0.insetLeft, $0.insetRight) } ?? 0
        let widestLeft = widestRaw?.insetLeft ?? 0
        let widestRight = widestRaw?.insetRight ?? 0
        let contentRegionWidth = max(0, containerSize.width - widestLeft - widestRight)

        let maxAvailableForContent = rawDetents.map { raw -> CGFloat in
            let top = raw.usesStatusBarTopInset ? statusTop : max(0, raw.insetTop)
            return max(0, containerSize.height - top - max(0, raw.insetBottom))
        }.max() ?? containerSize.height

        let hasContentDetent = rawDetents.contains(where: { $0.kind == .content })
        let maxResolvedHeight = resolvedDetents.map(\.height).max() ?? 0
        let contentRegionHeight = hasContentDetent ? maxAvailableForContent : maxResolvedHeight
        let surfaceHeight = containerSize.height

        if let prev = lastGeometryTuple,
           abs(prev.0 - contentRegionWidth) < 0.01,
           abs(prev.1 - contentRegionHeight) < 0.01,
           abs(prev.2 - surfaceHeight) < 0.01,
           abs(prev.3 - widestInset) < 0.01 {
            return
        }
        lastGeometryTuple = (contentRegionWidth, contentRegionHeight, surfaceHeight, widestInset)
        onGeometryChanged?(
            Double(contentRegionWidth),
            Double(contentRegionHeight),
            Double(surfaceHeight),
            Double(widestInset)
        )
    }

    // ---- Spring & Visual Synchronization ----

    func dismissModalByUser() {
        guard modal else { return }
        snapToIndex(-1, initialVelocity: 0, animated: true, emitIndexCallback: true)
    }

    func emitCloseRequestFromSystem() {
        onCloseRequest?()
    }

    private func handleDismissTrigger() {
        guard isPresented else { return }
        if hasCloseRequestHandler {
            onCloseRequest?()
        } else if modal {
            snapToIndex(-1, initialVelocity: 0, animated: true, emitIndexCallback: true)
        }
    }

    private func settleFromRelease(velocityYPointsPerSec: CGFloat) {
        guard !resolvedDetents.isEmpty else { return }
        let releaseIndex = VRBSMath.resolveReleaseTargetIndex(
            detents: resolvedDetents,
            currentOpenHeight: openHeight,
            velocityYPointsPerSec: velocityYPointsPerSec,
            canDismissOrClose: canUserDismissOrRequestClose
        )

        if releaseIndex == -1 && hasCloseRequestHandler {
            onCloseRequest?()
            if requestedIndex < 0 {
                snapToIndex(-1, initialVelocity: velocityYPointsPerSec, animated: true, emitIndexCallback: false)
                return
            }
            let bounceIndex = resolvedDetents.firstIndex(where: { !$0.programmatic }) ?? 0
            snapToIndex(
                bounceIndex,
                initialVelocity: velocityYPointsPerSec,
                animated: true,
                emitIndexCallback: bounceIndex != lastReportedIndex
            )
            return
        }

        let finalIndex: Int
        if releaseIndex == -1 && !modal {
            finalIndex = resolvedDetents.firstIndex(where: { !$0.programmatic }) ?? 0
        } else {
            finalIndex = releaseIndex
        }
        snapToIndex(finalIndex, initialVelocity: velocityYPointsPerSec, animated: true, emitIndexCallback: true)
    }

    private func snapToIndex(
        _ index: Int,
        initialVelocity: CGFloat,
        animated: Bool,
        emitIndexCallback: Bool
    ) {
        let clamped = clampRequestedIndex(index)
        let prevPresented = isPresented
        currentTargetIndex = clamped
        requestedIndex = clamped

        if emitIndexCallback && clamped != lastReportedIndex {
            lastReportedIndex = clamped
            onIndexChanged?(clamped)
        } else {
            lastReportedIndex = clamped
        }

        let target = targetOffset(for: clamped)
        if !animated || abs(target - sheetOffsetY) < 0.5 {
            stopSpring()
            setSheetOffsetYInternal(target)
            if isPresented != prevPresented {
                syncAccessibility()
                onPresentationChanged?()
            }
            onSettleChanged?(clamped)
            return
        }

        if isPresented != prevPresented {
            syncAccessibility()
            onPresentationChanged?()
        }
        startSpring(to: target, initialVelocity: initialVelocity, targetIndex: clamped)
    }

    private func startSpring(to targetOffset: CGFloat, initialVelocity: CGFloat, targetIndex: Int) {
        activeSpringTargetIndex = targetIndex
        activeSpring = VRBSCriticalSpring(
            current: sheetOffsetY,
            target: targetOffset,
            initialVelocity: initialVelocity,
            settleDuration: settleDurationSeconds
        )
        if displayLink == nil {
            let link = CADisplayLink(target: self, selector: #selector(handleDisplayLink(_:)))
            if #available(iOS 15.0, *) {
                link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
            }
            link.add(to: .main, forMode: .common)
            displayLink = link
        }
    }

    private func stopSpring() {
        activeSpring = nil
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func handleDisplayLink(_ link: CADisplayLink) {
        guard let spring = activeSpring else {
            stopSpring()
            return
        }
        let step = spring.evaluate(at: link.targetTimestamp)
        setSheetOffsetYInternal(step.position)
        if step.settled {
            let settledIdx = activeSpringTargetIndex
            stopSpring()
            syncAccessibility()
            onPresentationChanged?()
            onSettleChanged?(settledIdx)
        }
    }

    private func setSheetOffsetYInternal(_ nextOffset: CGFloat) {
        sheetOffsetY = nextOffset
        syncVisualsForCurrentOffset()
        emitPositionIfNeeded()
    }

    private func syncVisualsForCurrentOffset() {
        guard containerSize.width > 0, containerSize.height > 0 else { return }

        let open = openHeight
        let insets = VRBSMath.interpolateInsets(detents: resolvedDetents, openHeight: open)
        let cardLeft = insets.left
        let cardRight = max(cardLeft, containerSize.width - insets.right)
        let cardHeight = max(0, open - insets.bottom)
        let cardRect = CGRect(x: cardLeft, y: 0, width: cardRight - cardLeft, height: cardHeight)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        sheetContainer.center = CGPoint(
            x: containerSize.width * 0.5,
            y: containerSize.height * 0.5 + sheetOffsetY
        )

        clipContainer.updateStyle(
            radii: cornerRadii,
            curve: cornerCurve,
            clipsToCard: insets.isInset || !cardShadows.isEmpty
        )
        clipContainer.updateCardRect(cardRect)

        // Shift surface and content horizontally relative to committedContentRegionInset without touching frame/Yoga!
        let horizontalDelta = committedContentRegionInset.map { cardLeft - $0 } ?? 0
        clipContainer.layer.sublayerTransform = horizontalDelta == 0
            ? CATransform3DIdentity
            : CATransform3DMakeTranslation(horizontalDelta, 0, 0)

        // Update outset/box shadows in shadowHostView:
        if !shadowLayers.isEmpty && open > 0.5 && cardHeight > 0.5 {
            shadowHostView.isHidden = false
            let screenCardRect = CGRect(
                x: cardLeft,
                y: sheetOffsetY,
                width: cardRight - cardLeft,
                height: cardHeight
            )
            for (idx, shadow) in cardShadows.filter({ $0.opacity > 0 }).enumerated() where idx < shadowLayers.count {
                let sLayer = shadowLayers[idx]
                sLayer.frame = bounds
                let spreadRect = screenCardRect.insetBy(dx: -shadow.spreadDistance, dy: -shadow.spreadDistance)
                let spreadRadii = cornerRadii.map { r in r > 0 ? max(0, r + shadow.spreadDistance) : 0 }
                sLayer.shadowPath = VRBSRoundedRectCGPath(rect: spreadRect, radii: spreadRadii)

                if shadow.excludesInterior {
                    let mLayer = shadowMaskLayers[idx]
                    mLayer.frame = bounds
                    let reach = max(bounds.width, bounds.height) * 2
                    let outer = bounds.insetBy(dx: -reach, dy: -reach)
                    let cutout = CGMutablePath()
                    cutout.addRect(outer)
                    cutout.addPath(VRBSRoundedRectCGPath(rect: screenCardRect, radii: cornerRadii))
                    mLayer.path = cutout
                }
            }
        } else {
            shadowHostView.isHidden = true
        }
        CATransaction.commit()

        if modal {
            let progress = VRBSMath.interpolateScrimOpacity(detents: resolvedDetents, openHeight: open)
            scrimView.alpha = progress
            scrimView.isHidden = progress <= 0.001
        } else {
            scrimView.alpha = 0
            scrimView.isHidden = true
        }
    }

    private func emitPositionIfNeeded() {
        guard let onPositionChanged, containerSize.height > 0, !resolvedDetents.isEmpty else { return }
        let open = openHeight
        let frac = VRBSMath.computeFractionalIndex(detents: resolvedDetents, openHeight: open)
        if let prev = lastPositionTuple, abs(prev.0 - open) < 0.01, abs(prev.1 - frac) < 0.0001 {
            return
        }
        lastPositionTuple = (open, frac)
        onPositionChanged(Double(open), Double(frac))
    }

    private func clampRequestedIndex(_ index: Int) -> Int {
        guard !rawDetents.isEmpty else { return -1 }
        let minIdx = modal ? -1 : 0
        return min(rawDetents.count - 1, max(minIdx, index))
    }

    private func targetOffset(for index: Int) -> CGFloat {
        guard index >= 0, !resolvedDetents.isEmpty else { return containerSize.height }
        let safeIdx = min(resolvedDetents.count - 1, max(0, index))
        return containerSize.height - resolvedDetents[safeIdx].totalHeight
    }

    private var canSheetExpandFurther: Bool {
        guard let last = resolvedDetents.last else { return false }
        return openHeight < last.totalHeight - 0.5
    }

    private var isAtRestingDetent: Bool {
        guard currentTargetIndex >= 0, currentTargetIndex < resolvedDetents.count else { return false }
        return abs(sheetOffsetY - targetOffset(for: currentTargetIndex)) <= 1.0
    }

    // ---- Gestures & Bidirectional UIScrollView Coordination ----

    @objc private func handleScrimTap(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended, interactionEnabled, canUserDismissOrRequestClose else { return }
        let pt = recognizer.location(in: self)
        if modal && isPresented && !isPointInPresentedCard(pt) {
            handleDismissTrigger()
        }
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard interactionEnabled else { return false }
        if gestureRecognizer === scrimTapGesture {
            let pt = gestureRecognizer.location(in: self)
            return modal && isPresented && canUserDismissOrRequestClose && !scrimView.isHidden && !isPointInPresentedCard(pt)
        }
        guard gestureRecognizer === sheetPanGesture else { return true }
        guard isPresented, !resolvedDetents.isEmpty else { return false }

        let ptInSelf = sheetPanGesture.location(in: self)
        guard isPointInPresentedCard(ptInSelf) else { return false }

        // Never steal vertical drags from native picker wheels (`UIPickerView`).
        let ptInClip = sheetPanGesture.location(in: clipContainer)
        if isTouchInsidePickerWheel(at: ptInClip, in: clipContainer) {
            return false
        }

        let velocity = sheetPanGesture.velocity(in: self)
        if abs(velocity.x) > abs(velocity.y) {
            return false
        }

        let scrollView = findInnermostVerticalScrollView(at: ptInClip, in: clipContainer)
        coordinatedScrollView = scrollView

        if let sv = scrollView, canScrollVertically(sv) {
            let draggingUp = velocity.y < 0
            let level = draggingUp ? scrollExpandCoordination : scrollCollapseCoordination
            let minOffsetY = -sv.adjustedContentInset.top
            let atTop = sv.contentOffset.y <= minOffsetY + 0.5

            switch level {
            case .none:
                coordinatedScrollView = nil
                return false
            case .initial:
                if draggingUp {
                    if atTop && canSheetExpandFurther {
                        sv.panGestureRecognizer.state = .cancelled
                        coordinatedScrollView = nil
                        panMode = .sheet
                        return true
                    }
                    coordinatedScrollView = nil
                    return false
                } else {
                    if atTop {
                        sv.panGestureRecognizer.state = .cancelled
                        coordinatedScrollView = nil
                        panMode = .sheet
                        return true
                    }
                    coordinatedScrollView = nil
                    return false
                }
            case .handoff:
                pinnedContentOffsetY = sv.contentOffset.y
                if draggingUp {
                    panMode = (atTop && canSheetExpandFurther) ? .sheet : .scroll
                } else {
                    panMode = atTop ? .sheet : .scroll
                }
                return true
            }
        } else {
            coordinatedScrollView = nil
            panMode = .sheet
            return true
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        guard gestureRecognizer === sheetPanGesture else { return false }
        if let sv = coordinatedScrollView, otherGestureRecognizer === sv.panGestureRecognizer {
            return true
        }
        return false
    }

    @objc private func handleSheetPan(_ pan: VRBSSheetPanGestureRecognizer) {
        switch pan.state {
        case .began:
            stopSpring()
            isDraggingSheet = true
            lastPanTranslationY = pan.translation(in: self).y
            didCancelChildTouchesForCurrentDrag = false
            if panMode == .sheet {
                cancelChildTapTouchesIfNeeded(pan)
            }

        case .changed:
            let currentTranslationY = pan.translation(in: self).y
            let dy = currentTranslationY - lastPanTranslationY
            lastPanTranslationY = currentTranslationY
            guard dy != 0 else { return }

            if let sv = coordinatedScrollView {
                handleCoordinatedPanDelta(dy: dy, scrollView: sv, pan: pan)
            } else {
                cancelChildTapTouchesIfNeeded(pan)
                applyDragDelta(dy)
            }

        case .ended:
            isDraggingSheet = false
            restoreScrollIndicator()
            let vy = pan.velocity(in: self).y
            if let sv = coordinatedScrollView {
                if !isAtRestingDetent || panMode == .sheet {
                    // Stop scroll view momentum while sheet snaps to target detent.
                    sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: pinnedContentOffsetY), animated: false)
                    sv.panGestureRecognizer.state = .cancelled
                    settleFromRelease(velocityYPointsPerSec: vy)
                }
            } else {
                settleFromRelease(velocityYPointsPerSec: vy)
            }
            coordinatedScrollView = nil
            panMode = .undecided

        case .cancelled, .failed:
            isDraggingSheet = false
            restoreScrollIndicator()
            coordinatedScrollView = nil
            panMode = .undecided
            if !isAtRestingDetent {
                snapToIndex(currentTargetIndex, initialVelocity: 0, animated: true, emitIndexCallback: false)
            }

        default:
            break
        }
    }

    private func handleCoordinatedPanDelta(
        dy: CGFloat,
        scrollView sv: UIScrollView,
        pan: VRBSSheetPanGestureRecognizer
    ) {
        let draggingUp = dy < 0
        let level = draggingUp ? scrollExpandCoordination : scrollCollapseCoordination
        let minOffsetY = -sv.adjustedContentInset.top

        if level != .handoff {
            if panMode == .sheet {
                cancelChildTapTouchesIfNeeded(pan)
                pinScrollView(sv, to: pinnedContentOffsetY)
                applyDragDelta(dy)
            } else {
                restoreScrollIndicator()
                pinnedContentOffsetY = sv.contentOffset.y
            }
            return
        }

        if draggingUp {
            if canSheetExpandFurther {
                panMode = .sheet
                cancelChildTapTouchesIfNeeded(pan)
                let leftoverDy = applyDragDeltaClampedToTop(dy)
                pinScrollView(sv, to: pinnedContentOffsetY)
                if leftoverDy < 0 {
                    panMode = .scroll
                    restoreScrollIndicator()
                    let maxOffsetY = max(minOffsetY, sv.contentSize.height + sv.adjustedContentInset.bottom - sv.bounds.height)
                    let nextOffset = min(maxOffsetY, max(minOffsetY, pinnedContentOffsetY - leftoverDy))
                    pinnedContentOffsetY = nextOffset
                    sv.contentOffset = CGPoint(x: sv.contentOffset.x, y: nextOffset)
                }
            } else {
                panMode = .scroll
                restoreScrollIndicator()
                pinnedContentOffsetY = sv.contentOffset.y
            }
        } else {
            if panMode == .scroll && sv.contentOffset.y > minOffsetY + 0.5 {
                restoreScrollIndicator()
                pinnedContentOffsetY = sv.contentOffset.y
            } else {
                panMode = .sheet
                cancelChildTapTouchesIfNeeded(pan)
                pinnedContentOffsetY = minOffsetY
                pinScrollView(sv, to: minOffsetY)
                applyDragDelta(dy)
            }
        }
    }

    private func applyDragDelta(_ dy: CGFloat) {
        guard let first = resolvedDetents.first, let last = resolvedDetents.last else { return }
        let maxTotal = last.totalHeight
        let minTotal = canUserDismissOrRequestClose ? 0 : first.totalHeight
        let proposedOpen = containerSize.height - sheetOffsetY - dy

        let nextOpen: CGFloat
        if proposedOpen > maxTotal {
            nextOpen = maxTotal + VRBSMath.rubberBand(overshoot: proposedOpen - maxTotal, dimension: containerSize.height * 0.35)
        } else if proposedOpen < minTotal {
            if minTotal <= 0 {
                nextOpen = 0
            } else {
                nextOpen = max(0, minTotal - VRBSMath.rubberBand(overshoot: minTotal - proposedOpen, dimension: max(1, minTotal)))
            }
        } else {
            nextOpen = proposedOpen
        }
        setSheetOffsetYInternal(containerSize.height - nextOpen)
    }

    private func applyDragDeltaClampedToTop(_ dy: CGFloat) -> CGFloat {
        guard let last = resolvedDetents.last else { return dy }
        let minOffset = containerSize.height - last.totalHeight
        let proposedOffset = sheetOffsetY + dy
        if proposedOffset < minOffset {
            let leftover = proposedOffset - minOffset
            setSheetOffsetYInternal(minOffset)
            return leftover
        } else {
            setSheetOffsetYInternal(proposedOffset)
            return 0
        }
    }

    private func pinScrollView(_ sv: UIScrollView, to offsetY: CGFloat) {
        if savedShowsVerticalIndicator == nil {
            savedShowsVerticalIndicator = sv.showsVerticalScrollIndicator
            sv.showsVerticalScrollIndicator = false
        }
        if abs(sv.contentOffset.y - offsetY) > 0.1 {
            sv.contentOffset = CGPoint(x: sv.contentOffset.x, y: offsetY)
        }
    }

    private func restoreScrollIndicator() {
        guard let saved = savedShowsVerticalIndicator else { return }
        coordinatedScrollView?.showsVerticalScrollIndicator = saved
        savedShowsVerticalIndicator = nil
    }

    private func cancelChildTapTouchesIfNeeded(_ pan: VRBSSheetPanGestureRecognizer) {
        guard !didCancelChildTouchesForCurrentDrag else { return }
        didCancelChildTouchesForCurrentDrag = true
        let activeTouches = pan.trackedTouches
        for touch in activeTouches {
            for gr in touch.gestureRecognizers ?? [] {
                if gr === pan || gr === coordinatedScrollView?.panGestureRecognizer { continue }
                if gr is UITapGestureRecognizer || gr is UILongPressGestureRecognizer {
                    gr.isEnabled = false
                    gr.isEnabled = true
                }
            }
        }
    }

    private func canScrollVertically(_ sv: UIScrollView) -> Bool {
        guard sv.isScrollEnabled else { return false }
        let verticalRange = sv.contentSize.height + sv.adjustedContentInset.top + sv.adjustedContentInset.bottom
        return verticalRange > sv.bounds.height + 0.5 || sv.contentOffset.y > -sv.adjustedContentInset.top + 0.5
    }

    private func isTouchInsidePickerWheel(at point: CGPoint, in root: UIView) -> Bool {
        guard !root.isHidden, root.alpha > 0.01 else { return false }
        if root is UIPickerView { return true }
        for sub in root.subviews.reversed() {
            let pt = sub.convert(point, from: root)
            if sub.bounds.contains(pt) && isTouchInsidePickerWheel(at: pt, in: sub) {
                return true
            }
        }
        return false
    }

    private func findInnermostVerticalScrollView(at point: CGPoint, in root: UIView) -> UIScrollView? {
        guard !root.isHidden, root.alpha > 0.01 else { return nil }
        for sub in root.subviews.reversed() {
            let pt = sub.convert(point, from: root)
            if sub.bounds.contains(pt) {
                if let deeper = findInnermostVerticalScrollView(at: pt, in: sub) {
                    return deeper
                }
                if let sv = sub as? UIScrollView, sv.isScrollEnabled {
                    let isHorizOnly = sv.contentSize.width > sv.bounds.width + 1 &&
                        sv.contentSize.height <= sv.bounds.height + 1 &&
                        !sv.alwaysBounceVertical
                    if !isHorizOnly {
                        return sv
                    }
                }
            }
        }
        return nil
    }
}
