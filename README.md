# capacitor-live-update-ios-repro

Minimal reproduction (based on [capawesome-team/.capacitor-app](https://github.com/capawesome-team/.capacitor-app)) for two `@capawesome/capacitor-live-update` 8.3.0 bugs on **iOS** with Capacitor 8:

1. **`reload()` does not apply the next bundle** — the webview reboots the *previous* bundle; a force-quit + relaunch applies it fine.
2. **manifest→manifest partial update never becomes active** — silent failure, device stays on the previous bundle forever; the identical dist uploaded as `zip` installs fine.

The app shows a large **marker** (`BUNDLE v1` in [src/js/app.js](src/js/app.js)), the current bundle id, and buttons for `sync()`, `reload()`, `getCurrentBundle()`, `getBlockedBundles()`, with an on-screen log.

## Setup

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
```

- Create an app in [Capawesome Cloud](https://cloud.capawesome.io) with a channel `Production`, and put its app id into `capacitor.config.json` → `plugins.LiveUpdate.appId` (replace `YOUR_CAPAWESOME_APP_ID`), then `npx cap sync ios` again.
- Run on a **physical iOS device** via Xcode.

## Bug 1 — `reload()` boots the previous bundle

1. In `src/js/app.js` change the marker to `BUNDLE v2`, then:
   ```bash
   npm run build
   npx @capawesome/cli apps:liveupdates:upload --app-id <APP_ID> --channel Production --path dist -y
   ```
2. In the app tap **sync()** → log shows a `nextBundleId` (download completes).
3. Tap **reload()**.

**Observed (iOS):** the webview visibly reloads, but the marker still reads `BUNDLE v1` and `getCurrentBundle()` still returns the old bundle. Repeating sync+reload never applies it (in an app that syncs at startup this becomes a reload loop).

**Then:** force-quit the app and relaunch → marker reads `BUNDLE v2`. The bundle was fine all along; only `reload()` fails to apply it.

**Expected:** `reload()` boots the next bundle, like the relaunch does. (On Android the same steps work.)

Suspicion (unproven): `reload()` → `setCurrentCapacitorServerPath` → `CAPBridgeViewController.setServerBasePath`; in Capacitor 8.4.2 `CapacitorBridge.setServerBasePath` starts with `guard FileManager.default.fileExists(atPath: url.path) else { return }` and the view controller reloads `config.serverURL` unconditionally afterwards — a silently failing guard would produce exactly this behavior.

## Bug 2 — manifest delta never becomes active

1. Marker → `BUNDLE v3`, `npm run build`, upload **as manifest**:
   ```bash
   npx @capawesome/cli apps:liveupdates:upload --app-id <APP_ID> --channel Production --path dist --artifact-type manifest -y
   ```
2. Force-quit + relaunch (twice) → `BUNDLE v3` active. First manifest install (full download) **works**.
3. Marker → `BUNDLE v4`, build, upload as manifest again (this one is a **delta** — only a few files changed).
4. Force-quit + relaunch repeatedly.

**Observed (iOS):** the app stays on `BUNDLE v3` forever. No error, no event, nothing in the UI or dashboard. `getBlockedBundles()` is the only hint (with `autoBlockRolledBackBundles: true`, consistent with a failed install being rolled back and blocklisted).

5. Upload the identical `v4` dist as zip:
   ```bash
   npx @capawesome/cli apps:liveupdates:upload --app-id <APP_ID> --channel Production --path dist -y
   ```
6. Force-quit + relaunch → `BUNDLE v4` active immediately.

**Expected:** the manifest delta installs; or a failed install surfaces an error instead of silently blocklisting the bundle.

## Environment

- `@capawesome/capacitor-live-update` 8.3.0
- `@capacitor/core` / `@capacitor/ios` 8.4.2
- Observed on physical iPhones; Android (Pixel 7a) applies bundles via `reload()` correctly.
