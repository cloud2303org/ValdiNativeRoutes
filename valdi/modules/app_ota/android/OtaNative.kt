package io.valdiroutes.app

import java.io.File

/** Initialized only on an applicable delta. Absence never prevents bundled/full-file startup. */
internal object OtaNative {
    init { System.loadLibrary("valdi_ota_patch") }
    external fun decode(input: String, output: String, maxOutput: Long): Int
    external fun encode(input: String, output: String, maxOutput: Long): Int
    external fun patch(old: String, patch: String, output: String, expectedSize: Long): Int
}

/** File-only boundary; implementations must bound output and never overwrite an existing output. */
internal interface OtaFileCodec {
    fun decode(input: File, output: File, maxOutput: Long): Int
    fun encode(input: File, output: File, maxOutput: Long): Int
    fun patch(old: File, patch: File, output: File, expectedSize: Long): Int
}

internal object NativeOtaFileCodec : OtaFileCodec {
    override fun decode(input: File, output: File, maxOutput: Long) =
        OtaNative.decode(input.absolutePath, output.absolutePath, maxOutput)
    override fun encode(input: File, output: File, maxOutput: Long) =
        OtaNative.encode(input.absolutePath, output.absolutePath, maxOutput)
    override fun patch(old: File, patch: File, output: File, expectedSize: Long) =
        OtaNative.patch(old.absolutePath, patch.absolutePath, output.absolutePath, expectedSize)
}
