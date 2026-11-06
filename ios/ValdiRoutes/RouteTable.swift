import Foundation

// Use the generated data models unchanged; this table only indexes and validates the declaration for UIKit.
typealias RouteDefinition = VRRouteEntry
typealias Tab = VRRouteTab
typealias TabBar = VRRouteTabBar

/// What startApp returns: a typed declaration, indexed by route name for native navigation.
struct RouteTable {
    private let routes: [String: VRRouteEntry]
    let tabBar: VRRouteTabBar?
    let root: String

    func contains(_ route: String) -> Bool { routes[route] != nil }

    func withRoot(_ route: String) -> RouteTable {
        precondition(contains(route), "Unknown root route: \(route)")
        return RouteTable(routes: routes, tabBar: tabBar, root: route)
    }

    subscript(route: String) -> VRRouteEntry {
        guard let definition = routes[route] else { preconditionFailure("Unknown route: \(route)") }
        return definition
    }

    /// Kept separate so malformed native/OTA declarations can be checked without trapping a test process.
    static func tabBarError(_ bar: TabBar) -> String? {
        switch bar.mode ?? "default" {
        case "default":
            return bar.component == nil ? nil : "Default tab bar cannot have a custom component"
        case "custom":
            guard let component = bar.component,
                  component.range(of: #"^[^@\s]+@[^/\s]+/src/[^\s]+$"#, options: .regularExpression) != nil else {
                return "Custom tab bar requires a canonical Valdi component path"
            }
            return nil
        default:
            return "Invalid tab bar mode: \(bar.mode ?? "")"
        }
    }

    init(_ declaration: VRRouteDeclaration) {
        var routes: [String: VRRouteEntry] = [:]
        for entry in declaration.routes {
            precondition(!entry.route.isEmpty && routes[entry.route] == nil, "Invalid or duplicate route: \(entry.route)")
            precondition(["valdi", "native", "tabs"].contains(entry.kind), "Invalid route kind: \(entry.kind)")
            if entry.kind == "valdi" {
                precondition(!(entry.component ?? "").isEmpty, "Missing Valdi component for \(entry.route)")
            }
            if entry.kind == "native" {
                precondition(NativeScreens.contains(entry.nativeName ?? ""),
                             "Native page for route \(entry.route) is not registered: \(entry.nativeName ?? "")")
            }
            routes[entry.route] = entry
        }
        precondition(routes[declaration.root] != nil, "Unknown root route: \(declaration.root)")
        if let bar = declaration.tabBar {
            if let error = Self.tabBarError(bar) { preconditionFailure(error) }
            let names = bar.tabs.map(\.route)
            precondition(!names.isEmpty && Set(names).count == names.count && names.contains(bar.initial),
                         "Invalid tab declaration")
            precondition(routes[bar.route]?.kind == "tabs", "Unknown tab shell: \(bar.route)")
            precondition(names.allSatisfy { routes[$0] != nil && routes[$0]?.kind != "tabs" }, "Unknown tab route")
        }
        self.init(routes: routes, tabBar: declaration.tabBar, root: declaration.root)
    }

    private init(routes: [String: VRRouteEntry], tabBar: VRRouteTabBar?, root: String) {
        self.routes = routes
        self.tabBar = tabBar
        self.root = root
    }
}
