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
    private let d0: CGFloat
    private let c2: CGFloat
    private let startTime: CFTimeInterval

    init(
        current: CGFloat,
        target: CGFloat,
        initialVelocity: CGFloat,
        settleDuration: CGFloat,
        startTime: CFTimeInterval = CACurrentMediaTime()
    ) {
        self.target = target
        self.d0 = current - target
        self.omega = VRBSMath.computeCriticalSpringOmega(
            distance: d0,
            initialVelocity: initialVelocity,
            settleDuration: settleDuration
        )
        self.c2 = initialVelocity + omega * d0
        self.startTime = startTime
    }

    func evaluate(at timestamp: CFTimeInterval) -> (position: CGFloat, velocity: CGFloat, settled: Bool) {
        let dt = max(0, CGFloat(timestamp - startTime))
        let expTerm = exp(-omega * dt)
        let position = target + (d0 + c2 * dt) * expTerm
        let velocity = (c2 - omega * (d0 + c2 * dt)) * expTerm
        let settled = abs(position - target) < 0.25 && abs(velocity) < 5.0
        return (settled ? target : position, settled ? 0 : velocity, settled)
    }
}

enum VRBSMath {
    static let releaseProjectionSeconds: CGFloat = 0.1
    static let defaultSettleDurationSeconds: CGFloat = 0.45
    static let settleFraction: CGFloat = 8.0
    static let maxSpringOmega: CGFloat = 100.0
    static let minSettleDurationSeconds: CGFloat = 0.001

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

    static func resolveReleaseTargetIndex(
        detents: [VRBSDetentSpec],
        currentOpenHeight: CGFloat,
        velocityYPointsPerSec: CGFloat,
        canDismissOrClose: Bool
    ) -> Int {
        guard !detents.isEmpty else { return -1 }
        let projectedHeight = currentOpenHeight - velocityYPointsPerSec * releaseProjectionSeconds
        var bestIndex = -1
        var bestDistance = CGFloat.greatestFiniteMagnitude

        if canDismissOrClose {
            bestIndex = -1
            bestDistance = abs(projectedHeight)
        }

        for (i, spec) in detents.enumerated() where !spec.programmatic {
            let dist = abs(projectedHeight - spec.totalHeight)
            if dist < bestDistance {
                bestDistance = dist
                bestIndex = i
            }
        }

        if bestIndex == -1 && !canDismissOrClose {
            for (i, spec) in detents.enumerated() {
                let dist = abs(projectedHeight - spec.totalHeight)
                if dist < bestDistance {
                    bestDistance = dist
                    bestIndex = i
                }
            }
        }
        return bestIndex
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
