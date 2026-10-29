// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/NativeImages.kt).
package io.nativeroutes.ui

import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import coil3.ImageLoader
import coil3.request.ImageRequest

/** Typed native image service registration. The Host supplies transport and cache policy. */
object NativeImages {
    @Volatile private var instance: ImageLoader? = null

    fun install(imageLoader: ImageLoader) { instance = imageLoader }

    fun loader(): ImageLoader = checkNotNull(instance) {
        "Install the Host image loader with NativeImages.install before rendering native images"
    }

    fun request(context: Context, source: String): ImageRequest.Builder = ImageRequest.Builder(context)
        .data(source)
        .listener(onSuccess = { _, result ->
            if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
                // Do not log addresses or request headers.
                Log.i("NativeImages", "origin=${result.dataSource}")
            }
        })
}
