// Ported from Software Mansion's react-native-bottom-sheet 0.16.2 (ios/BottomSheetHostingView.swift,
// ios/CriticalSpring.swift), MIT License, Copyright 2026 by Software Mansion. The React Native bindings (Fabric
// mounting, content-height and programmatic detents, JS touch cancelling, position events) are removed; the detent,
// spring, scrim and scroll-negotiation logic is kept. Like the original and the Android port, the sheet knows nothing
// about the keyboard: whoever hosts it pads the content and sizes the detent.

import UIKit

/// A modal bottom sheet in the current window: a scrim plus a panel that snaps between detents. Dragging follows the
/// finger and hands over to the content's scroll: a downward drag moves the sheet only once the scroll under the
/// finger is at its top.
final class SheetHostView: UIView {
    static let handleHeight: CGFloat = 24

    /// Called once the sheet has settled closed. `byUser` is false for `dismiss()`.
    var onClosed: ((_ byUser: Bool) -> Void)?

    /// Height of the open detent, before clamping to the space below the status bar. Changes apply immediately.
    var openHeight: CGFloat = 0 {
        didSet {
            guard openHeight != oldValue else { return }
            refreshDetents()
        }
    }

    private static let closed = 0
    private static let open = 1
    private static let springAnimationKey = "sheetSettle"

    private let scrimView = UIControl()
    private let sheetContainer = UIView()
    private let surface = UIView()
    private let handle = UIView()
    private let contentFrame = UIView()
    private var panGesture: UIPanGestureRecognizer!

    // Detent heights, ascending; index 0 is closed.
    private var detents: [CGFloat] = [0, 0]
    private var targetIndex = SheetHostView.closed
    private var hasLaidOut = false
    private var closeRequested = false
    private var closedNotified = false
    private var lastAppliedMaxHeight = CGFloat.nan

    private var activeSpring: CriticalSpring?
    private var activeSpringTargetIndex = 0
    private var displayLink: CADisplayLink?

    private var isPanning = false
    private var panScrollViews: [(view: UIScrollView, inverted: Bool)] = []
    private var panScrollDistance: CGFloat = 0
    private var panStartingTranslation: CGFloat = 0
    private var panHasSheetDrag = false
    private var activeDragRange: (minTy: CGFloat, maxTy: CGFloat)?
    private var isContentInteractionDisabled = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear

        scrimView.backgroundColor = UIColor(white: 0, alpha: 0x66 / 255)
        scrimView.alpha = 0
        scrimView.isHidden = true
        scrimView.addTarget(self, action: #selector(handleScrimPress), for: .touchUpInside)
        addSubview(scrimView)

        // The surface fills the whole container, so the sheet stays covered below its detent while it springs.
        surface.backgroundColor = .white
        surface.layer.cornerRadius = 20
        surface.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        surface.clipsToBounds = true
        handle.backgroundColor = UIColor(red: 0xD1 / 255, green: 0xD5 / 255, blue: 0xDB / 255, alpha: 1)
        handle.layer.cornerRadius = 2
        surface.addSubview(handle)
        surface.addSubview(contentFrame)
        sheetContainer.addSubview(surface)
        addSubview(sheetContainer)

        panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        panGesture.delegate = self
        panGesture.cancelsTouchesInView = true
        // Let the content show press feedback right away; a sheet drag cancels it.
        panGesture.delaysTouchesBegan = false
        panGesture.delaysTouchesEnded = false
        sheetContainer.addGestureRecognizer(panGesture)
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        displayLink?.invalidate()
    }

    func setContent(_ view: UIView) {
        contentFrame.subviews.forEach { $0.removeFromSuperview() }
        view.frame = contentFrame.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        contentFrame.addSubview(view)
    }

    /// Animates the sheet closed; `onClosed` fires with byUser = false once it settles.
    func dismiss() {
        guard !closeRequested, !closedNotified else { return }
        closeRequested = true
        guard hasLaidOut else {
            notifyClosed()
            return
        }
        snapToIndex(Self.closed, velocity: 0)
    }

    // MARK: - Geometry

    /// Space below the status bar: the view's height minus the part of the window's top inset that overlaps it.
    private var sheetContainerHeight: CGFloat {
        guard let window else { return bounds.height }
        let originYInWindow = convert(CGPoint.zero, to: window).y
        let topOverlap = max(0, window.safeAreaInsets.top - originYInWindow)
        return min(max(0, bounds.height - topOverlap), bounds.height)
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        setNeedsLayout()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { setNeedsLayout() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0, window != nil else { return }
        scrimView.frame = bounds
        refreshDetents()
        layoutContainer()

        if !hasLaidOut {
            guard detents[Self.open] > 0 else { return }
            // Animate in from closed to the open detent.
            hasLaidOut = true
            setTranslation(translationY(for: Self.closed))
            emitPosition()
            snapToIndex(Self.open, velocity: 0)
            return
        }
        if activeSpring != nil || isPanning { return }
        setTranslation(translationY(for: targetIndex))
        emitPosition()
    }

    /// The container is a fixed canvas the height of the space below the status bar; detents only change how far it
    /// is translated down, and the content is laid out at the open detent's height.
    private func layoutContainer() {
        let maxHeight = sheetContainerHeight
        sheetContainer.bounds = CGRect(x: 0, y: 0, width: bounds.width, height: maxHeight)
        sheetContainer.center = CGPoint(x: bounds.width / 2, y: bounds.height - maxHeight / 2)
        surface.frame = sheetContainer.bounds
        handle.frame = CGRect(x: (bounds.width - 36) / 2, y: 10, width: 36, height: 4)
        contentFrame.frame = CGRect(x: 0, y: Self.handleHeight, width: bounds.width,
                                    height: max(0, detents[Self.open] - Self.handleHeight))
    }

    private func refreshDetents() {
        guard bounds.width > 0, bounds.height > 0, window != nil else { return }
        let maxHeight = sheetContainerHeight
        let resolved: [CGFloat] = [0, min(max(0, openHeight), maxHeight)]
        guard resolved != detents || maxHeight != lastAppliedMaxHeight else { return }
        let previousMaxHeight = lastAppliedMaxHeight.isFinite ? lastAppliedMaxHeight : maxHeight
        let capChanged = maxHeight != previousMaxHeight
        detents = resolved
        lastAppliedMaxHeight = maxHeight
        layoutContainer()

        guard hasLaidOut, !isPanning else { return }
        if activeSpring != nil {
            // Closing doesn't depend on the open height; only a moved cap has to re-anchor it.
            if activeSpringTargetIndex == Self.closed && !capChanged { return }
            // Keep the sheet at the same on-screen height across the change, then spring to the new target.
            let visibleHeight = previousMaxHeight - cancelActiveSpring()
            setTranslation(min(max(maxHeight - visibleHeight, 0), maxHeight))
            emitPosition()
            snapToIndex(activeSpringTargetIndex, velocity: 0)
        } else {
            setTranslation(translationY(for: targetIndex))
            emitPosition()
        }
    }

    private var presentedSheetFrame: CGRect {
        guard activeSpring != nil else { return sheetContainer.frame }
        // Mid-settle the model transform already holds the target; derive the on-screen frame from the spring.
        let size = sheetContainer.bounds.size
        let center = sheetContainer.center
        return CGRect(x: center.x - size.width / 2, y: center.y - size.height / 2 + currentTranslationY,
                      width: size.width, height: size.height)
    }

    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        presentedSheetFrame.contains(point) || (!scrimView.isHidden && bounds.contains(point))
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard self.point(inside: point, with: event) else { return nil }
        if !scrimView.isHidden, !presentedSheetFrame.contains(point) {
            return scrimView.hitTest(convert(point, to: scrimView), with: event)
        }
        let containerPoint = convert(point, to: sheetContainer)
        guard sheetContainer.bounds.contains(containerPoint) else { return nil }
        return sheetContainer.hitTest(containerPoint, with: event)
    }

    // MARK: - Snap logic

    private func translationY(for index: Int) -> CGFloat {
        sheetContainerHeight - (detents.indices.contains(index) ? detents[index] : 0)
    }

    private func draggableRange() -> (minTy: CGFloat, maxTy: CGFloat) {
        let translations = detents.indices.map(translationY(for:))
        return (translations.min() ?? 0, translations.max() ?? 0)
    }

    private var currentTranslationY: CGFloat {
        // During a settle the render server plays keyframes and the model transform holds the target; read the
        // analytical spring the keyframes were sampled from.
        if let spring = activeSpring { return spring.value(at: CACurrentMediaTime()) }
        return sheetContainer.transform.ty
    }

    private var currentSheetHeight: CGFloat {
        sheetContainerHeight - currentTranslationY
    }

    private func setTranslation(_ ty: CGFloat) {
        sheetContainer.transform = CGAffineTransform(translationX: 0, y: ty)
    }

    private func emitPosition(overrideTy: CGFloat? = nil) {
        let position = sheetContainerHeight - (overrideTy ?? currentTranslationY)
        updateScrim(forPosition: position)
        sheetContainer.alpha = position <= 0.5 ? 0 : 1
    }

    private func updateScrim(forPosition position: CGFloat) {
        // Settled closed: stale positions must not flash the scrim.
        if !hasLaidOut || (targetIndex == Self.closed && activeSpring == nil && !isPanning) {
            scrimView.alpha = 0
            scrimView.isHidden = true
            return
        }
        let open = detents[Self.open]
        let progress = open <= 0 ? 0 : min(1, max(0, position / open))
        scrimView.alpha = progress
        scrimView.isHidden = progress <= 0.001
    }

    @objc private func handleScrimPress() {
        guard targetIndex != Self.closed, activeSpring == nil || currentSheetHeight > 0.5 else { return }
        snapToIndex(Self.closed, velocity: 0)
    }

    private func snapToIndex(_ index: Int, velocity: CGFloat) {
        guard detents.indices.contains(index) else { return }
        targetIndex = index

        let currentTy = activeSpring != nil ? cancelActiveSpring() : sheetContainer.transform.ty
        let targetTy = translationY(for: index)
        let distance = targetTy - currentTy
        let velocityRatio = distance != 0 ? velocity / distance : 0
        let v0 = min(max(velocityRatio, -5), 5) * distance

        let duration: CFTimeInterval = 0.45
        // Settled within ~0.5% at `duration`: for a critically damped spring that is ω·t ≈ 8.
        let omega = 8.0 / CGFloat(duration)
        activeSpringTargetIndex = index

        let startTime = CACurrentMediaTime()
        let spring = CriticalSpring(from: currentTy, target: targetTy, v0: v0, omega: omega, startTime: startTime,
                                    duration: duration)

        // The sheet animates on the render server from samples of the spring that drives the scrim.
        let animation = CAKeyframeAnimation(keyPath: "transform.translation.y")
        let sampleCount = max(Int((duration * 120).rounded()), 1)
        animation.values = spring.keyframeValues(count: sampleCount)
        animation.keyTimes = (0 ... sampleCount).map { NSNumber(value: Double($0) / Double(sampleCount)) }
        animation.duration = duration
        animation.calculationMode = .linear
        animation.beginTime = sheetContainer.layer.convertTime(startTime, from: nil)
        animation.isRemovedOnCompletion = false
        animation.fillMode = .forwards
        animation.delegate = self

        setTranslation(targetTy)
        sheetContainer.layer.add(animation, forKey: Self.springAnimationKey)
        activeSpring = spring
        startDisplayLink()
    }

    private func finishSpring() {
        guard activeSpring != nil else { return }
        let index = activeSpringTargetIndex
        activeSpring = nil
        stopDisplayLink()
        sheetContainer.layer.removeAnimation(forKey: Self.springAnimationKey)
        setTranslation(translationY(for: index))
        emitPosition()
        setContentInteractionEnabled(true)
        if index == Self.closed { notifyClosed() }
    }

    @discardableResult
    private func cancelActiveSpring() -> CGFloat {
        let visualTy = currentTranslationY
        activeSpring = nil
        stopDisplayLink()
        sheetContainer.layer.removeAnimation(forKey: Self.springAnimationKey)
        setTranslation(visualTy)
        return visualTy
    }

    private func notifyClosed() {
        guard !closedNotified else { return }
        closedNotified = true
        onClosed?(!closeRequested)
    }

    private func startDisplayLink() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: WeakTarget(self), selector: #selector(WeakTarget.displayLinkFired(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
    }

    fileprivate func displayLinkFired(_ link: CADisplayLink) {
        guard let spring = activeSpring else { return }
        // Predict the next displayed frame (plus one) so the scrim keeps pace with the render server.
        let frameDuration = link.targetTimestamp - link.timestamp
        emitPosition(overrideTy: spring.value(at: link.targetTimestamp + frameDuration))
    }

    private func setContentInteractionEnabled(_ isEnabled: Bool) {
        guard isContentInteractionDisabled == isEnabled else { return }
        contentFrame.isUserInteractionEnabled = isEnabled
        isContentInteractionDisabled = !isEnabled
    }

    private func bestSnapIndex(for height: CGFloat, velocity: CGFloat) -> Int {
        let flickThreshold: CGFloat = 600
        let candidates = Array(detents.indices)
        if velocity < -flickThreshold {
            return candidates.first(where: { detents[$0] > height }) ?? candidates.last ?? targetIndex
        }
        if velocity > flickThreshold {
            return candidates.last(where: { detents[$0] < height }) ?? candidates.first ?? targetIndex
        }
        return candidates.min(by: { abs(detents[$0] - height) < abs(detents[$1] - height) }) ?? targetIndex
    }

    // MARK: - Dragging

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        switch gesture.state {
        case .began:
            isPanning = false
            panScrollDistance = panScrollViews.reduce(0) { max($0, scrollDistanceToEdge($1)) }
            panHasSheetDrag = false
            gesture.setTranslation(.zero, in: self)
            if panScrollViews.isEmpty || panScrollDistance <= 0.5 { beginSheetDrag() }

        case .changed:
            let translation = gesture.translation(in: self).y
            // The content consumes the distance to its edge; only the remainder moves the sheet.
            let sheetDelta = panScrollViews.isEmpty ? translation : max(0, translation - panScrollDistance)
            if !panHasSheetDrag, panScrollViews.contains(where: { scrollDistanceToEdge($0) > 0.5 }) { return }
            guard panHasSheetDrag || sheetDelta > 0 else { return }
            beginSheetDrag()
            if !panScrollViews.isEmpty && sheetDelta > 0 { pinPanScrollViews() }
            let range = activeDragRange ?? draggableRange()
            setTranslation(max(range.minTy, min(range.maxTy, panStartingTranslation + sheetDelta)))
            emitPosition()

        case .ended, .cancelled:
            isPanning = false
            setContentInteractionEnabled(true)
            guard panHasSheetDrag else {
                clearPanState()
                return
            }
            let velocity = gesture.velocity(in: self).y
            let index = bestSnapIndex(for: sheetContainerHeight - sheetContainer.transform.ty, velocity: velocity)
            clearPanState()
            snapToIndex(index, velocity: velocity)

        case .failed:
            isPanning = false
            clearPanState()
            setContentInteractionEnabled(true)

        default:
            break
        }
    }

    private func beginSheetDrag() {
        guard !panHasSheetDrag else { return }
        panHasSheetDrag = true
        isPanning = true
        activeDragRange = draggableRange()
        if activeSpring != nil { cancelActiveSpring() }
        panStartingTranslation = sheetContainer.transform.ty
        sheetContainer.endEditing(true)
        // Disabling a scroll ancestor would cancel its pan; keep native scrolling alive.
        if panScrollViews.isEmpty { setContentInteractionEnabled(false) }
    }

    private func clearPanState() {
        activeDragRange = nil
        panScrollViews = []
        panScrollDistance = 0
        panHasSheetDrag = false
    }

    private func isVerticallyScrollable(_ scrollView: UIScrollView) -> Bool {
        guard scrollView.isScrollEnabled else { return false }
        let verticalInset = scrollView.adjustedContentInset.top + scrollView.adjustedContentInset.bottom
        let visibleHeight = max(0, scrollView.bounds.height - verticalInset)
        return scrollView.alwaysBounceVertical || scrollView.contentSize.height > visibleHeight
    }

    private func scrollView(containing location: CGPoint, in view: UIView) -> UIScrollView? {
        for subview in view.subviews.reversed() {
            let locationInSubview = view.convert(location, to: subview)
            guard subview.bounds.contains(locationInSubview) else { continue }
            if let found = scrollView(containing: locationInSubview, in: subview) { return found }
            if let scrollView = subview as? UIScrollView, isVerticallyScrollable(scrollView) { return scrollView }
        }
        return nil
    }

    private func scrollViewsForPan(at location: CGPoint) -> [(view: UIScrollView, inverted: Bool)] {
        guard let touched = scrollView(containing: location, in: sheetContainer) else { return [] }
        var chain: [UIView] = []
        var node: UIView? = touched
        while let view = node, view !== sheetContainer {
            chain.append(view)
            node = view.superview
        }
        var inverted = false
        var result: [(view: UIScrollView, inverted: Bool)] = []
        for view in chain.reversed() {
            inverted = inverted || view.transform.d < 0
            if let scroll = view as? UIScrollView, isVerticallyScrollable(scroll) { result.append((scroll, inverted)) }
        }
        return result
    }

    private func scrollDistanceToEdge(_ candidate: (view: UIScrollView, inverted: Bool)) -> CGFloat {
        let scroll = candidate.view
        if candidate.inverted {
            let edge = max(-scroll.adjustedContentInset.top,
                           scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
            return max(0, edge - scroll.contentOffset.y)
        }
        return max(0, scroll.contentOffset.y + scroll.adjustedContentInset.top)
    }

    private func pinPanScrollViews() {
        for candidate in panScrollViews {
            let scroll = candidate.view
            let top = -scroll.adjustedContentInset.top
            let edge = candidate.inverted
                ? max(top, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom) : top
            scroll.contentOffset = CGPoint(x: scroll.contentOffset.x, y: edge)
        }
    }

    private func isInsidePicker(_ view: UIView?) -> Bool {
        var node = view
        while let current = node, current !== sheetContainer {
            if current is UIPickerView { return true }
            node = current.superview
        }
        return false
    }

    private func isPanScrollGesture(_ gesture: UIGestureRecognizer) -> Bool {
        guard let scroll = gesture.view as? UIScrollView, !isInsidePicker(scroll),
              scroll.panGestureRecognizer === gesture, scroll.isDescendant(of: sheetContainer),
              isVerticallyScrollable(scroll) else { return false }
        return currentSheetHeight >= (detents.max() ?? 0) - 0.5
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === panGesture else { return super.gestureRecognizerShouldBegin(gestureRecognizer) }
        panScrollViews = []
        let velocity = panGesture.velocity(in: self)
        guard abs(velocity.y) > abs(velocity.x) else { return false }
        let location = panGesture.location(in: sheetContainer)
        // A picker wheel owns the whole drag.
        if isInsidePicker(sheetContainer.hitTest(location, with: nil)) { return false }
        if currentSheetHeight >= (detents.max() ?? 0) - 0.5 {
            guard velocity.y >= 0 else { return false }
            // Decided on every pan rather than from the initial offset, so the same pan can take over at the top.
            panScrollViews = scrollViewsForPan(at: location)
        }
        panGesture.cancelsTouchesInView = panScrollViews.isEmpty
        return true
    }
}

extension SheetHostView: CAAnimationDelegate {
    func animationDidStop(_: CAAnimation, finished: Bool) {
        guard finished, activeSpring != nil else { return }
        finishSpring()
    }
}

extension SheetHostView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === panGesture else { return false }
        if isInsidePicker(other.view) || isPanScrollGesture(other) { return false }
        return other is UIPanGestureRecognizer || other is UITapGestureRecognizer
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        gestureRecognizer === panGesture && isPanScrollGesture(other)
    }
}

/// CADisplayLink retains its target; this breaks the cycle with the sheet.
private final class WeakTarget: NSObject {
    private weak var sheet: SheetHostView?

    init(_ sheet: SheetHostView) {
        self.sheet = sheet
    }

    @objc func displayLinkFired(_ link: CADisplayLink) {
        sheet?.displayLinkFired(link)
    }
}

/// Critically damped (ζ = 1): reaches the target as fast as possible without overshooting.
private struct CriticalSpring {
    let from: CGFloat
    let target: CGFloat
    /// Initial velocity in points per second, e.g. carried over from a flick.
    let v0: CGFloat
    /// Angular frequency in rad/s; higher snaps faster.
    let omega: CGFloat
    /// Absolute media time the curve starts at, shared with the keyframe animation's beginTime.
    let startTime: CFTimeInterval
    let duration: CFTimeInterval

    /// x(t) = target + e^(−ω·t)·[A + (v0 + ω·A)·t], with A the starting offset from the target.
    func value(at time: CFTimeInterval) -> CGFloat {
        let t = CGFloat(max(0, time - startTime))
        let a = from - target
        return target + exp(-omega * t) * (a + (v0 + omega * a) * t)
    }

    /// `count + 1` evenly spaced samples over the duration, for CAKeyframeAnimation.values.
    func keyframeValues(count: Int) -> [CGFloat] {
        let n = max(count, 1)
        return (0 ... n).map { value(at: startTime + duration * CFTimeInterval($0) / CFTimeInterval(n)) }
    }
}
