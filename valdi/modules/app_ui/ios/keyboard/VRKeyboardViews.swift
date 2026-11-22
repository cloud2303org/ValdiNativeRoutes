import UIKit
import ValdiRuntime

// MARK: - Helpers

private func vrKeyboardIsDescendant(_ view: UIView, of ancestor: UIView) -> Bool {
    var current: UIView? = view
    while let node = current {
        if node === ancestor { return true }
        current = node.superview
    }
    return false
}

private func vrKeyboardFindFirstResponder(in view: UIView) -> UIView? {
    if view.isFirstResponder { return view }
    for subview in view.subviews {
        if let found = vrKeyboardFindFirstResponder(in: subview) {
            return found
        }
    }
    return nil
}

private func vrKeyboardFindVerticalScrollView(in view: UIView, excluding root: UIView) -> SCValdiScrollView? {
    if view !== root, let scrollView = view as? SCValdiScrollView {
        if let inner = scrollView.innerScrollView as? SCValdiScrollViewInner {
            if !inner.horizontalScroll { return scrollView }
        } else {
            return scrollView
        }
    }
    for subview in view.subviews {
        if let found = vrKeyboardFindVerticalScrollView(in: subview, excluding: root) {
            return found
        }
    }
    return nil
}

// MARK: - VRKeyboardStickyView

/// Native `<custom-view>` container mirroring `react-native-keyboard-controller`'s `KeyboardStickyView`.
@objc(VRKeyboardStickyView)
final class VRKeyboardStickyView: SCValdiView {
    var keyboardEnabled: Bool = true {
        didSet {
            guard keyboardEnabled != oldValue else { return }
            applyFrame(lastFrame)
        }
    }
    var offsetClosed: CGFloat = 0 {
        didSet {
            guard offsetClosed != oldValue else { return }
            applyFrame(lastFrame)
        }
    }
    var offsetOpened: CGFloat = 0 {
        didSet {
            guard offsetOpened != oldValue else { return }
            applyFrame(lastFrame)
        }
    }

    private var subscription: AppUIKeyboardSubscription?
    private var lastFrame: AppUIKeyboardFrame = .zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            AppUIKeyboardObserver.shared.prepare()
            subscription = AppUIKeyboardObserver.shared.observeFrame { [weak self] frame in
                guard let self else { return }
                self.lastFrame = frame
                self.applyFrame(frame)
            }
        } else {
            subscription = nil
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        applyFrame(lastFrame)
    }

    override func valdi_prepareForPoolReuse() {
        subscription = nil
        keyboardEnabled = true
        offsetClosed = 0
        offsetOpened = 0
        lastFrame = .zero
        transform = .identity
        super.valdi_prepareForPoolReuse()
    }

    private func applyFrame(_ frame: AppUIKeyboardFrame) {
        if (isHidden || alpha <= 0.01) && frame.height > 0 && keyboardEnabled {
            return
        }
        let dy = VRKeyboardMath.stickyTranslationY(
            keyboardHeight: frame.height,
            progress: frame.progress,
            closedOffset: offsetClosed,
            openedOffset: offsetOpened,
            enabled: keyboardEnabled
        )
        let target = dy == 0 ? CGAffineTransform.identity : CGAffineTransform(translationX: 0, y: dy)
        if transform != target {
            transform = target
        }
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("keyboardEnabled", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRKeyboardStickyView else { return false }
            v.keyboardEnabled = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardStickyView)?.keyboardEnabled = true
        })

        attributesBinder.bindAttribute("offsetClosed", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRKeyboardStickyView else { return false }
            v.offsetClosed = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardStickyView)?.offsetClosed = 0
        })

        attributesBinder.bindAttribute("offsetOpened", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRKeyboardStickyView else { return false }
            v.offsetOpened = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardStickyView)?.offsetOpened = 0
        })
    }
}

// MARK: - VRKeyboardAvoidingView

/// Native `<custom-view>` container mirroring `KeyboardAvoidingView`.
@objc(VRKeyboardAvoidingView)
final class VRKeyboardAvoidingView: SCValdiView {
    var keyboardEnabled: Bool = true {
        didSet {
            guard keyboardEnabled != oldValue else { return }
            scheduleUpdate()
        }
    }
    var keyboardBehavior: String = "padding" {
        didSet {
            guard keyboardBehavior != oldValue else { return }
            clearOverrides(markDirty: true)
            scheduleUpdate()
        }
    }
    var keyboardVerticalOffset: CGFloat = 0 {
        didSet {
            guard keyboardVerticalOffset != oldValue else { return }
            scheduleUpdate()
        }
    }

    private var subscription: AppUIKeyboardSubscription?
    private var lastFrame: AppUIKeyboardFrame = .zero
    private var appliedTranslationY: CGFloat = 0
    private var hasPaddingOverride = false
    private var savedBasePadding: CGFloat = 0
    private var lastAppliedPadding: CGFloat = .nan
    private var hasHeightOverride = false
    private var restingHeight: CGFloat = 0
    private var lastAppliedHeight: CGFloat = .nan
    private var lastWindowSize: CGSize = .zero
    private var lastLaidOutSize: CGSize = .zero
    private var updateScheduled = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func clipsToBoundsByDefault() -> Bool { false }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            AppUIKeyboardObserver.shared.prepare()
            subscription = AppUIKeyboardObserver.shared.observeFrame { [weak self] frame in
                guard let self else { return }
                self.lastFrame = frame
                self.applyFrame(frame)
            }
        } else {
            subscription = nil
            clearOverrides(markDirty: false)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let winSize = window?.bounds.size ?? .zero
        let windowChanged = winSize != lastWindowSize
        let sizeChanged = bounds.size != lastLaidOutSize
        lastWindowSize = winSize
        lastLaidOutSize = bounds.size
        if keyboardBehavior == "height" {
            if windowChanged, hasHeightOverride {
                scheduleUpdate(resetHeightBaseline: true)
                return
            }
            if !hasHeightOverride, bounds.height > 0 {
                restingHeight = bounds.height
            }
        }
        if windowChanged || sizeChanged {
            scheduleUpdate()
        }
    }

    override func valdi_prepareForPoolReuse() {
        subscription = nil
        clearOverrides(markDirty: false)
        keyboardEnabled = true
        keyboardBehavior = "padding"
        keyboardVerticalOffset = 0
        lastFrame = .zero
        restingHeight = 0
        lastWindowSize = .zero
        lastLaidOutSize = .zero
        super.valdi_prepareForPoolReuse()
    }

    private func scheduleUpdate(resetHeightBaseline: Bool = false) {
        guard window != nil else { return }
        if resetHeightBaseline {
            clearHeightOverride(markDirty: true)
            restingHeight = 0
        }
        guard !updateScheduled else { return }
        updateScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window != nil else { return }
            self.updateScheduled = false
            self.applyFrame(self.lastFrame)
        }
    }

    private func applyFrame(_ frame: AppUIKeyboardFrame) {
        if isHidden || alpha <= 0.01 {
            if frame.height <= 0 || !keyboardEnabled {
                clearOverrides(markDirty: true)
            }
            return
        }
        guard let window, bounds.height > 0 else { return }
        let windowHeight = window.bounds.height
        guard windowHeight > 0 else { return }
        let rectInWindow = convert(bounds, to: window)

        switch keyboardBehavior {
        case "translate-with-padding":
            clearPaddingOverride(markDirty: true)
            clearHeightOverride(markDirty: true)
            let restingBottom = min(rectInWindow.maxY - appliedTranslationY, windowHeight)
            let overlap = VRKeyboardMath.avoidingOverlap(
                restingBottomInWindow: restingBottom,
                viewHeight: bounds.height,
                windowHeight: windowHeight,
                keyboardHeight: frame.height,
                keyboardVerticalOffset: keyboardVerticalOffset,
                enabled: keyboardEnabled
            )
            let dy = -overlap
            appliedTranslationY = dy
            let target = dy == 0 ? CGAffineTransform.identity : CGAffineTransform(translationX: 0, y: dy)
            if transform != target {
                transform = target
            }

        case "height":
            clearTranslation()
            clearPaddingOverride(markDirty: true)
            if !hasHeightOverride {
                restingHeight = bounds.height
                lastWindowSize = window.bounds.size
            }
            let baseH = restingHeight > 0 ? restingHeight : bounds.height
            let restingBottom = min(rectInWindow.minY + baseH, windowHeight)
            let overlap = VRKeyboardMath.avoidingOverlap(
                restingBottomInWindow: restingBottom,
                viewHeight: baseH,
                windowHeight: windowHeight,
                keyboardHeight: frame.height,
                keyboardVerticalOffset: keyboardVerticalOffset,
                enabled: keyboardEnabled
            )
            guard let node = valdiViewNode else { return }
            if overlap > 0.5 {
                hasHeightOverride = true
                let targetHeight = max(0, baseH - overlap)
                if lastAppliedHeight.isNaN || abs(targetHeight - lastAppliedHeight) >= 0.5 {
                    lastAppliedHeight = targetHeight
                    node.setValue(NSNumber(value: Double(targetHeight)), forValdiAttribute: "height")
                    node.markLayoutDirty()
                }
            } else {
                clearHeightOverride(markDirty: true)
            }

        default:
            clearTranslation()
            clearHeightOverride(markDirty: true)
            let overlap = VRKeyboardMath.avoidingOverlap(
                restingBottomInWindow: min(rectInWindow.maxY, windowHeight),
                viewHeight: bounds.height,
                windowHeight: windowHeight,
                keyboardHeight: frame.height,
                keyboardVerticalOffset: keyboardVerticalOffset,
                enabled: keyboardEnabled
            )
            guard let node = valdiViewNode else { return }
            if overlap > 0.5 {
                if !hasPaddingOverride {
                    savedBasePadding = (node.value(forValdiAttribute: "paddingBottom") as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
                    hasPaddingOverride = true
                }
                let targetPadding = savedBasePadding + overlap
                if lastAppliedPadding.isNaN || abs(targetPadding - lastAppliedPadding) >= 0.5 {
                    lastAppliedPadding = targetPadding
                    node.setValue(NSNumber(value: Double(targetPadding)), forValdiAttribute: "paddingBottom")
                    node.markLayoutDirty()
                }
            } else {
                clearPaddingOverride(markDirty: true)
            }
        }
    }

    private func clearOverrides(markDirty: Bool) {
        clearTranslation()
        clearPaddingOverride(markDirty: markDirty)
        clearHeightOverride(markDirty: markDirty)
    }

    private func clearTranslation() {
        if appliedTranslationY != 0 || !transform.isIdentity {
            appliedTranslationY = 0
            transform = .identity
        }
    }

    private func clearPaddingOverride(markDirty: Bool) {
        guard hasPaddingOverride else { return }
        hasPaddingOverride = false
        savedBasePadding = 0
        lastAppliedPadding = .nan
        guard let node = valdiViewNode else { return }
        node.removeValue(forValdiAttribute: "paddingBottom")
        if markDirty { node.markLayoutDirty() }
    }

    private func clearHeightOverride(markDirty: Bool) {
        guard hasHeightOverride else { return }
        hasHeightOverride = false
        lastAppliedHeight = .nan
        guard let node = valdiViewNode else { return }
        node.removeValue(forValdiAttribute: "height")
        if markDirty { node.markLayoutDirty() }
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("keyboardEnabled", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRKeyboardAvoidingView else { return false }
            v.keyboardEnabled = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAvoidingView)?.keyboardEnabled = true
        })

        attributesBinder.bindAttribute("keyboardBehavior", invalidateLayoutOnChange: false, withStringBlock: { view, value, _ in
            guard let v = view as? VRKeyboardAvoidingView else { return false }
            v.keyboardBehavior = value ?? "padding"
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAvoidingView)?.keyboardBehavior = "padding"
        })

        attributesBinder.bindAttribute("keyboardVerticalOffset", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRKeyboardAvoidingView else { return false }
            v.keyboardVerticalOffset = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAvoidingView)?.keyboardVerticalOffset = 0
        })
    }
}

// MARK: - VRKeyboardAwareScrollViewHost

/// Native `<custom-view>` host wrapping a Valdi `<scroll>` for automatic focus scrolling and bottom insets.
@objc(VRKeyboardAwareScrollViewHost)
final class VRKeyboardAwareScrollViewHost: SCValdiView {
    var keyboardEnabled: Bool = true {
        didSet {
            guard keyboardEnabled != oldValue else { return }
            applyFrame(lastFrame)
        }
    }
    var bottomOffset: CGFloat = 16 {
        didSet {
            guard bottomOffset != oldValue else { return }
            if lastFrame.height > 0 {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.ensureFocusedInputVisible(self.lastFrame, animated: true)
                }
            }
        }
    }
    var extraKeyboardSpace: CGFloat = 0 {
        didSet {
            guard extraKeyboardSpace != oldValue else { return }
            applyFrame(lastFrame)
        }
    }

    private var subscription: AppUIKeyboardSubscription?
    private var editingObservers: [NSObjectProtocol] = []
    private var lastFrame: AppUIKeyboardFrame = .zero
    private var lastKeyboardHeight: CGFloat = 0
    private var appliedBottomInset: CGFloat = 0
    private var lastWindowSize: CGSize = .zero
    private var lastLaidOutSize: CGSize = .zero
    private var pendingReveal = false
    private weak var lastAdjustedResponder: UIView?
    private weak var cachedScrollView: SCValdiScrollView?

    override init(frame: CGRect) {
        super.init(frame: frame)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            AppUIKeyboardObserver.shared.prepare()
            subscription = AppUIKeyboardObserver.shared.observeFrame { [weak self] frame in
                self?.applyFrame(frame)
            }
            if editingObservers.isEmpty {
                let center = NotificationCenter.default
                editingObservers = [
                    center.addObserver(forName: UITextField.textDidBeginEditingNotification, object: nil, queue: .main) { [weak self] note in
                        self?.handleEditingBegan(note.object as? UIView)
                    },
                    center.addObserver(forName: UITextView.textDidBeginEditingNotification, object: nil, queue: .main) { [weak self] note in
                        self?.handleEditingBegan(note.object as? UIView)
                    },
                ]
            }
        } else {
            subscription = nil
            cachedScrollView = nil
            removeEditingObservers()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let winSize = window?.bounds.size ?? .zero
        let windowChanged = winSize != lastWindowSize
        let sizeChanged = bounds.size != lastLaidOutSize
        lastWindowSize = winSize
        lastLaidOutSize = bounds.size
        guard window != nil, let sv = resolveScrollView() else { return }
        let prevInset = appliedBottomInset
        let bottomInset = computeBottomInset(sv: sv, frame: lastFrame)
        if abs(bottomInset - appliedBottomInset) > 0.5 {
            applyScrollInsets(bottomInset, on: sv)
        }
        let resizedWithFocus = (sizeChanged || windowChanged) && keyboardEnabled && vrKeyboardFindFirstResponder(in: self) != nil
        if lastFrame.height > 0 && (pendingReveal || resizedWithFocus) {
            if bottomInset < prevInset {
                clampScrollOffset(sv: sv, bottomInset: bottomInset)
            }
            ensureFocusedInputVisible(lastFrame, animated: pendingReveal && !(sizeChanged || windowChanged))
            if sizeChanged || windowChanged {
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.window != nil, self.lastFrame.height > 0 else { return }
                    self.ensureFocusedInputVisible(self.lastFrame, animated: false)
                }
            }
        } else if sizeChanged || windowChanged || bottomInset < prevInset || lastFrame.height <= 0 {
            clampScrollOffset(sv: sv, bottomInset: bottomInset)
        }
    }

    override func valdi_prepareForPoolReuse() {
        subscription = nil
        removeEditingObservers()
        keyboardEnabled = true
        bottomOffset = 16
        extraKeyboardSpace = 0
        lastFrame = .zero
        lastKeyboardHeight = 0
        lastWindowSize = .zero
        lastLaidOutSize = .zero
        pendingReveal = false
        lastAdjustedResponder = nil
        if let sv = resolveScrollView() {
            applyScrollInsets(0, on: sv)
        }
        cachedScrollView = nil
        super.valdi_prepareForPoolReuse()
    }

    private func resolveScrollView() -> SCValdiScrollView? {
        if let cachedScrollView,
           cachedScrollView.window != nil,
           vrKeyboardIsDescendant(cachedScrollView, of: self) {
            if let inner = cachedScrollView.innerScrollView as? SCValdiScrollViewInner {
                if !inner.horizontalScroll { return cachedScrollView }
            } else {
                return cachedScrollView
            }
        }
        let found = vrKeyboardFindVerticalScrollView(in: self, excluding: self)
        cachedScrollView = found
        return found
    }

    private func removeEditingObservers() {
        let center = NotificationCenter.default
        editingObservers.forEach { center.removeObserver($0) }
        editingObservers.removeAll()
    }

    private func handleEditingBegan(_ view: UIView?) {
        guard let view, vrKeyboardIsDescendant(view, of: self) else {
            lastAdjustedResponder = nil
            return
        }
        guard view !== lastAdjustedResponder else { return }
        pendingReveal = true
        if lastFrame.height > 0 {
            DispatchQueue.main.async { [weak self] in
                guard let self, self.lastFrame.height > 0 else { return }
                self.ensureFocusedInputVisible(self.lastFrame, animated: true)
            }
        }
    }

    private func applyFrame(_ frame: AppUIKeyboardFrame) {
        let prevHeight = lastKeyboardHeight
        let grew = frame.height > prevHeight
        let shrank = frame.height < prevHeight
        lastFrame = frame
        lastKeyboardHeight = frame.height
        if frame.height <= 0 {
            pendingReveal = false
            lastAdjustedResponder = nil
        }

        if (isHidden || alpha <= 0.01), frame.height > 0 {
            return
        }
        guard window != nil, let sv = resolveScrollView() else { return }
        let bottomInset = computeBottomInset(sv: sv, frame: frame)
        if abs(bottomInset - appliedBottomInset) > 0.5 {
            applyScrollInsets(bottomInset, on: sv)
        }

        guard keyboardEnabled else {
            clampScrollOffset(sv: sv, bottomInset: 0)
            return
        }

        if grew {
            pendingReveal = true
            if !frame.isAnimating {
                ensureFocusedInputVisible(frame, animated: true)
            } else {
                // Track animated keyboard frames directly without restarting UIKit scroll animations every tick.
                ensureFocusedInputVisible(frame, animated: false)
            }
        } else if shrank || frame.height <= 0 {
            if !sv.innerScrollView.isDragging {
                clampScrollOffset(sv: sv, bottomInset: bottomInset)
            }
        } else if frame.height > 0, pendingReveal {
            ensureFocusedInputVisible(frame, animated: true)
        }
    }

    private func applyScrollInsets(_ bottomInset: CGFloat, on sv: SCValdiScrollView) {
        appliedBottomInset = bottomInset
        let inner = sv.innerScrollView
        if abs(inner.contentInset.bottom - bottomInset) > 0.5 {
            inner.contentInset.bottom = bottomInset
            inner.verticalScrollIndicatorInsets.bottom = bottomInset
        }
    }

    private func computeBottomInset(sv: SCValdiScrollView, frame: AppUIKeyboardFrame) -> CGFloat {
        guard let window, window.bounds.height > 0, sv.bounds.height > 0 else { return 0 }
        let scrollRect = sv.convert(sv.bounds, to: window)
        return VRKeyboardMath.awareScrollBottomInset(
            scrollBottomInWindow: scrollRect.maxY,
            windowHeight: window.bounds.height,
            keyboardHeight: frame.height,
            progress: frame.progress,
            extraKeyboardSpace: extraKeyboardSpace,
            enabled: keyboardEnabled
        )
    }

    private func ensureFocusedInputVisible(_ frame: AppUIKeyboardFrame, animated: Bool) {
        pendingReveal = false
        guard keyboardEnabled, frame.height > 0,
              let window, window.bounds.height > 0,
              let responder = vrKeyboardFindFirstResponder(in: self),
              let sv = resolveScrollView(),
              sv.bounds.height > 0 else { return }

        let inner = sv.innerScrollView
        guard inner.contentSize.height > 0 else { return }

        let bottomInset = computeBottomInset(sv: sv, frame: frame)
        if abs(bottomInset - appliedBottomInset) > 0.5 {
            applyScrollInsets(bottomInset, on: sv)
        }

        let scrollRect = sv.convert(sv.bounds, to: window)
        let responderRect = responder.convert(responder.bounds, to: window)
        let targetY = VRKeyboardMath.awareScrollTargetOffsetY(
            scrollTopInWindow: scrollRect.minY,
            scrollHeight: sv.bounds.height,
            windowHeight: window.bounds.height,
            keyboardHeight: frame.height,
            bottomOffset: bottomOffset,
            topMargin: 16,
            focusedTopInWindow: responderRect.minY,
            focusedBottomInWindow: responderRect.maxY,
            currentOffsetY: inner.contentOffset.y,
            contentHeight: inner.contentSize.height,
            bottomInset: bottomInset
        )
        if abs(targetY - inner.contentOffset.y) > 0.5 {
            sv.setContentOffset(CGPoint(x: inner.contentOffset.x, y: targetY), animated: animated)
        }
        lastAdjustedResponder = responder
    }

    private func clampScrollOffset(sv: SCValdiScrollView, bottomInset: CGFloat) {
        let inner = sv.innerScrollView
        guard sv.bounds.height > 0, inner.contentSize.height > 0 else { return }
        let maxOffset = max(inner.contentSize.height - sv.bounds.height + max(bottomInset, 0), 0)
        if inner.contentOffset.y > maxOffset + 0.5 {
            sv.setContentOffset(CGPoint(x: inner.contentOffset.x, y: maxOffset), animated: false)
        }
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("keyboardEnabled", invalidateLayoutOnChange: false, withBoolBlock: { view, value, _ in
            guard let v = view as? VRKeyboardAwareScrollViewHost else { return false }
            v.keyboardEnabled = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAwareScrollViewHost)?.keyboardEnabled = true
        })

        attributesBinder.bindAttribute("bottomOffset", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRKeyboardAwareScrollViewHost else { return false }
            v.bottomOffset = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAwareScrollViewHost)?.bottomOffset = 16
        })

        attributesBinder.bindAttribute("extraKeyboardSpace", invalidateLayoutOnChange: false, withDouble: { view, value, _ in
            guard let v = view as? VRKeyboardAwareScrollViewHost else { return false }
            v.extraKeyboardSpace = value
            return true
        }, resetBlock: { view, _ in
            (view as? VRKeyboardAwareScrollViewHost)?.extraKeyboardSpace = 0
        })
    }
}
