# Mobile (iOS and Android)

Grasp ships to phones as a Capacitor 8 shell around the same Angular build that runs on the web. The native projects are committed: `apps/app/ios` (Swift Package Manager, no CocoaPods) and `apps/app/android` (Gradle).

## Requirements

| Platform | Tooling                                                    | Targets                              |
| -------- | ---------------------------------------------------------- | ------------------------------------ |
| iOS      | Xcode 26+ (Capacitor 8 requirement)                        | iOS 15+                              |
| Android  | Android Studio Otter (2025.2.1) or newer, JDK 21, AGP 8.13 | minSdk 24, target and compile SDK 36 |

Native plugins: `@capacitor/preferences` (local storage), `@capacitor/haptics`, `@capacitor/local-notifications` (study reminders), `@capgo/capacitor-social-login` (Google and GitHub sign-in).

## Day to day

```bash
cd apps/app
npm run cap:sync        # production web build → runtime config → copy into both native projects
npm run cap:ios         # open Xcode
npm run cap:android     # open Android Studio
```

`cap:sync` writes `config.json` into the web assets so the native app knows its API (see the README), and the iOS URL scheme for Google sign-in (see [below](#sign-in-google-and-github)). Dev builds allow cleartext HTTP to a local API; `GRASP_RELEASE=1` requires an https `GRASP_API_URL`. When an API URL is set, the ~14 MB Python runtime is not bundled: the app downloads it from the server the first time Python code runs.

After adding or upgrading a Capacitor plugin, run `npm run cap:sync` and commit the regenerated native files (`ios/App/CapApp-SPM/Package.swift`, `android/capacitor.settings.gradle`, and so on).

## Sign-in (Google and GitHub)

Accounts are optional; see [ACCOUNTS.md](ACCOUNTS.md) for the flows. Both providers go through `@capgo/capacitor-social-login`, and the app reads the client ids from `GET /api/auth/config` at run time. The native projects only carry what must exist at build time: the plugin's provider set and the URL schemes.

- **Bundled SDKs.** `capacitor.config.ts` enables only the plugin's Google provider. Its `cap sync` hook applies that by editing the plugin's own `Package.swift` and `gradle.properties` inside `node_modules`, which drops the Facebook SDK (and its `AD_ID` permission) and Alamofire. Build only after a `cap sync`: straight after `npm install` those files still include every SDK. GitHub uses the plugin's built-in OAuth2 engine, which needs no flag.
- **URL schemes:**
  - `dev.grasp.app`, for GitHub's redirect `dev.grasp.app://oauth/github`. On iOS (`Info.plist`) the flow finishes inside `ASWebAuthenticationSession`. On Android, `AndroidManifest.xml` gives the `singleTask` `MainActivity` a VIEW/BROWSABLE filter for this scheme and host `oauth`, so Custom Tabs hand the redirect to the plugin through `onNewIntent`.
  - `$(GOOGLE_IOS_URL_SCHEME)`, iOS only: the iOS client's reversed id (`com.googleusercontent.apps.<id>`), which GoogleSignIn requires.
- **GitHub OAuth app:** besides the web callback, register `dev.grasp.app://oauth/github` as a callback URL. The app sends the code to the API's token endpoint, which holds the client secret, so the app never has one.
- **Google on iOS.** If the reversed iOS client id is not a registered URL scheme, GoogleSignIn raises an exception and the app crashes, so one variable sets both halves. Set `GRASP_GOOGLE_IOS_CLIENT_ID=<id>.apps.googleusercontent.com` for `npm run cap:sync`: `scripts/write-runtime-config.mjs` checks its shape, writes it to `config.json` as `googleIosClientId`, and writes `GOOGLE_IOS_URL_SCHEME = com.googleusercontent.apps.<id>` to the gitignored `ios/google-signin.xcconfig`, which `ios/debug.xcconfig` and `ios/release.xcconfig` (the App target's base configurations) include. Without the variable it writes the placeholder `dev.grasp.app.google-unset`, so the build stays valid. The app offers Google on iOS only when `googleIosClientId` equals the server's iOS client id. After changing the variable, run `cap:sync` again before building in Xcode, and never set `GOOGLE_IOS_URL_SCHEME` in the target's build settings: those override the xcconfig and bring the crash back.

  There is no `GIDSignIn.handle(url)` hook in `SceneDelegate`: on iOS 12 and later GoogleSignIn 9 completes inside `ASWebAuthenticationSession`, and that hook only serves iOS 10 and Google's Device Policy app (managed Workspace devices).

- **Google on Android** uses Credential Manager with the **web** client id. Google also needs an **Android** OAuth client in the same Cloud project for package `dev.grasp.app` and the SHA-1 of every key that signs a build you test: the shared test key below, each developer's own debug key (`./gradlew signingReport`), and later the upload key and the Play App Signing key. Its client id (`GOOGLE_ANDROID_CLIENT_ID`) is never used in code. A missing fingerprint shows up in Logcat (filter `GoogleProvider`) as `[28444] Developer console is not set up correctly`. `MainActivity` stays a plain `BridgeActivity`: the plugin needs `ModifiedMainActivityForSocialLoginPlugin` only for extra Google scopes or offline mode, which Grasp does not use.
- **Google consent screen.** It must be published (**In production**, see [ACCOUNTS.md](ACCOUNTS.md#google-cloud)). While it is in **Testing**, Google turns away every account that is not a listed test user, on every platform: the web popup and the iOS sign-in sheet show `Error 403: access_denied`, and Android sign-in fails.
- **CI:** `native.yml` passes the `GOOGLE_IOS_CLIENT_ID` secret to `cap:sync` as `GRASP_GOOGLE_IOS_CLIENT_ID` in both jobs, which also sets the iOS URL scheme. Without the secret, for example on forks, the placeholder is written and the iOS build does not offer Google.

## Study reminders

Settings → Reminders (native only) schedules a local notification per day at the learner's chosen time, for the next 7 days, only on days with something to do. The engine's `planReminders()` decides what each one says; `ReminderService` (`apps/app/src/app/reminders/`) replans after every progress change and whenever the app returns to the foreground, and opens the review when a reminder is tapped. See [SPACED_REPETITION.md](SPACED_REPETITION.md#reminders).

Platform details:

- **Permission** is requested when the learner turns reminders on, never at launch. If it is declined, the switch stays off and the screen explains how to allow it in system settings.
- **Android 12+ alarms are inexact on purpose** (`isExactNotification: false`). Exact alarms would send the learner to the "Alarms & reminders" settings screen on every replan, and Google Play only grants `SCHEDULE_EXACT_ALARM` to alarm and calendar apps, so the manifest removes it. Inexact means Android may deliver a reminder a few minutes late.
- **Android status-bar icon:** `res/drawable/ic_stat_grasp.xml`, a white silhouette as Android requires, tinted with the accent color (`capacitor.config.ts`).
- Reminder preferences are per device and are not synced.

## Design Lab on a phone

The board is a 900 × 480 canvas shown through a zoomable viewport (`pages/design/viewport.ts`). Phones open at a readable zoom on the left of the design, where traffic enters. Pinch to zoom, drag the background to pan, and use the +, − and fit buttons. On desktop, Ctrl/⌘ + scroll (and trackpad pinch) zoom around the cursor. Dragging nodes and connection ports works at any zoom.

## Icons and splash screens

`apps/app/scripts/generate-native-assets.py` draws the icon (three connected nodes on the app's dark background) and the splash screens into both native projects, at the exact size of each template image. Run it again after changing the design:

```bash
python3 -m pip install pillow
python3 apps/app/scripts/generate-native-assets.py
```

## Light and dark theme

The theme (Settings → Appearance: System, Light or Dark) is a per-device setting. `ThemeService` copies it to `localStorage`, where `public/theme-boot.js` reads it before the first paint, since the native Preferences store is out of that script's reach.

- **Splash:** it stays dark in both themes, like the `backgroundColor` in `capacitor.config.ts`, so a light-theme launch cuts from the dark splash to the light app. A light splash would need Android `drawable-night` and `values-night` resources and an iOS "Any/Dark" splash image set, and it would still follow the device, not the in-app choice.
- **Status and navigation bars:** `SystemBars` starts with light icons (`style: 'DARK'` in `capacitor.config.ts`) to suit the dark splash, and `ThemeService` switches them with the theme.
- **Check on a device:** the bar icons with Light chosen on a dark device and Dark on a light one, a switch while the app runs, and a device light/dark switch with System chosen. If Android's web view misses that last change, System catches up on the next launch.

## Continuous integration

`.github/workflows/native.yml` runs when the app, the engine or dependencies change:

- **Android:** JDK 21 on Ubuntu, `cap:sync`, then `./gradlew assembleDebug`. The debug APK is uploaded as an artifact for 7 days, so a reviewer can sideload it.
- **iOS:** the `macos-26` runner (Xcode 26), `cap:sync`, then an unsigned `xcodebuild` for the iOS Simulator. The zipped `App.app` is uploaded too; unzip it and drag it onto a running simulator to install.

Neither job publishes to a store. The Android APK is signed with a shared test key from the `ANDROID_TEST_KEYSTORE` secret (SHA-1 `3E:E1:11:6A:13:18:B7:B4:C9:92:5C:9A:85:6E:65:FF:90:45:E1:B8`), so its fingerprint is stable for Google sign-in; release builds use their own key. By default the apps call a local development API. To test against a deployment on emulators, run **Native builds** by hand with its API URL (for example `https://grasp-rho-taupe.vercel.app/api`): both builds then use release settings (https only) and that API. Those runs also replace the `test-build` pre-release with both files, so they can be fetched without the Actions UI: `gh release download test-build`.

## Release checklist

1. Bump the version: `versionCode` and `versionName` in `android/app/build.gradle`, and `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in Xcode.
2. `GRASP_RELEASE=1 GRASP_API_URL=https://<host>/api GRASP_VERSION=<version> GRASP_GOOGLE_IOS_CLIENT_ID=<ios client id> npm run cap:sync`. The iOS client id also registers the URL scheme Google sign-in needs (see [Sign-in](#sign-in-google-and-github)).
3. **iOS privacy manifest.** `@capacitor/preferences` stores data in `UserDefaults`, which is a required-reason API. Add a `PrivacyInfo.xcprivacy` to the App target that declares `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`, and that no tracking or tracking domains are used. Sign-in collects an email address and a user id (linked to the user, for app functionality, not tracking): declare both as collected data types. Capacitor's own frameworks and GoogleSignIn already ship their manifests.
4. Signing: an Apple distribution certificate and provisioning profile in Xcode; an upload keystore for Android (keep it out of the repo). Register the upload key's and Play App Signing's SHA-1s with Google, or Google sign-in fails on store builds.
5. Store listings must disclose that interview transcripts are sent to Anthropic's Claude API and that optional sign-in goes through Google or GitHub, which share the account's email address and account id with Grasp. This matches the in-app notice and [PILOT.md](PILOT.md).
6. **Sign in with Apple.** App Review guideline 4.8 expects apps that offer a third-party login such as Google to also offer an equivalent privacy-focused one. Grasp offers only Google and GitHub, so check the current guideline text before submitting to the App Store.
