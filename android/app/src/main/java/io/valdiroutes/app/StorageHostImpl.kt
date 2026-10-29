package io.valdiroutes.app

import android.content.Context
import com.tencent.mmkv.MMKV
import io.valdiroutes.pages.StorageHost

/**
 * `api.*StorageSync` (storage.ts): one MMKV instance in MMKV's default directory (files/mmkv), as ExpoNativeRoutes'
 * stores. Called on the JS thread; MMKV is thread safe. Values are JSON text, stored as strings.
 */
class StorageHostImpl(context: Context) {
    private val mmkv: MMKV = run {
        MMKV.initialize(context)
        MMKV.mmkvWithID("app")
    }

    val host = StorageHost(
        { key -> mmkv.decodeString(key) ?: "" },
        { key, json -> mmkv.encode(key, json) },
        { key -> mmkv.removeValueForKey(key) },
        { mmkv.clearAll() },
    )
}
