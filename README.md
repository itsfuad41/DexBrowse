# DexBrowse By Fuad

DexBrowse is a desktop-style Android browser built using Kotlin and Android WebView.

## Features

- Password authentication
- Username support
- Password recovery phrase
- Desktop Windows User-Agent
- Multiple browser tabs
- Browsing history
- Custom homepage
- Google Search
- Bing Search
- DuckDuckGo
- Brave Search
- Perplexity AI Search
- GitHub remote configuration
- Kill switch
- Minimum-version enforcement
- GitHub Actions APK builder
- GitHub Releases

## Android Requirements

Minimum Android version: Android 8.0

Application ID: com.fuad.dexbrowse

## Build APK

1. Upload the Android project to GitHub.
2. Open the Actions tab.
3. Select Build DexBrowse APK.
4. Run the workflow.
5. Download the generated APK artifact.

## Version Control

Version information is stored in:

app/build.gradle.kts

Update versionCode and versionName before creating a release.

## Remote Control

Remote configuration is stored in config.json.

Set kill_switch to true to disable browsing after the application retrieves the updated configuration.

## Author

Fuad

DexBrowse By Fuad
