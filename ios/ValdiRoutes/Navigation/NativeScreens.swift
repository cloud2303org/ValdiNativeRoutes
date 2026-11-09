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
    private static var screens: [String: (NativePage) -> UIViewController] = [:]

    static func contains(_ name: String) -> Bool { screens[name] != nil }

    static func make(_ page: NativePage) -> UIViewController {
        guard let make = screens[page.entry.definition.nativeName ?? ""] else { fatalError("No native screen registered for \(page.entry.route)") }
        return make(page)
    }

    static func register(_ name: String, make: @escaping (NativePage) -> UIViewController) {
        precondition(screens[name] == nil, "Duplicate native screen: \(name)")
        screens[name] = make
    }
}

