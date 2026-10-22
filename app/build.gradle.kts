plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val githubRepo =
    (project.findProperty("GITHUB_REPO") as String?)
        ?: "itsfuad41/DexBrowse"

android {

    namespace = "com.fuad.dexbrowse"

    compileSdk = 34

    defaultConfig {

        applicationId = "com.fuad.dexbrowse"

        minSdk = 26

        targetSdk = 34

        versionCode = 1

        versionName = "2.0.0"

        buildConfigField(
            "String",
            "GITHUB_REPO",
            "\"$githubRepo\""
        )
    }

    buildTypes {

        release {

            isMinifyEnabled = false

            // Testing only. Production releases require
            // a persistent private signing keystore.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {

        sourceCompatibility = JavaVersion.VERSION_17

        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {

    implementation("androidx.core:core-ktx:1.13.1")

    implementation("androidx.appcompat:appcompat:1.7.0")
}
