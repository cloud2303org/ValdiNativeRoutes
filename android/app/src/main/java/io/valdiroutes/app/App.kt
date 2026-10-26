package io.valdiroutes.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        ValdiHost.init(this)
    }
}
