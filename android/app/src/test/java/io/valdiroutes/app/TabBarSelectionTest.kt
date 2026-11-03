package io.valdiroutes.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class TabBarSelectionTest {
    @Test
    fun legacyAndExplicitDefaultDeclarationsNeedNoComponent() {
        validateTabBar(null, null)
        validateTabBar("default", null)
    }

    @Test
    fun customDeclarationRequiresCanonicalComponentAndRejectsUnknownModes() {
        validateTabBar("custom", "AppTabBar@app_pages/src/AppTabBar")
        validateTabBar("custom", "default@business/src/navigation/BottomBar")
        for (component in listOf(null, "", "AppTabBar", "AppTabBar@app_pages", "Bar@app_pages/src/with space")) {
            assertThrows(IllegalArgumentException::class.java) { validateTabBar("custom", component) }
        }
        for (mode in listOf(null, "default", "", "haze", "system")) {
            assertThrows(IllegalArgumentException::class.java) {
                validateTabBar(mode, "AppTabBar@app_pages/src/AppTabBar")
            }
        }
        assertThrows(IllegalArgumentException::class.java) { validateTabBar("unknown", null) }
    }

    @Test
    fun activeShellSelectsOnlyDeclaredRoutes() {
        val selected = mutableListOf<String>()
        val selection = TabBarSelection(listOf("home", "profile")) { selected.add(it) }
        selection.select("profile")
        selection.select("home")
        assertThrows(IllegalArgumentException::class.java) { selection.select("missing") }
        assertEquals(listOf("profile", "home"), selected)
    }

    @Test
    fun queuedCallbackFromRemovedShellCannotSelectItsReplacement() {
        val selected = mutableListOf<String>()
        val old = TabBarSelection(listOf("home", "profile")) { selected.add("old:$it") }
        // Models the main.post queued by the JS callback before a reload/reset removes its shell.
        val queuedBeforeRemoval = { old.select("profile") }
        old.deactivate()
        val replacement = TabBarSelection(listOf("home", "profile")) { selected.add("new:$it") }

        queuedBeforeRemoval()
        old.select("missing") // Stale contexts are inert, even when routes changed during reload.
        replacement.select("home")
        old.deactivate()
        assertEquals(listOf("new:home"), selected)
    }

    @Test
    fun selectionRoutesAreCapturedAtShellCreation() {
        val routes = mutableListOf("home")
        val selected = mutableListOf<String>()
        val selection = TabBarSelection(routes) { selected.add(it) }
        routes.clear()
        routes.add("later")
        selection.select("home")
        assertThrows(IllegalArgumentException::class.java) { selection.select("later") }
        assertEquals(listOf("home"), selected)
    }
}
