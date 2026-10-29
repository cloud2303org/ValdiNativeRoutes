package io.valdiroutes.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import io.valdiroutes.pages.TokenStore
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * auth.ts's TokenStore: the token encrypted (AES-GCM) with a key that never leaves the Android Keystore, the result in
 * SharedPreferences. `has` only looks for the entry, so startApp doesn't wait for the Keystore; the key is first used
 * when a page reads the token. Called on the JS thread. The preferences are excluded from backups (data_extraction_rules.xml),
 * since the key isn't backed up either.
 */
class TokenStoreImpl(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    val store = TokenStore(
        { prefs.contains(KEY_TOKEN) },
        { read() },
        { token -> write(token) },
        { prefs.edit().remove(KEY_TOKEN).apply() },
    )

    private fun read(): String {
        val stored = prefs.getString(KEY_TOKEN, null) ?: return ""
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: Exception) {
            // The key is gone (cleared app data restored from elsewhere, a new device): signed out.
            Log.w(TAG, "Can't decrypt the token; dropping it", e)
            prefs.edit().remove(KEY_TOKEN).apply()
            ""
        }
    }

    private fun write(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        // commit: the next cold start must see it even if the process dies right after signing in.
        prefs.edit().putString(KEY_TOKEN, Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val TAG = "TokenStore"
        const val KEY_TOKEN = "token"
        const val KEY_ALIAS = "io.valdiroutes.session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}
