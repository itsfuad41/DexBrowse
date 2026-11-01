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

`desktop/` is the DexBrowse PC browser (Electron, so it runs real Chromium) with a Brave-style interface.
Windows installer: `DexBrowse-PC-Setup.exe`. Run locally: `cd desktop && npm install && npm start`

- **Shields** (shield button in the toolbar): per-site and global blocking of ads and trackers, HTTPS upgrades,
  third-party cookies and scripts, Do Not Track / Global Privacy Control, WebRTC IP protection, blocked counters.
- **Private windows** (Ctrl+Shift+N): separate in-memory session, no history, cookies, bookmarks, saved logins or sync.
- **Passcode lock**: scrypt-hashed passcode, lock on start, auto-lock timer, Ctrl+Shift+L.
- **Saved logins**: offer to save, autofill, encrypted with the operating system keystore.
- **Bookmarks** and bookmarks bar, **reading list**, **history**, **downloads manager** (Library panel).
- **Tabs**: pinned tabs, mute, duplicate, reopen closed tab, session restore, page context menu.
- **Find in page**, print, save as PDF, zoom, developer tools.
- **Settings page** (Ctrl+,): appearance, Shields, search engine (Brave, Google, DuckDuckGo, Bing, Startpage, Ecosia,
  Perplexity, Yahoo), startup, passwords, security, site permissions, downloads, 20 user agents, Google sync, clear data.
- **Start page** with clock, privacy stats and top sites.
- **Profiles (same as the phone app)**: every profile has its own passcode, history, logins and extensions. On start you
  type a passcode and the profile it belongs to opens; profiles are never listed. Add profile and "Forgot passcode?"
  (recovery phrase) are on the passcode screen. A profile can only manage or delete itself after you open it with its
  passcode. Two wrong passcodes open a private **guest browser** (throw-away data, no sync). Each profile is its own
  process, so several can run at once; launching DexBrowse again shows the passcode screen.
- **Import**: Settings > Import from another browser reads bookmarks and history from Chrome, Edge, Brave, Vivaldi,
  Opera and Firefox profiles; passwords come from the CSV export of the other browser, bookmarks also from `.html`.
- **Saved logins for many accounts**: several usernames per site; a "DexBrowse saved logins" list appears when you
  focus the login field and only the account you pick is filled.
- **Google sign-in** happens in a DexBrowse window (a system-browser option is kept as fallback).
- **Extensions**: install from the Chrome Web Store ("Add to DexBrowse" bar on store pages, or paste a link/ID),
  from a `.crx`/`.zip`, or load an unpacked folder. Electron implements a subset of Chrome's extension APIs, so
  content-script extensions work best and toolbar popups are not shown.
- **Fewer CAPTCHAs**: sends real Chrome client hints (`sec-ch-ua`, languages), hides automation flags and never
  blocks or strips cookies for reCAPTCHA / hCaptcha / Cloudflare and major sign-in providers.
- Developer: Md. Fuad Hasan. The app icon matches the Android app.

Shortcuts: Ctrl+T new tab, Ctrl+W close, Ctrl+Shift+T reopen, Ctrl+L address bar, Ctrl+D bookmark, Ctrl+F find,
Ctrl+P print, Ctrl+H history, Ctrl+J downloads, Ctrl+Shift+O bookmarks, Ctrl+Shift+B bookmarks bar, Ctrl+, settings,
Ctrl+Tab / Ctrl+1-9 switch tabs, Alt+Left/Right back/forward, Ctrl +/-/0 zoom, F12 developer tools.

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

Push a tag such as `v2.14.0` to build and publish both the APK and the PC installer to GitHub Releases.
