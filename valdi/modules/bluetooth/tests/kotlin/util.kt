package android.util
object Base64 {
    const val DEFAULT = 0
    fun decode(value: String, flags: Int): ByteArray = java.util.Base64.getDecoder().decode(value)
}
class SparseArray<T> {
    fun size() = 0
    fun keyAt(index: Int) = 0
    fun valueAt(index: Int): T? = null
}
