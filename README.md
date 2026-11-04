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
- **Permissions**: notifications, microphone, camera, speaker selection and screen sharing always ask first (or follow the
  default you set in Settings > Site settings); sites cannot show notifications silently. Allowed notifications appear as system notifications.
- **Google sign-in**: pages get the same `window.chrome` objects and client hints as real Chrome; if Google still refuses, a bar offers to continue in your default browser (Google sync does this automatically).
- **User agent button** in the toolbar switches identity without reloading open tabs.
- **Address bar suggestions** from bookmarks, history and your search engine; bookmarks bar with drag to reorder, edit/delete menu and "only on new tab" mode.
- **Memory saver**: unused tabs sleep (Settings > Performance & memory).
- **Auto-update**: the installed app checks GitHub releases, downloads new versions in the background and installs them on restart (Settings > About).
- **Lock**: the profile button and Ctrl+Shift+L (changeable in Settings > Security) lock the browser until the profile passcode is entered; optional auto-lock timer.
- **Google sign-in** (Settings > Google sync) happens in a DexBrowse window (a system-browser option is kept as fallback).
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

### 2.19.0 (PC)
- **Split view**: show two tabs side by side (tab right-click or main menu → Split view), drag the divider to resize, swap sides or exit from the divider buttons.
- **Password manager**: search, grouped by site, add/edit entries, built-in password generator, "Reused" and "Weak" warnings. Forms with a new-password field offer a strong generated password and a "Manage passwords" link.
- **About**: developer contact card.
- **Auto-update**: updater log (About → Update log), update bar shown in windows opened after the download, and other DexBrowse processes are closed before the installer runs.

### 2.20.0 (PC)
- **Bookmarks like Brave**: "Bookmark added" popup under the star (name, folder, remove), folders on the bookmarks bar, "Other bookmarks", dropdowns, Add page / Add folder, Open in new window / private window, bookmark manager with folders, Bookmark all tabs, Export to HTML.
- **Browser-style title bar**: tabs sit in the title bar; no separate title row above them.
- **Switching profile**: the profile you left is locked, all its tabs are put to sleep and its window is minimized, not closed.

### 2.20.1 (PC)
- Closing the last tab closes the window (like Chrome/Brave).
- Guest browser no longer shows an error box when Windows holds cache files at exit.
- Task Manager description is now just "DexBrowse".

### 2.21.0 (Android)
Brought the PC features to the Android app: Brave-style bookmarks with folders and a "Bookmark added" popup, a password manager (search, add/edit, generator, reused/weak warnings, strong-password suggestion on sign-up forms), a developer card in About, update check against GitHub releases, split view, and closing the last tab closes the browser.

### 2.22.0
- PC: extensions work like Chrome. Pinned extensions show on the toolbar and open their popup, options pages open in a tab, extensions can be pinned, turned off/on and removed from the puzzle menu or the toolbar icon's right-click menu.
- PC: closing a tab stops its audio/video and the window ends its process, so no media control stays in the Windows media panel.
- Android: "I am not a robot" checks now complete (third-party cookies are accepted).

### 2.23.0
- PC: drag tabs to rearrange them (pinned and normal tabs stay in their own groups); more tab menu entries (new tab to the right, close tabs to the right, reopen closed tab).
- PC: Brave-style password list (Website / Username / Password columns, eye icon, ⋮ menu, filter by reused/weak, Import and Export CSV).
- Android: move tabs up/down in the tab list, Close all tabs.
