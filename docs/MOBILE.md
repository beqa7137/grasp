# Mobile (iOS and Android)

Grasp ships to phones as a Capacitor 8 shell around the same Angular build that runs on the web. The native projects are committed: `apps/app/ios` (Swift Package Manager, no CocoaPods) and `apps/app/android` (Gradle).

## Requirements

| Platform | Tooling                                                    | Targets                              |
| -------- | ---------------------------------------------------------- | ------------------------------------ |
| iOS      | Xcode 26+ (Capacitor 8 requirement)                        | iOS 15+                              |
| Android  | Android Studio Otter (2025.2.1) or newer, JDK 21, AGP 8.13 | minSdk 24, target and compile SDK 36 |

Native plugins: `@capacitor/preferences` (local storage), `@capacitor/haptics`, `@capacitor/local-notifications` (study reminders).

## Day to day

```bash
cd apps/app
npm run cap:sync        # production web build → runtime config → copy into both native projects
npm run cap:ios         # open Xcode
npm run cap:android     # open Android Studio
```

`cap:sync` writes `config.json` into the web assets so the native app knows its API (see the README). Dev builds allow cleartext HTTP to a local API; `GRASP_RELEASE=1` requires an https `GRASP_API_URL`. When an API URL is set, the ~14 MB Python runtime is not bundled: the app downloads it from the server the first time Python code runs.

After adding or upgrading a Capacitor plugin, run `npm run cap:sync` and commit the regenerated native files (`ios/App/CapApp-SPM/Package.swift`, `android/capacitor.settings.gradle`, and so on).

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

## Continuous integration

`.github/workflows/native.yml` runs when the app, the engine or dependencies change:

- **Android:** JDK 21 on Ubuntu, `cap:sync`, then `./gradlew assembleDebug`. The debug APK is uploaded as an artifact for 7 days, so a reviewer can sideload it.
- **iOS:** the `macos-26` runner (Xcode 26), `cap:sync`, then an unsigned `xcodebuild` for the iOS Simulator. The zipped `App.app` is uploaded too; unzip it and drag it onto a running simulator to install.

Neither job signs or publishes anything. By default the apps call a local development API. To test against a deployment on emulators, run **Native builds** by hand with its API URL (for example `https://grasp-rho-taupe.vercel.app/api`): both builds then use release settings (https only) and that API.

## Release checklist

1. Bump the version: `versionCode` and `versionName` in `android/app/build.gradle`, and `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in Xcode.
2. `GRASP_RELEASE=1 GRASP_API_URL=https://<host>/api GRASP_VERSION=<version> npm run cap:sync`.
3. **iOS privacy manifest.** `@capacitor/preferences` stores data in `UserDefaults`, which is a required-reason API. Add a `PrivacyInfo.xcprivacy` to the App target that declares `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`, and that no tracking or tracking domains are used. Capacitor's own frameworks already ship their manifests.
4. Signing: an Apple distribution certificate and provisioning profile in Xcode; an upload keystore for Android (keep it out of the repo).
5. Store listings must disclose that interview transcripts are sent to Anthropic's Claude API and that sign-in uses an email address. This matches the in-app notice and [PILOT.md](PILOT.md).
