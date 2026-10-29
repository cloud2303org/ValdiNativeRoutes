pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    // JitPack only for Blessed (BLE central, used by the io.nativeroutes.ble core).
    repositories { google(); mavenCentral(); maven("https://jitpack.io") }
}
rootProject.name = "ValdiNativeRoutes"
include(":app")
