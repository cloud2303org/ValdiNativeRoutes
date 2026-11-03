package androidx.core.content
import android.content.*

object ContextCompat {
    const val RECEIVER_EXPORTED = 2
    fun checkSelfPermission(context: Context, permission: String) = 0
    fun registerReceiver(context: Context, receiver: BroadcastReceiver, filter: IntentFilter, flags: Int) {
        context.registerReceiver(receiver)
    }
}
object IntentCompat {
    fun <T> getParcelableExtra(intent: Intent, name: String, cls: Class<T>): T? =
        intent.getExtra(name)?.let { if (cls.isInstance(it)) cls.cast(it) else null }
}
