package io.valdiroutes.app

import io.valdiroutes.pages.RouteDeclaration
import io.valdiroutes.pages.RouteEntry
import io.valdiroutes.pages.RouteTabBar

typealias RouteDefinition = RouteEntry
typealias TabBar = RouteTabBar

/** What startApp (app.ts) returns: the routes, the tab bar and the first page. */
class RouteTable(private val routes: Map<String, RouteDefinition>, val tabBar: TabBar?, val root: String) {
    fun contains(route: String) = routes.containsKey(route)
    fun withRoot(route: String) = RouteTable(routes, tabBar, route.also { get(it) })

    operator fun get(route: String): RouteDefinition = requireNotNull(routes[route]) { "Unknown route: $route" }

    companion object {
        fun from(declaration: RouteDeclaration): RouteTable {
            val routes = declaration.routes.associateBy { it.route }
            require(routes.size == declaration.routes.size) { "Duplicate routes" }
            val table = RouteTable(routes, declaration.tabBar, declaration.root)
            table[table.root]
            routes.keys.forEach { name ->
                val definition = table[name]
                require(definition.kind in listOf("valdi", "native", "tabs")) { "Invalid route kind: $name" }
                if (definition.kind == "native") require(NativeScreens.contains(requireNotNull(definition.nativeName))) {
                    "Native page for route $name is not registered: ${definition.nativeName}"
                }
            }
            table.tabBar?.let { config ->
                validateTabBar(config.mode, config.component)
                require(config.tabs.isNotEmpty() && config.tabs.map { it.route }.distinct().size == config.tabs.size) { "Invalid tabs" }
                require(table[config.route].kind == "tabs")
                require(config.tabs.any { it.route == config.initial }) { "Unknown initial tab: ${config.initial}" }
                config.tabs.forEach { require(table[it.route].kind != "tabs") }
            }
            return table
        }
    }
}
