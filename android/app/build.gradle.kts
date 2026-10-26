plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "io.valdiroutes.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.valdiroutes.app"
        minSdk = 28
        targetSdk = 37
        versionCode = 1
        versionName = "0.1"
        // The aar carries arm32/arm64/x86_64; the demo only ships arm64.
        ndk { abiFilters += "arm64-v8a" }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Local demo builds only; production signing belongs to the consuming app.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
    // Valdi runtime + compiled TS pages, produced by `valdi export android`.
    implementation(files("libs/valdi_pages.aar"))

    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.navigation3:navigation3-runtime:1.1.7")
    implementation("androidx.navigation3:navigation3-ui:1.1.7")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.dynamicanimation:dynamicanimation:1.1.0")
}
