package android.content

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager

open class Context {
    val applicationContext get() = this
    val applicationInfo = ApplicationInfo()
    val packageManager = PackageManager()
    private val receivers = mutableListOf<BroadcastReceiver>()
    fun registerReceiver(receiver: BroadcastReceiver) { receivers.add(receiver) }
    fun unregisterReceiver(receiver: BroadcastReceiver) { receivers.remove(receiver) }
    fun sendBroadcast(intent: Intent) { receivers.toList().forEach { it.onReceive(this, intent) } }
}
abstract class BroadcastReceiver {
    val isOrderedBroadcast = false
    fun abortBroadcast() {}
    abstract fun onReceive(context: Context, intent: Intent)
}
class Intent(val action: String? = null) {
    private val extras = mutableMapOf<String, Any>()
    fun putExtra(name: String, value: Any): Intent { extras[name] = value; return this }
    fun getExtra(name: String): Any? = extras[name]
}
class IntentFilter(action: String) { var priority: Int = 0 }
