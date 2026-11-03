package android.os

class Looper {
    companion object {
        private val main = Looper()
        fun getMainLooper() = main
        fun myLooper() = main
    }
}
class Handler(val looper: Looper) {
    fun post(action: () -> Unit): Boolean { TestClock.post(action); return true }
    fun postDelayed(action: () -> Unit, delay: Long): Boolean {
        TestClock.schedule(delay, action)
        return true
    }
}
// OS boundary clock only: production timer closures run unchanged, on demand.
object TestClock {
    private data class Timer(val due: Long, val sequence: Long, val action: () -> Unit)
    private val timers = mutableListOf<Timer>()
    private val posted = ArrayDeque<() -> Unit>()
    private var now = 0L
    private var sequence = 0L
    var executed = 0
        private set
    fun schedule(delay: Long, action: () -> Unit) {
        timers.add(Timer(now + delay.coerceAtLeast(0), sequence++, action))
    }
    fun post(action: () -> Unit) { posted.add(action) }
    fun runPosted() { while (posted.isNotEmpty()) posted.removeFirst().invoke() }
    fun advanceBy(duration: Long) {
        require(duration >= 0)
        val target = now + duration
        while (true) {
            val next = timers.minWithOrNull(compareBy<Timer> { it.due }.thenBy { it.sequence }) ?: break
            if (next.due > target) break
            timers.remove(next)
            now = next.due
            executed++
            next.action()
        }
        now = target
    }
}
object Build {
    object VERSION { const val SDK_INT = 36 }
    object VERSION_CODES { const val S = 31; const val Q = 29 }
}
class ParcelUuid(val uuid: java.util.UUID)
