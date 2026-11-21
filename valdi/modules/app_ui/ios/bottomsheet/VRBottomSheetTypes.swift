import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - Detent & Coordination Types

enum VRBSDetentKind: String, Equatable {
    case points
    case percentage
    case content
}

enum VRBSScrollCoordinationLevel: Int, Equatable {
    case none = 0
    case initial = 1
    case handoff = 2

    static func fromWireValue(_ raw: Int) -> VRBSScrollCoordinationLevel {
        VRBSScrollCoordinationLevel(rawValue: raw) ?? .none
    }
}

struct VRBSDetentInsets: Equatable {
    var left: CGFloat = 0
    var right: CGFloat = 0
    var bottom: CGFloat = 0

    var isInset: Bool {
        left > 0 || right > 0 || bottom > 0
    }
}

struct VRBSCardSpan: Equatable {
    var left: CGFloat
    var width: CGFloat

    var right: CGFloat {
        left + width
    }
}

struct VRBSRawDetentSpec: Equatable {
    var value: CGFloat
    var kind: VRBSDetentKind
    var programmatic: Bool = false
    var usesStatusBarTopInset: Bool = false
    var insetTop: CGFloat = 0
    var insetLeft: CGFloat = 0
    var insetRight: CGFloat = 0
    var insetBottom: CGFloat = 0
    var widestCard: Bool = false
    var maxWidth: CGFloat = 0
    var placementBias: CGFloat = 0.5
    var scrimOpacity: CGFloat = 1
}

struct VRBSDetentSpec: Equatable {
    var height: CGFloat
    var programmatic: Bool = false
    var insets: VRBSDetentInsets = VRBSDetentInsets()
    var scrimOpacity: CGFloat = 1

    var totalHeight: CGFloat {
        height + insets.bottom
    }
}

struct VRBSCardShadow: Equatable {
    var offsetX: CGFloat
    var offsetY: CGFloat
    var blurRadius: CGFloat
    var spreadDistance: CGFloat
    var colorArgb: Int32
    var opacity: Float
    var excludesInterior: Bool

    var uiColor: UIColor {
        VRBSColorFromArgb(colorArgb)
    }
}

func VRBSColorFromArgb(_ argb: Int32) -> UIColor {
    let u = UInt32(bitPattern: argb)
    let a = CGFloat((u >> 24) & 0xFF) / 255.0
    let r = CGFloat((u >> 16) & 0xFF) / 255.0
    let g = CGFloat((u >> 8) & 0xFF) / 255.0
    let b = CGFloat(u & 0xFF) / 255.0
    return UIColor(red: r, green: g, blue: b, alpha: a)
}

// MARK: - Critical Spring & Pure Math

struct VRBSCriticalSpring {
    let target: CGFloat
    let omega: CGFloat
    let duration: CFTimeInterval
    private let d0: CGFloat
    private let c2: CGFloat
    private let endOffset: CGFloat
    private let invDenom: CGFloat
    private let startTime: CFTimeInterval

    init(
        current: CGFloat,
        target: CGFloat,
        initialVelocity: CGFloat,
        settleDuration: CGFloat,
        startTime: CFTimeInterval = CACurrentMediaTime()
    ) {
        self.target = target
        let startOffset = current - target
        self.d0 = startOffset
        self.startTime = startTime

        if abs(startOffset) < 0.0001 {
            self.omega = VRBSMath.computeCriticalSpringOmega(
                distance: 0,
                initialVelocity: 0,
                settleDuration: settleDuration
            )
            self.duration = 0
            self.c2 = 0
            self.endOffset = 0
            self.invDenom = 0
            return
        }

        let resolvedOmega = VRBSMath.computeCriticalSpringOmega(
            distance: startOffset,
            initialVelocity: initialVelocity,
            settleDuration: settleDuration
        )
        self.omega = resolvedOmega
        let clampedVelocity = VRBSMath.clampSpringInitialVelocity(
            startOffset: startOffset,
            initialVelocity: initialVelocity,
            omega: resolvedOmega
        )
        let resolvedC2 = clampedVelocity + resolvedOmega * startOffset
        self.c2 = resolvedC2
        let settleSeconds = VRBSMath.settleFraction / resolvedOmega
        self.duration = CFTimeInterval(settleSeconds)
        let residual = exp(-VRBSMath.settleFraction) * (startOffset + resolvedC2 * settleSeconds)
        self.endOffset = residual
        let denom = startOffset - residual
        self.invDenom = abs(denom) > 1e-6 ? (1.0 / denom) : 0
    }

    func evaluate(at timestamp: CFTimeInterval) -> (position: CGFloat, velocity: CGFloat, settled: Bool) {
        if duration <= 0 || invDenom == 0 {
            return (target, 0, true)
        }
        let elapsed = timestamp - startTime
        if elapsed >= duration {
            return (target, 0, true)
        }
        let dt = max(0, CGFloat(elapsed))
        let expTerm = exp(-omega * dt)
        let rawOffset = (d0 + c2 * dt) * expTerm
        let remaining = (rawOffset - endOffset) * invDenom
        if remaining <= 0 {
            return (target, 0, true)
        }
        let position = target + d0 * remaining
        let rawVelocity = (c2 - omega * (d0 + c2 * dt)) * expTerm
        let velocity = rawVelocity * (d0 * invDenom)
        return (position, velocity, false)
    }
}

enum VRBSMath {
    static let releaseProjectionSeconds: CGFloat = 0.1
    static let defaultSettleDurationSeconds: CGFloat = 0.45
    static let flickVelocityThresholdPointsPerSec: CGFloat = 600.0
    static let settleFraction: CGFloat = 8.0
    static let maxSpringOmega: CGFloat = 100.0
    static let minSettleDurationSeconds: CGFloat = 0.001

    static func columnWidth(hostWidth: CGFloat, maxWidth: CGFloat) -> CGFloat {
        maxWidth > 0 ? min(maxWidth, hostWidth) : hostWidth
    }

    static func placeCard(
        hostWidth: CGFloat,
        insets: VRBSDetentInsets,
        maxWidth: CGFloat = 0,
        placementBias: CGFloat = 0.5,
        displayScale: CGFloat = 1.0
    ) -> VRBSCardSpan {
        let scale = max(1.0, displayScale)
        let column = columnWidth(hostWidth: hostWidth, maxWidth: maxWidth)
        let columnLeft = (placementBias * (hostWidth - column) * scale).rounded() / scale
        return VRBSCardSpan(
            left: columnLeft + insets.left,
            width: max(0, column - insets.left - insets.right)
        )
    }

    static func contentScale(cardWidth: CGFloat, widestCardWidth: CGFloat) -> CGFloat {
        widestCardWidth > 0 ? max(0, cardWidth / widestCardWidth) : 1.0
    }

    static func computeCriticalSpringOmega(
        distance: CGFloat,
        initialVelocity: CGFloat,
        settleDuration: CGFloat
    ) -> CGFloat {
        let effectiveDuration = settleDuration > 0
            ? max(settleDuration, minSettleDurationSeconds)
            : defaultSettleDurationSeconds
        let baseOmega = settleFraction / effectiveDuration
        let absDist = abs(distance)
        let velocityOmega = absDist > 0.5 ? abs(initialVelocity) / absDist : 0
        return min(maxSpringOmega, max(1.0, max(baseOmega, velocityOmega)))
    }

    static func clampSpringInitialVelocity(
        startOffset: CGFloat,
        initialVelocity: CGFloat,
        omega: CGFloat
    ) -> CGFloat {
        guard abs(startOffset) > 1e-4 else { return 0 }
        if (initialVelocity / startOffset) < -omega {
            return -omega * startOffset
        }
        return initialVelocity
    }

    static func resolveReleaseTargetIndex(
        detents: [VRBSDetentSpec],
        currentOpenHeight: CGFloat,
        velocityYPointsPerSec: CGFloat,
        canDismissOrClose: Bool
    ) -> Int {
        guard !detents.isEmpty else { return -1 }
        var candidates: [(index: Int, height: CGFloat)] = []
        if canDismissOrClose {
            candidates.append((-1, 0))
        }
        for (i, spec) in detents.enumerated() where !spec.programmatic {
            candidates.append((i, spec.totalHeight))
        }
        if candidates.isEmpty {
            for (i, spec) in detents.enumerated() {
                candidates.append((i, spec.totalHeight))
            }
        }

        if velocityYPointsPerSec < -flickVelocityThresholdPointsPerSec {
            return candidates.first(where: { $0.height > currentOpenHeight + 0.5 })?.index
                ?? candidates.last?.index ?? -1
        }
        if velocityYPointsPerSec > flickVelocityThresholdPointsPerSec {
            return candidates.last(where: { $0.height < currentOpenHeight - 0.5 })?.index
                ?? candidates.first?.index ?? -1
        }
        return candidates.min(by: {
            abs($0.height - currentOpenHeight) < abs($1.height - currentOpenHeight)
        })?.index ?? -1
    }

    static func computeFractionalIndex(detents: [VRBSDetentSpec], openHeight: CGFloat) -> CGFloat {
        guard let first = detents.first else { return -1 }
        if openHeight <= 0 { return -1 }
        if openHeight <= first.totalHeight {
            return first.totalHeight > 0 ? (openHeight / first.totalHeight) - 1.0 : 0
        }
        if detents.count > 1 {
            for i in 0..<(detents.count - 1) {
                let low = detents[i].totalHeight
                let high = detents[i + 1].totalHeight
                if openHeight <= high {
                    let span = high - low
                    return span > 0 ? CGFloat(i) + (openHeight - low) / span : CGFloat(i)
                }
            }
        }
        return CGFloat(detents.count - 1)
    }

    static func interpolateInsets(detents: [VRBSDetentSpec], openHeight: CGFloat) -> VRBSDetentInsets {
        guard let first = detents.first else { return VRBSDetentInsets() }
        if openHeight <= first.totalHeight || detents.count == 1 {
            return first.insets
        }
        for i in 0..<(detents.count - 1) {
            let low = detents[i]
            let high = detents[i + 1]
            if openHeight <= high.totalHeight {
                let span = high.totalHeight - low.totalHeight
                let t = span > 0 ? min(1, max(0, (openHeight - low.totalHeight) / span)) : 0
                return VRBSDetentInsets(
                    left: low.insets.left + (high.insets.left - low.insets.left) * t,
                    right: low.insets.right + (high.insets.right - low.insets.right) * t,
                    bottom: low.insets.bottom + (high.insets.bottom - low.insets.bottom) * t
                )
            }
        }
        return detents.last?.insets ?? VRBSDetentInsets()
    }

    static func interpolateScrimOpacity(detents: [VRBSDetentSpec], openHeight: CGFloat) -> CGFloat {
        guard let first = detents.first, openHeight > 0 else { return 0 }
        if openHeight <= first.totalHeight {
            return first.totalHeight > 0
                ? min(1, max(0, (openHeight / first.totalHeight) * first.scrimOpacity))
                : min(1, max(0, first.scrimOpacity))
        }
        if detents.count > 1 {
            for i in 0..<(detents.count - 1) {
                let low = detents[i]
                let high = detents[i + 1]
                if openHeight <= high.totalHeight {
                    let span = high.totalHeight - low.totalHeight
                    let t = span > 0 ? min(1, max(0, (openHeight - low.totalHeight) / span)) : 0
                    let v = low.scrimOpacity + (high.scrimOpacity - low.scrimOpacity) * t
                    return min(1, max(0, v))
                }
            }
        }
        return min(1, max(0, detents.last?.scrimOpacity ?? 0))
    }

    static func rubberBand(overshoot: CGFloat, dimension: CGFloat) -> CGFloat {
        guard dimension > 0, overshoot != 0 else { return 0 }
        let sign: CGFloat = overshoot < 0 ? -1 : 1
        let absOvershoot = abs(overshoot)
        let c: CGFloat = 0.55
        return sign * (1.0 - (1.0 / ((absOvershoot * c / dimension) + 1.0))) * dimension
    }
}

// MARK: - Sheet Pan Gesture Recognizer & VoiceOver Scrim View

final class VRBSSheetPanGestureRecognizer: UIPanGestureRecognizer {
    private(set) var trackedTouches = Set<UITouch>()
    private(set) var lastTouchEvent: UIEvent?

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        trackedTouches.formUnion(touches)
        lastTouchEvent = event
        super.touchesBegan(touches, with: event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        lastTouchEvent = event
        super.touchesMoved(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        trackedTouches.subtract(touches)
        lastTouchEvent = event
        super.touchesEnded(touches, with: event)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        trackedTouches.subtract(touches)
        lastTouchEvent = event
        super.touchesCancelled(touches, with: event)
    }

    override func reset() {
        trackedTouches.removeAll()
        lastTouchEvent = nil
        super.reset()
    }
}

final class VRBottomSheetScrimAccessibilityView: UIView {
    var onActivate: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityTraits = .button
        accessibilityLabel = "Close sheet"
    }

    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        nil
    }

    override func accessibilityActivate() -> Bool {
        guard let onActivate else { return false }
        onActivate()
        return true
    }
}

// MARK: - Structural Child Views (`Surface`, `ContentWrapper`, `Marker`)

@objc(VRBottomSheetSurfaceView)
final class VRBottomSheetSurfaceView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }
}

@objc(VRBottomSheetContentWrapperView)
final class VRBottomSheetContentWrapperView: UIView {
    var onSubviewHierarchyChanged: (() -> Void)?
    private var lastAppliedBoundsSize: CGSize = .zero

    var contentScale: CGFloat = 1.0 {
        didSet {
            guard abs(contentScale - oldValue) > 0.0001 else { return }
            applySublayerScale()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }

    override func didAddSubview(_ subview: UIView) {
        super.didAddSubview(subview)
        onSubviewHierarchyChanged?()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != lastAppliedBoundsSize {
            lastAppliedBoundsSize = bounds.size
            if abs(contentScale - 1.0) > 0.0001 {
                applySublayerScale()
            }
        }
    }

    private func applySublayerScale() {
        let s = max(0, contentScale)
        if abs(s - 1.0) <= 0.0001 {
            if !CATransform3DIsIdentity(layer.sublayerTransform) {
                layer.sublayerTransform = CATransform3DIdentity
            }
            return
        }
        let tx = (s - 1.0) * bounds.width * 0.5
        let ty = (s - 1.0) * bounds.height * 0.5
        layer.sublayerTransform = CATransform3DConcat(
            CATransform3DMakeScale(s, s, 1.0),
            CATransform3DMakeTranslation(tx, ty, 0)
        )
    }
}

@objc(VRBottomSheetMarkerView)
final class VRBottomSheetMarkerView: UIView {
    var onMarkerTopChanged: ((CGFloat) -> Void)?
    private var lastReportedTop: CGFloat = -1

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        let top = max(0, frame.minY)
        if abs(top - lastReportedTop) >= 0.25 {
            lastReportedTop = top
            onMarkerTopChanged?(top)
        }
    }
}
