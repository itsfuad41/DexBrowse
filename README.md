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
- Chromium capabilities: camera/microphone, location, file upload, downloads, fullscreen video
- 29 user agents (Windows, Mac, Linux, ChromeOS, iPhone, iPad, Android)
- Google sign-in and history sync between the phone and the PC app

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

## PC App

`desktop/` is the DexBrowse PC browser (Electron, so it runs real Chromium): tabs, address bar,
the same user agents, local history and Google sync. Windows installer: `DexBrowse-PC-Setup.exe`.

Shortcuts: Ctrl+T new tab, Ctrl+W close, Ctrl+L address bar, Ctrl+R / F5 reload,
Ctrl+H history, Ctrl+Tab switch tabs, Alt+Left/Right back/forward, Ctrl +/-/0 zoom, F12 DevTools.

Run locally: `cd desktop && npm install && npm start`

## Google sign-in and history sync

Phone and PC sign in with the same Google account (via Firebase) and share browsing history in
Firestore at `users/{uid}/history`. Open **History > All devices** on the PC, or
**Settings > Google sync** on the phone.

One-time setup:

1. Firebase: enable **Authentication > Google** and create a **Firestore** database.
2. Publish `firestore.rules` (Firestore > Rules) so each account can only read its own history.
3. Google Cloud > OAuth consent screen: add your Google account as a test user while the app is in Testing.
4. Add these GitHub Actions secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `DEXBROWSE_GOOGLE_CLIENT_ID` | Desktop-app OAuth client ID |
| `DEXBROWSE_GOOGLE_CLIENT_SECRET` | Desktop-app OAuth client secret |
| `DEXBROWSE_FIREBASE_API_KEY` | Firebase API key |
| `DEXBROWSE_FIREBASE_PROJECT_ID` | Firebase project ID |

The keys are injected at build time and are not stored in the repository.
If Firebase answers `INVALID_IDP_RESPONSE` on sign-in, open Authentication > Sign-in method > Google >
Web SDK configuration and add the desktop client ID to the safelist.

## Releases

Push a tag such as `v2.13.0` to build and publish both the APK and the PC installer to GitHub Releases.
