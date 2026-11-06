// Ported from react-native-keyboard-controller 1.22.6 (ios/observers/movement, ios/animations, ios/traversal/
// KeyboardView.swift), MIT License, Copyright (c) 2021 Kiryl Ziusko. The React Native events, focused-input tracking,
// keyboard extender and preloading guards are removed; the frame-by-frame keyboard tracking is kept: every display
// frame reads where the keyboard really is, then predicts two frames ahead on the system's own animation curve.
// Like Android's WindowInsets.ime, this only reports a height; containers decide what to do with it.

import UIKit

/// The keyboard's visible height, updated every frame while it animates and while it is dragged interactively.
final class KeyboardObserver: NSObject {
    static let shared = KeyboardObserver()

    private(set) var height: CGFloat = 0

    private var listeners: [UUID: (CGFloat) -> Void] = [:]
    private let trackingView = KeyboardTrackingView()
    private var displayLink: CADisplayLink!
    private var interactiveObserver: NSKeyValueObservation?
    private var animation: KeyboardAnimation?
    private var didTask: DispatchWorkItem?
    /// Height of the keyboard when fully shown.
    private var keyboardHeight: CGFloat = 0
    private var prevPosition: CGFloat = 0

    private override init() {
        super.init()
        displayLink = CADisplayLink(target: self, selector: #selector(updateKeyboardFrame))
        displayLink.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        displayLink.add(to: .main, forMode: .common)
        displayLink.isPaused = true

        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillAppear),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillDisappear),
                                               name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    /// Puts the tracking view in the window ahead of the first keyboard: a view attached when the keyboard is already
    /// moving gets laid out at its final position, without the keyboard's animation, and can't be followed.
    func prepare() {
        trackingView.attachToTopmostView()
    }

    /// Calls `onChange` with every new height until the returned subscription is released.
    func observe(_ onChange: @escaping (CGFloat) -> Void) -> KeyboardSubscription {
        let id = UUID()
        listeners[id] = onChange
        return KeyboardSubscription { [weak self] in self?.listeners[id] = nil }
    }

    private func emit(_ position: CGFloat) {
        let value = max(0, position)
        guard value != height else { return }
        height = value
        listeners.values.forEach { $0(value) }
    }

    // MARK: - Notifications

    @objc private func keyboardWillAppear(_ notification: Notification) {
        let (duration, frame) = notification.keyboardMetaData()
        guard let frame else { return }
        keyboardHeight = frame.height
        trackingView.attachToTopmostView()
        displayLink.isPaused = false
        initializeAnimation(fromValue: prevPosition, toValue: keyboardHeight)
        scheduleDidEvent(height: keyboardHeight, duration: animation?.duration ?? duration)
    }

    @objc private func keyboardWillDisappear(_ notification: Notification) {
        let (duration, _) = notification.keyboardMetaData()
        displayLink.isPaused = false
        removeInteractiveObserver()
        initializeAnimation(fromValue: prevPosition, toValue: 0)
        scheduleDidEvent(height: 0, duration: animation?.duration ?? duration)
    }

    /// The `did` notifications arrive late; settle when the animation curve says the keyboard has arrived.
    private func scheduleDidEvent(height: CGFloat, duration: Double) {
        didTask?.cancel()
        let task = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.displayLink.isPaused = true
            self.animation = nil
            self.prevPosition = height
            self.emit(height)
            if height > 0 { self.setupInteractiveObserver() }
        }
        didTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: task)
    }

    // MARK: - Frame-by-frame tracking

    private func initializeAnimation(fromValue: Double, toValue: Double) {
        for key in ["position", "opacity"] {
            guard let keyboardAnimation = trackingView.view?.layer.presentation()?.animation(forKey: key) else { continue }
            if let spring = keyboardAnimation as? CASpringAnimation {
                animation = SpringAnimation(animation: spring, fromValue: fromValue, toValue: toValue)
            } else if let basic = keyboardAnimation as? CABasicAnimation {
                animation = TimingAnimation(animation: basic, fromValue: fromValue, toValue: toValue)
            }
            return
        }
    }

    @objc private func updateKeyboardFrame(link: CADisplayLink) {
        guard let view = trackingView.view else { return }
        let (visibleHeight, frameY) = view.frameTransitionInWindow
        var position = visibleHeight
        if position == prevPosition || frameY == 0 { return }

        if animation == nil {
            initializeAnimation(fromValue: prevPosition, toValue: keyboardHeight)
        }
        prevPosition = position

        if let animation {
            if animation.isFinished { return }
            let baseDuration = animation.timingAt(value: position)
            #if targetEnvironment(simulator)
                // Simulator frames don't arrive at a steady interval; offset by the animation's start phase instead.
                let duration = baseDuration + animation.diff
            #else
                // Two frames: this one reads the previous frame but has to place the next.
                let duration = baseDuration + link.duration * 2
            #endif
            let predicted = CGFloat(animation.valueAt(time: duration))
            // A spring never quite reaches its target, while the keyboard's final frame does.
            position = animation.isIncreasing ? max(predicted, position) : min(predicted, position)
            animation.lastValue = position
        }
        emit(position)
    }

    // MARK: - Interactive dismissal

    private func setupInteractiveObserver() {
        guard interactiveObserver == nil, let view = trackingView.view else { return }
        interactiveObserver = view.observe(\.center, options: .new) { [weak self] _, change in
            guard let self, let center = change.newValue else { return }
            // While the keyboard animates, the display link owns the position.
            guard self.displayLink.isPaused else { return }
            let position = self.trackingView.interactive(point: center)
            // 0 comes right before keyboardWillHide, which animates the rest.
            guard position != KeyboardTrackingView.invalidPosition, position != 0 else { return }
            self.prevPosition = position
            self.didTask?.cancel()
            self.emit(position)
        }
    }

    private func removeInteractiveObserver() {
        interactiveObserver?.invalidate()
        interactiveObserver = nil
    }
}

final class KeyboardSubscription {
    private let cancel: () -> Void

    init(cancel: @escaping () -> Void) {
        self.cancel = cancel
    }

    deinit { cancel() }
}

// MARK: - Where the keyboard is

/// iOS 26+ follows `keyboardLayoutGuide` with a zero-height view; older versions read the system keyboard view.
private final class KeyboardTrackingView: UIView {
    static let invalidPosition: CGFloat = -.greatestFiniteMagnitude

    private static var usesKeyboardLayoutGuide: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    private var keyboardHeight = 0.0
    private weak var attachedView: UIView?
    private weak var cachedKeyboardView: UIView?
    private var cachedWindowCount = 0

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isHidden = true
        NotificationCenter.default.addObserver(self, selector: #selector(updateHeight),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(updateHeight),
                                               name: UIResponder.keyboardDidShowNotification, object: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc private func updateHeight(_ notification: Notification) {
        if let frame = notification.keyboardMetaData().1 { keyboardHeight = frame.height }
    }

    var view: UIView? {
        Self.usesKeyboardLayoutGuide ? self : legacyKeyboardView()
    }

    func attachToTopmostView() {
        guard Self.usesKeyboardLayoutGuide, let topView = UIApplication.topViewController()?.view,
              attachedView !== topView else { return }
        removeFromSuperview()
        topView.addSubview(self)
        attachedView = topView
        translatesAutoresizingMaskIntoConstraints = false
        // Only reached on iOS 26 (usesKeyboardLayoutGuide); the check is for the iOS 16 deployment target.
        if #available(iOS 17.0, *) { topView.keyboardLayoutGuide.usesBottomSafeArea = false }
        NSLayoutConstraint.activate([
            leadingAnchor.constraint(equalTo: topView.leadingAnchor),
            trailingAnchor.constraint(equalTo: topView.trailingAnchor),
            bottomAnchor.constraint(equalTo: topView.keyboardLayoutGuide.topAnchor),
            heightAnchor.constraint(equalToConstant: 0),
        ])
    }

    func interactive(point: CGPoint) -> CGFloat {
        guard let trackedView = view else { return Self.invalidPosition }
        let position = (trackedView.window?.bounds.height ?? 0) - point.y

        if Self.usesKeyboardLayoutGuide {
            return position > keyboardHeight ? Self.invalidPosition : position
        }
        // The legacy keyboard view reports garbage while its bounds don't match the keyboard.
        if floor(trackedView.bounds.height) != floor(keyboardHeight) { return Self.invalidPosition }
        // Its center moves from keyboardHeight / 2 (shown) to -keyboardHeight / 2 (hidden).
        let progress = (position + keyboardHeight / 2) / keyboardHeight
        return keyboardHeight * progress
    }

    private func legacyKeyboardView() -> UIView? {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        if cachedKeyboardView == nil || windows.count != cachedWindowCount {
            cachedKeyboardView = Self.findKeyboardView(in: windows)
            cachedWindowCount = windows.count
        }
        return cachedKeyboardView
    }

    private static func findKeyboardView(in windows: [UIWindow]) -> UIView? {
        let containerPrefixes = ["<UIInputSetContainerView", "<UITrackingWindowView"]
        let hostPrefixes = ["<UIInputSetHostView", "<UIKeyboardItemContainerView"]
        for window in windows where window.description.hasPrefix("<UITextEffectsWindow") {
            for container in window.subviews where containerPrefixes.contains(where: container.description.hasPrefix) {
                return container.subviews.first {
                    hostPrefixes.contains(where: $0.description.hasPrefix) && $0.frame.height != 0
                }
            }
        }
        return nil
    }
}

private extension UIView {
    /// Visible keyboard height and the tracked view's top, from what is on screen this frame.
    var frameTransitionInWindow: (Double, Double) {
        let presentation = layer.presentation()
        let frameY = presentation?.frame.origin.y ?? 0
        var position = (window?.bounds.height ?? 0) - frameY
        // With cross-fade transitions the keyboard fades instead of sliding.
        if (presentation?.animationKeys() ?? []).contains("opacity") {
            position *= CGFloat(presentation?.opacity ?? 0)
        }
        return (position, frameY)
    }
}

private extension UIApplication {
    static func topViewController() -> UIViewController? {
        let window = shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

private extension Notification {
    func keyboardMetaData() -> (Double, CGRect?) {
        let duration = userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0
        let frame = (userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        return (duration, frame)
    }
}

// MARK: - The keyboard's animation curves

/// The system keyboard animation, rebuilt from its CAAnimation so positions can be predicted ahead of the screen.
private class KeyboardAnimation {
    private weak var animation: CAMediaTiming?
    let fromValue: Double
    let toValue: Double
    let duration: Double
    let speed: Double
    let timestamp: CFTimeInterval
    var lastValue: Double

    init(fromValue: Double, toValue: Double, animation: CAMediaTiming, duration: Double) {
        self.fromValue = fromValue
        self.toValue = toValue
        self.animation = animation
        self.duration = duration
        lastValue = fromValue
        speed = Double(animation.speed)
        timestamp = CACurrentMediaTime()
    }

    var diff: Double {
        ((animation?.beginTime ?? timestamp) - timestamp).truncatingRemainder(dividingBy: 1.0 / 60)
    }

    var isIncreasing: Bool { fromValue < toValue }

    var isFinished: Bool { lastValue == toValue }

    var animationDuration: Double { animation?.duration ?? 0 }

    func valueAt(time _: Double) -> Double {
        fatalError("Implemented by subclasses")
    }

    /// The time at which the curve reaches `value`, found by bisection.
    func timingAt(value: Double) -> Double {
        var lowerBound = 0.0
        var upperBound = 1.0
        var guess = 0.0
        while upperBound - lowerBound > 0.00001 {
            guess = (lowerBound + upperBound) / 2
            let current = valueAt(time: guess / speed)
            if (current < value && isIncreasing) || (current > value && !isIncreasing) {
                lowerBound = guess
            } else {
                upperBound = guess
            }
        }
        return guess / speed
    }
}

private final class SpringAnimation: KeyboardAnimation {
    private let zeta: Double
    private let omega0: Double
    private let omega1: Double
    private let isUnderDamped: Bool
    private let aUnder: Double
    private let bUnder: Double
    private let aCritical: Double
    private let bCritical: Double

    init(animation: CASpringAnimation, fromValue: Double, toValue: Double) {
        let stiffness = animation.stiffness
        let mass = animation.mass
        zeta = animation.damping / (2 * sqrt(stiffness * mass))
        omega0 = sqrt(stiffness / mass)
        omega1 = omega0 * sqrt(1.0 - zeta * zeta)
        let v0 = -animation.initialVelocity
        let x0 = toValue - fromValue
        isUnderDamped = zeta < 1
        if isUnderDamped {
            aCritical = 0
            bCritical = 0
            aUnder = (v0 + zeta * omega0 * x0) / omega1
            bUnder = x0
        } else {
            aCritical = x0
            bCritical = v0 + omega0 * x0
            aUnder = 0
            bUnder = 0
        }
        super.init(fromValue: fromValue, toValue: toValue, animation: animation, duration: animation.settlingDuration)
    }

    override func valueAt(time: Double) -> Double {
        let t = time * speed
        if isUnderDamped {
            let envelope = exp(-zeta * omega0 * t)
            let angle = omega1 * t
            return toValue - envelope * (aUnder * sin(angle) + bUnder * cos(angle))
        }
        return toValue - exp(-omega0 * t) * (aCritical + bCritical * t)
    }
}

/// A cubic Bézier timing curve with fixed end points (0, 0) and (1, 1).
private final class TimingAnimation: KeyboardAnimation {
    private let p1: CGPoint
    private let p2: CGPoint

    init(animation: CABasicAnimation, fromValue: Double, toValue: Double) {
        var points: [Float] = [0, 0, 0, 0]
        animation.timingFunction?.getControlPoint(at: 1, values: &points[0])
        animation.timingFunction?.getControlPoint(at: 2, values: &points[2])
        p1 = CGPoint(x: CGFloat(points[0]), y: CGFloat(points[1]))
        p2 = CGPoint(x: CGFloat(points[2]), y: CGFloat(points[3]))
        super.init(fromValue: fromValue, toValue: toValue, animation: animation, duration: animation.duration)
    }

    override func valueAt(time: Double) -> Double {
        guard animationDuration > 0 else { return toValue }
        let t = findT(target: min(time / animationDuration, 1), component: \.x)
        return fromValue + (toValue - fromValue) * bezier(t, \.y)
    }

    override func timingAt(value: Double) -> Double {
        guard toValue != fromValue else { return 0 }
        let y = max(min((value - fromValue) / (toValue - fromValue), 1), 0)
        return bezier(findT(target: y, component: \.y), \.x) * animationDuration / speed
    }

    private func bezier(_ t: CGFloat, _ component: KeyPath<CGPoint, CGFloat>) -> CGFloat {
        let u = 1 - t
        return 3 * u * u * t * p1[keyPath: component] + 3 * u * t * t * p2[keyPath: component] + t * t * t
    }

    private func bezierDerivative(_ t: CGFloat, _ component: KeyPath<CGPoint, CGFloat>) -> CGFloat {
        let u = 1 - t
        return (3 * u * u - 6 * t * u) * p1[keyPath: component] + (6 * t * u - 3 * t * t) * p2[keyPath: component] + 3 * t * t
    }

    /// Newton's method on one component of the curve.
    private func findT(target: CGFloat, component: KeyPath<CGPoint, CGFloat>) -> CGFloat {
        var t: CGFloat = 0.5
        for _ in 0 ..< 100 {
            let error = bezier(t, component) - target
            if abs(error) < 0.0001 { break }
            t = max(0, min(t - error / bezierDerivative(t, component), 1))
        }
        return t
    }
}
