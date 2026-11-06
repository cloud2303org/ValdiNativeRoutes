import UIKit
import ValdiRuntime

/// SCValdiComponentContainerView uses the same inflation path as runtime.loadView(withComponentPath:...).
/// The business component rejects touches outside its visual region through Valdi's hitTest attribute.
/// Drop any remaining hit on this empty outer viewport, allowing UIKit to continue to the page below.
final class TabBarRootView: SCValdiComponentContainerView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}
