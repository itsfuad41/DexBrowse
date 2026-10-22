plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fuad.dexbrowse"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fuad.dexbrowse"
        minSdk = 26
        targetSdk = 34
        versionCode = 4
        versionName = "2.1.0"

        buildConfigField(
            "String",
            "CONFIG_URL",
            "\"https://raw.githubusercontent.com/itsfuad41/DexBrowse/main/config.json\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false

            // Testing only. Configure persistent release signing
            // before distributing updates.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
