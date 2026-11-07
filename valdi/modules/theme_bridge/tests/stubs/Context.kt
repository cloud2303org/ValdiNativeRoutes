package android.content

import android.content.res.AssetManager

// Only Android asset access is substituted; generated Valdi models/runtime are real.
open class Context(val assets: AssetManager) {
    open val applicationContext: Context get() = this
}
