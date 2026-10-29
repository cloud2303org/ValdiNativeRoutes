// Copied from ExpoNativeRoutes android/app (io/nativeroutes/app/AppImages.kt): the image loader behind previewImage.
package io.valdiroutes.app

import android.content.Context
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.cachecontrol.CacheControlCacheStrategy
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import okhttp3.OkHttpClient
import okio.Path.Companion.toOkioPath

/** App-owned image policy, shared by Compose and native images. */
internal object AppImages {
    @OptIn(kotlin.time.ExperimentalTime::class, coil3.annotation.ExperimentalCoilApi::class)
    fun createLoader(context: Context): ImageLoader = ImageLoader.Builder(context.applicationContext)
        .memoryCache { MemoryCache.Builder().maxSizeBytes(32L * 1024 * 1024).build() }
        .diskCache {
            DiskCache.Builder().directory(context.cacheDir.resolve("native-images-coil-v1").toOkioPath())
                .maxSizeBytes(128L * 1024 * 1024).build()
        }
        .components {
            add(OkHttpNetworkFetcherFactory(
                callFactory = { OkHttpClient.Builder().cache(null).build() },
                cacheStrategy = { CacheControlCacheStrategy() },
            ))
        }
        .build()
}
