package io.valdiroutes.mmkv

import android.content.Context
import com.tencent.mmkv.MMKV
import io.valdiroutes.mmkv.StorageHost
import io.valdiroutes.mmkv.StorageReadReply

/**
 * `api.*StorageSync` (storage.ts): a dedicated string store in MMKV's default directory (files/mmkv). Values are
 * JSON text serialized by JS; the bridge carries strings only. Called on the JS thread; MMKV is thread safe.
 */
class StorageHostImpl(context: Context) {
    private val mmkv: MMKV by lazy {
        MMKV.initialize(context)
        MMKV.mmkvWithID("app-structured")
    }

    val host = StorageHost(
        { key ->
            val stored = mmkv.decodeString(key)
            StorageReadReply(stored != null, stored ?: "")
        },
        { request -> mmkv.encode(request.key, request.value) },
        { key -> mmkv.removeValueForKey(key) },
        { mmkv.clearAll() },
    )
}
