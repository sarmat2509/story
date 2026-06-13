# iOS local debugging

Last updated: 2026-06-09

This runbook documents the local iOS debugging flow used for the WonderTales
native app in `apps/universal-app`: how to build it, run it in Simulator,
capture screenshots and logs, restore a test session, and jump straight to
debugging screens.

The source of truth for native app work is `apps/universal-app`. Do not run
Expo or EAS commands from the repository root unless the root-level Expo setup
is intentionally being debugged.

## Project and runtime layout

- Native app workspace: `apps/universal-app`
- iOS Xcode workspace: `apps/universal-app/ios/WonderTales.xcworkspace`
- iOS bundle id: `com.wondertales.app`
- Native deep-link scheme: `wondertales://`
- Local API base URL in dev: `http://localhost:3000`
- Native Metro used in this debugging flow: `http://127.0.0.1:8084`

Important local debugging caveat:

- The repo can have both a native Metro server and a separate web dev server at
  the same time.
- In this debugging pass, native used port `8084`.
- A stale web Expo server on `8082` caused misleading results earlier because
  the app and screenshots were sometimes being checked against the wrong bundle.
- If behavior looks impossible, verify which Metro server is actually serving
  the running app before changing code.

Useful checks:

```bash
xcrun simctl list devices | rg "Booted|iPhone 17 Pro"
ps aux | rg "expo|metro|react-native|8084|8082"
```

## Build the iOS app

For local native debugging, build directly with `xcodebuild` from the repo
root:

```bash
xcodebuild \
  -workspace apps/universal-app/ios/WonderTales.xcworkspace \
  -scheme WonderTales \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath apps/universal-app/build/ios-derived \
  build
```

Expected success marker:

```text
** BUILD SUCCEEDED **
```

Built simulator app path:

```text
apps/universal-app/build/ios-derived/Build/Products/Debug-iphonesimulator/WonderTales.app
```

## Launch in Simulator

Find the booted simulator:

```bash
xcrun simctl list devices | rg "Booted"
```

Install and launch the app:

```bash
xcrun simctl install booted \
  apps/universal-app/build/ios-derived/Build/Products/Debug-iphonesimulator/WonderTales.app

xcrun simctl launch booted com.wondertales.app
```

If the app is already installed and you only need a relaunch:

```bash
xcrun simctl terminate booted com.wondertales.app || true
xcrun simctl launch booted com.wondertales.app
```

## Start the native Metro server

Run the native Expo dev server from the repository root:

```bash
pnpm start -- --port 8084
```

If you need to compare native and web behavior, make sure you know which server
owns which port before interpreting results.

## Capture screenshots

Take a screenshot from the currently booted simulator:

```bash
xcrun simctl io booted screenshot \
  /absolute/path/to/output.png
```

Example used during this debugging pass:

```bash
xcrun simctl io 06B65FC3-733A-4BF8-A829-B62BF65A7328 screenshot \
  /Users/ivanryzhenko/Documents/Repository/story/apps/universal-app/build/current-ios-screen.png
```

Useful screenshot artifacts created during debugging:

- `apps/universal-app/build/current-ios-screen.png`
- `apps/universal-app/build/wizard-after-auth-inject.png`

## Inspect iOS logs

Tail recent logs for the app process:

```bash
xcrun simctl spawn booted log show --style compact --last 3m \
  --predicate 'processImagePath CONTAINS "WonderTales"'
```

To search for specific runtime problems:

```bash
xcrun simctl spawn booted log show --style compact --last 3m \
  --predicate 'processImagePath CONTAINS "WonderTales" OR eventMessage CONTAINS[c] "LinearGradient" OR eventMessage CONTAINS[c] "svg"'
```

During this debugging pass, this was useful for checking:

- startup crashes
- `ExpoLinearGradient` / view-manager issues
- missing native module crashes
- whether screen data was loading successfully with HTTP `200` responses

## Enter screens via deep links

The app supports the native deep-link scheme:

```text
wondertales://
```

Useful routes:

- `wondertales://wizard`
- `wondertales://dashboard`
- `wondertales://children`
- `wondertales://characters`
- `wondertales://profile`

Open a route in the simulator:

```bash
xcrun simctl openurl booted wondertales://wizard
```

This is the fastest way to re-open the target screen after restoring auth or
after a relaunch.

## Reviewer account used for debugging

The reviewer flow is documented in:

- `docs/runbooks/store-reviewer-demo-flow.md`

Seed account used in local debugging:

```text
review.store_review_parent@wondertales.art
```

Seed the account if needed:

```bash
pnpm --dir services/api seed:test-accounts --only=STORE_REVIEW_PARENT
```

Default local password used by the QA seed script when no override is set:

```text
ChangeMe123!
```

## Fast login without manual UI

When the app needed to be re-opened on a specific screen quickly, the fastest
path was:

1. Create a fresh token through the local API.
2. Write the auth payload into React Native AsyncStorage inside the simulator
   app container.
3. Relaunch the app.
4. Open the target deep link such as `wondertales://wizard`.

### Step 1: get a token from the local API

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/sessions \
  -H 'Content-Type: application/json' \
  -d '{"email":"review.store_review_parent@wondertales.art","password":"ChangeMe123!"}'
```

This returns:

- `token`
- `user`
- `expiresAt`

### Step 2: find the simulator app container

```bash
xcrun simctl get_app_container booted com.wondertales.app data
```

In this debugging pass, the relevant storage file was:

```text
<container>/Library/Application Support/com.wondertales.app/RCTAsyncLocalStorage_V1/manifest.json
```

### Step 3: write auth into AsyncStorage

The app uses both:

- Zustand persisted key: `auth-storage`
- legacy helper keys:
  - `@wondertales/auth_token`
  - `@wondertales/user`
  - `@wondertales/language`

Writing all of them makes the session restoration more reliable for local
debugging.

Example script used during this pass:

```bash
CURRENT_CONTAINER=$(xcrun simctl get_app_container booted com.wondertales.app data)
MANIFEST="$CURRENT_CONTAINER/Library/Application Support/com.wondertales.app/RCTAsyncLocalStorage_V1/manifest.json"

xcrun simctl terminate booted com.wondertales.app || true

node <<'NODE' "$MANIFEST"
const fs = require('fs');
const path = process.argv[1];
const token = '<paste token from /api/v1/auth/sessions>';
const user = <paste user JSON from /api/v1/auth/sessions>;
const authStorage = {
  state: {
    user,
    token,
    sessionMode: 'parent',
    activeChild: null,
    isAuthenticated: true,
    isLoading: false,
  },
  version: 0,
};

const manifest = {
  'auth-storage': JSON.stringify(authStorage),
  '@wondertales/auth_token': token,
  '@wondertales/user': JSON.stringify(user),
  '@wondertales/language': 'en',
};

fs.writeFileSync(path, JSON.stringify(manifest));
NODE

xcrun simctl launch booted com.wondertales.app
```

After that, open the target route:

```bash
xcrun simctl openurl booted wondertales://wizard
```

This was the most reliable way to get back to `Create Story` after restarts.

## Debugging image and gradient issues

The screen used most often for visual verification was `Wizard` / `Create Story`
because it contains:

- remote scenario images
- image overlays
- text over artwork
- selected-card state

Workflow used:

1. Open `wondertales://wizard`.
2. Capture a screenshot with `simctl io ... screenshot`.
3. Compare the rendered card with the expected overlay behavior.
4. Check native logs for `LinearGradient`, `svg`, `ExpoLinearGradient`, or
   render errors.
5. Rebuild or relaunch after each change if the native runtime looked stale.

This was especially useful for confirming the difference between:

- a broken fallback that rendered a solid black block
- a correct transparent-to-dark fade overlay on the lower half of the card

## Files that mattered during this debugging pass

- `apps/universal-app/src/components/AppLinearGradient.tsx`
- `apps/universal-app/src/screens/wizard/components/ScenarioCardsGrid.tsx`
- `apps/universal-app/src/App.tsx`
- `apps/universal-app/src/utils/webRuntime.ts`
- `apps/universal-app/src/theme/activePalette.native.ts`
- `apps/universal-app/src/services/revenueCatService.native.ts`

## Validation commands used after code changes

Type-check:

```bash
pnpm exec tsc -p apps/universal-app/tsconfig.json --noEmit
```

Lint a targeted file:

```bash
pnpm exec eslint apps/universal-app/src/components/AppLinearGradient.tsx
pnpm exec eslint apps/universal-app/src/screens/wizard/components/ScenarioCardsGrid.tsx
```

## Common pitfalls

- Running the wrong dev server: native and web can both be alive locally.
- Inspecting an old simulator state after rebuilding without relaunching.
- Trusting a screenshot from the wrong route after the app reset to `Welcome`.
- Updating only one auth storage key instead of all keys the app still reads.
- Assuming a native module is available because `window` exists or because web
  rendered correctly.

## Recommended local debugging loop

```bash
# 1. Start API
# 2. Start native Metro on 8084
# 3. Build with xcodebuild if native code or pods changed
# 4. Install/launch app
# 5. Restore reviewer session if needed
# 6. Open wondertales://wizard
# 7. Take screenshot
# 8. Check simctl logs
# 9. Repeat after code changes
```

This loop was enough to debug:

- web vs native runtime mismatches
- startup crashes
- missing native module behavior
- image loading issues
- gradient overlay rendering on scenario cards
