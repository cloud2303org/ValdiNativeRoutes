package io.valdiroutes.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** One selected root and an optional preparation request, never a per-tab back stack. */
internal class TabSelectionState {
    data class Request(val route: String, val generation: Long)

    var displayed by mutableStateOf<String?>(null)
        private set
    var pending by mutableStateOf<Request?>(null)
        private set
    private var generation = 0L

    val requested: String? get() = pending?.route ?: displayed

    fun reset(route: String?) {
        generation++
        displayed = route
        pending = null
    }

    fun request(route: String) {
        if (pending?.route == route) return
        generation++
        pending = if (route == displayed) null else Request(route, generation)
    }

    fun commit(request: Request): Boolean {
        if (pending != request) return false
        displayed = request.route
        pending = null
        return true
    }

    fun cancel(request: Request) {
        if (pending == request) {
            generation++
            pending = null
        }
    }
}
