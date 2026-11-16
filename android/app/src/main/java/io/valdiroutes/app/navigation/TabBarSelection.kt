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
internal fun validateTabBar(mode: String?, component: String?, height: Double? = null) {
    when (mode ?: "default") {
        "default" -> {
            require(component == null) { "Default tab bars cannot specify a component" }
            require(height == null) { "Default tab bars cannot specify a height" }
        }
        "custom" -> {
            require(component != null && CanonicalTabBarComponent.matches(component)) {
                "Custom tab bars require a canonical exported Valdi component path"
            }
            require(height == null || (height.isFinite() && height > 0.0)) {
                "Custom tab bar height must be a positive finite number: $height"
            }
        }
        else -> throw IllegalArgumentException("Invalid tab bar mode: $mode")
    }
}

private val CanonicalTabBarComponent = Regex("""[^@\s]+@[^/\s]+/src/[^\s]+""")
