import groovy.json.JsonSlurper

pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    // JitPack only for Blessed (BLE central, used by the io.nativeroutes.ble core).
    repositories { google(); mavenCentral(); maven("https://jitpack.io") }
}
val appConfig = providers.exec {
    workingDir(rootDir.parentFile)
    commandLine("node", "scripts/app-config.mjs", "read", "--json")
}.standardOutput.asText.get().let { JsonSlurper().parseText(it) as Map<*, *> }
rootProject.name = appConfig["name"] as String
include(":app")
