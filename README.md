# capacitor-live-update-ios-repro

Minimal reproduction (based on [capawesome-team/.capacitor-app](https://github.com/capawesome-team/.capacitor-app)) for two `@capawesome/capacitor-live-update` reports on **iOS** with Capacitor 8 (originally observed on plugin 8.3.0; now tracking **8.4.0** per maintainer request):

1. **`reload()` does not apply the next bundle** — the webview reboots the *previous* bundle; a force-quit + relaunch applies it fine ([capawesome-team/capacitor-plugins#969](https://github.com/capawesome-team/capacitor-plugins/issues/969)).
2. **manifest→manifest partial update never becomes active** — silent failure, device stays on the previous bundle forever; the identical dist uploaded as `zip` installs fine ([capawesome-team/capacitor-plugins#970](https://github.com/capawesome-team/capacitor-plugins/issues/970)).

The app shows a large **marker** (`BUNDLE v1` in [src/js/app.js](src/js/app.js)), the current bundle id, and buttons for `sync()`, `reload()`, `getCurrentBundle()`, `getBlockedBundles()`, with an on-screen log. On boot and after a (failed) `reload()` it also logs the WebView **origin** and the native **`serverBasePath`** (`WebView.getServerBasePath()`), so a failed reload discriminates between "bridge config was never updated" and "config updated but stale content served".

## Outcome (2026-08-18) — both mysteries resolved

Full re-test on the **same physical iPhone** (iOS 16.7.16) that produced the original failures, with plugin **8.4.0**, Capacitor pinned 8.4.2, `server.hostname` set, production-scale dist (~183 files):

- **Bug 1 (`reload()`): could not be reproduced anymore** — in-place reload worked every time, both built-in → bundle and bundle → bundle. Issue #969 closed as no-longer-reproducible; the August failures likely involved app-flow timing and/or fallout from the Bug-2 corruption era below.
- **Bug 2 (manifest): root cause found, and it's server-side** — Capawesome Cloud **intermittently fails to register `capawesome-live-update-manifest.json`** for manifest uploads (6 of 11 identical uploads permanently 404 the manifest href while all other files serve 200; any CLI version). Plugin **8.3.0** masked this catastrophically: the 404 JSON body was saved *as* the manifest file → decode failure → `sync()` failed silently on every launch, forever ("device silently stuck"). Plugin **8.4.0** (PR [#971](https://github.com/capawesome-team/capacitor-plugins/pull/971)) fails loudly instead. With a properly registered manifest, both full and **delta** manifest installs work fine on 8.4.0 — verified on device.

Details and bundle IDs in the issue threads.

## Status (2026-08-12)

The behaviors above were observed **in the production app the reports came from** (two physical iPhones, multiple days, reproducible at will at the time; Android unaffected). The maintainer could **not** reproduce them with this repro app ([video on #969](https://github.com/capawesome-team/capacitor-plugins/issues/969)).

The most conspicuous config difference between that production app and the first version of this repro: the production app sets a **custom WebView hostname** in `capacitor.config.json`:

```json
"server": { "hostname": "app.example.com" }
```

which makes the iOS WebView origin `capacitor://app.example.com` instead of the default `capacitor://localhost` — and `reload()` is exactly a bridge-config/asset-path switch plus `webView.load(config.serverURL)`. This repro now **includes** that setting (variant B). To test the maintainer-verified baseline (variant A), delete the `server` block and run `npx cap sync ios` again.

| Variant | `server.hostname` | Expectation under test |
|---|---|---|
| A | *(absent)* | reload() works (maintainer-verified) |
| B | `app.example.com` | reload() fails like the production app? |

Capacitor versions are now **pinned exactly** (`@capacitor/core`/`ios`/`cli` 8.4.2) to rule out install-time drift. (For the record: `CapacitorBridge.setServerBasePath`, `CAPBridgeViewController` and `WebViewAssetHandler` are byte-identical between 8.4.2 and 8.5.0, so version drift alone does not explain the discrepancy.)

**Plugin 8.4.0 (released 2026-08-12):** [capawesome-team/capacitor-plugins#971](https://github.com/capawesome-team/capacitor-plugins/pull/971) hardens the iOS download path (validate HTTP status so error bodies are no longer written into bundles as files, ignore `URLCache` for the deterministic request URLs, overwrite leftover files from failed attempts) — three iOS-only silent-failure modes that Android already guarded against, which is consistent with Bug 2 appearing on iOS only. `reload()` and `setServerBasePath` are unchanged in 8.4.0, so Bug 1 testing is unaffected by the bump. This repo now pins 8.4.0.

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

**Reported behavior (production app, iOS):** the webview visibly reloads, but the marker still shows the old bundle and `getCurrentBundle()` still returns the old bundle id. Repeating sync+reload never applies it (in an app that syncs at startup this becomes a reload loop). Force-quit + relaunch → new bundle active. The bundle was fine all along; only `reload()` failed to apply it.

**Expected:** `reload()` boots the next bundle, like the relaunch does. (On Android the same steps work.)

If reload() fails, the `post-reload serverBasePath=` log line is the key evidence:

- still the **old** path → `CapacitorBridge.setServerBasePath` returned early (it starts with `guard FileManager.default.fileExists(atPath: url.path) else { return }`, and `CAPBridgeViewController.setServerBasePath` reloads `config.serverURL` unconditionally afterwards — a silently failing guard reboots the old bundle);
- already the **new** path → the bridge config updated but the webview still served stale content (asset-handler/caching layer).

## Bug 2 — manifest delta never becomes active

1. Marker → `BUNDLE v3`, `npm run build`, upload **as manifest**:
   ```bash
   npx @capawesome/cli apps:liveupdates:upload --app-id <APP_ID> --channel Production --path dist --artifact-type manifest -y
   ```
2. Force-quit + relaunch (twice) → `BUNDLE v3` active. First manifest install (full download) **works**.
3. Marker → `BUNDLE v4`, build, upload as manifest again (this one is a **delta** — only a few files changed).
4. Force-quit + relaunch repeatedly.

**Reported behavior (production app, iOS):** the app stays on `BUNDLE v3` forever. No error, no event, nothing in the UI or dashboard. Check `getBlockedBundles()`: with `autoBlockRolledBackBundles: true`, a single failed/rolled-back install permanently blocklists the bundle — after which `sync()` silently returns `nextBundleId: null` (only a native-console log line mentions the block). A blocklisted bundle is indistinguishable from "no update available" for both the app and the operator.

Note the production-app dist was a ~4.4 MB SPA with ~180 files (vs. a handful here). Use `npm run build:padded` instead of `npm run build` for the manifest tests: it adds ~180 deterministic filler files (~4 MB) to `dist/`, so a re-upload after a marker change is a true partial update at production scale (2-3 changed files out of ~180).

5. Upload the identical `v4` dist as zip:
   ```bash
   npx @capawesome/cli apps:liveupdates:upload --app-id <APP_ID> --channel Production --path dist -y
   ```
6. Force-quit + relaunch → `BUNDLE v4` active immediately.

**Expected:** the manifest delta installs; or a failed install surfaces an error instead of silently blocklisting the bundle.

## Environment

- `@capawesome/capacitor-live-update` 8.4.0 (bugs originally observed on 8.3.0)
- `@capacitor/core` / `@capacitor/ios` / `@capacitor/cli` 8.4.2 (pinned)
- Production-app observations: two physical iPhones (one fully deleted + reinstalled during the investigation — behavior unchanged); Android (Pixel 7a) applies bundles via `reload()` correctly.
