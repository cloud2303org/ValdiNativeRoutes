package android.content.res

import java.io.FileNotFoundException
import java.io.InputStream

class AssetManager(private val files: Map<String, String>) {
    val opened = mutableListOf<String>()

    fun open(path: String): InputStream {
        opened += path
        return (files[path] ?: throw FileNotFoundException(path)).byteInputStream()
    }
}
