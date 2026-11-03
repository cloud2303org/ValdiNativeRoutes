package io.valdiroutes.app

/** Main-thread callback gate: an outgoing shell must never select a tab on its replacement. */
internal class TabBarSelection(routes: List<String>, select: (String) -> Unit) {
    private val routes = routes.toSet()
    private var select: ((String) -> Unit)? = select

    fun select(route: String) {
        val callback = select ?: return
        require(route in routes) { "Unknown tab: $route" }
        callback(route)
    }

    fun deactivate() {
        select = null
    }
}

/** Validate the serialized native ingress, including declarations from older bundles without mode. */
internal fun validateTabBar(mode: String?, component: String?) {
    when (mode ?: "default") {
        "default" -> require(component == null) { "Default tab bars cannot specify a component" }
        "custom" -> require(component != null && CanonicalTabBarComponent.matches(component)) {
            "Custom tab bars require a canonical exported Valdi component path"
        }
        else -> throw IllegalArgumentException("Invalid tab bar mode: $mode")
    }
}

private val CanonicalTabBarComponent = Regex("""[^@\s]+@[^/\s]+/src/[^\s]+""")
