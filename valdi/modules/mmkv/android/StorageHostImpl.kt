package io.valdiroutes.mmkv

import android.content.Context
import com.tencent.mmkv.MMKV
import io.valdiroutes.mmkv.StorageHost
import io.valdiroutes.mmkv.StorageReadReply

/**
 * `api.*StorageSync` (storage.ts): a dedicated structured store in MMKV's default directory (files/mmkv).
 * Called on the JS thread; MMKV is thread safe. Only the persistence layer handles JSON text.
 */
class StorageHostImpl(context: Context) {
    private val mmkv: MMKV = run {
        MMKV.initialize(context)
        MMKV.mmkvWithID("app-structured")
    }

    val host = StorageHost(
        { key -> StorageCodec.decode(mmkv.decodeString(key)).let { StorageReadReply(it.found, it.payload, it.error) } },
        { request -> mmkv.encode(request.key, StorageCodec.encode(request.payload)) },
        { key -> mmkv.removeValueForKey(key) },
        { mmkv.clearAll() },
    )
}
