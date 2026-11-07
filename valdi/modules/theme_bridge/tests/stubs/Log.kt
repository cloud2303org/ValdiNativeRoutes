package android.util

object Log {
    val warnings = mutableListOf<String>()

    @JvmStatic
    fun w(tag: String, message: String): Int {
        warnings += "$tag: $message"
        return 0
    }
}
