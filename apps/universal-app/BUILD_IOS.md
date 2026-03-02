# Building iOS App for iPad Device Using Xcode

This guide will walk you through the process of building and deploying the WonderTales iOS app to your iPad device using Xcode.

> **📚 Quick Access:**
> - 🏃 **[Commands Cheat Sheet](./IOS_BUILD_CHEATSHEET.md)** - Copy-paste commands
> - 🌍 **[Environment Quick Reference](./ENV_QUICK_REFERENCE.md)** - Production vs Local setup
> - 📖 **This Guide** - Full step-by-step instructions

---

## 🎯 Environment Selection

Before starting, choose your build environment:

### ✅ Production Environment (Recommended)

**Use this for:**
- Testing the live app with real data
- No need to run local backend server
- Faster setup and easier to use

**Configuration:**
```env
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
```

### 🔧 Local Development Environment

**Use this for:**
- Backend API development and testing
- Testing API changes before deploying
- Debugging server-side issues

**Configuration:**
```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000  # Your Mac's local IP
```

**Requirements:**
- Local API server running (`pnpm dev:api`)
- iPad and Mac on same Wi-Fi network

---

## Prerequisites

### Required Software

1. **macOS** - Xcode only runs on macOS
2. **Xcode 15.0+** - Install from Mac App Store
3. **Node.js 18+** - [Download here](https://nodejs.org/)
4. **pnpm 8+** - Install with `npm install -g pnpm`
5. **CocoaPods** - Install with `sudo gem install cocoapods`
6. **Expo CLI** - Install with `npm install -g expo-cli`

### Apple Developer Account

- **Free Account**: You can use a free Apple ID for development and testing (limited to 7 days per build)
  - ⚠️ **Important:** Free accounts don't support Push Notifications capability
  - ⚠️ You must **remove** Push Notifications capability from Xcode if present
  - ✅ See [Push Notifications Troubleshooting](./TROUBLESHOOTING_PUSH_NOTIFICATIONS.md) for details
- **Paid Account** ($99/year): Required for App Store distribution and longer device installations
  - ✅ Full Push Notifications support
  - ✅ No app expiration
  - ✅ All capabilities available

### Physical iPad Device

- iPad with **iOS 13.4+**
- USB/USB-C cable to connect to Mac
- iPad must be in **Developer Mode** (iOS 16+)

---

## Step 1: Initial Setup

### 1.1 Clone and Install Dependencies

```bash
# Navigate to project root
cd /Users/ivanryzhenko/Documents/Repository/story

# Install dependencies
pnpm install

# Navigate to universal-app
cd apps/universal-app

# Install iOS dependencies
cd ios
pod install
cd ..
```

### 1.2 Generate Native iOS Project (if needed)

If the `ios/` folder doesn't exist or you need to regenerate it:

```bash
# From apps/universal-app directory
npx expo prebuild --platform ios
```

This will create the native iOS project in the `ios/` folder.

---

## Step 2: Configure Environment Variables

### 2.1 Choose Your Environment

You can build the iOS app for different environments:

- **Production** - Connect to live API at `https://magic-sleep-time.duckdns.org`
- **Local Development** - Connect to local API for testing

### 2.2 Configure for Production Environment

For production builds (default):

```bash
# From apps/universal-app directory
# Create or edit .env file
cat > .env << 'EOF'
# Production API
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org

# Google OAuth (Production)
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com

# Apple OAuth
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF
```

**What this does:**
- ✅ App connects to production API server
- ✅ Real data and users
- ✅ Production OAuth credentials
- ✅ No need for local backend server

### 2.3 Configure for Local Development (Optional)

For local development and testing:

```bash
# From apps/universal-app directory
cat > .env << 'EOF'
# Local API (use your Mac's local IP, NOT localhost)
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000

# Google OAuth (same as production)
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com

# Apple OAuth
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF
```

**Find your Mac's local IP address:**

```bash
# macOS
ipconfig getifaddr en0
# Example output: 192.168.1.100

# Then replace in EXPO_PUBLIC_API_BASE_URL above
```

**Important for local development:**
- ⚠️ Use your Mac's **local IP address**, NOT `localhost` or `127.0.0.1`
- ⚠️ iPad and Mac must be on the **same Wi-Fi network**
- ⚠️ Local backend API must be running (`pnpm dev:api` from project root)

### 2.4 Verify Environment Configuration

After creating `.env`, verify it's loaded correctly:

```bash
# From apps/universal-app directory
cat .env | grep EXPO_PUBLIC_API_BASE_URL
```

The app will log the API URL on startup:

```
🔗 API_BASE_URL: https://magic-sleep-time.duckdns.org
🔗 EXPO_PUBLIC_API_BASE_URL: https://magic-sleep-time.duckdns.org
```

---

## Step 3: Enable Developer Mode on iPad

### For iOS 16+

1. Connect iPad to Mac via USB/USB-C
2. On iPad: Go to **Settings → Privacy & Security → Developer Mode**
3. Toggle **Developer Mode** ON
4. iPad will restart
5. After restart, confirm the security prompt

### For iOS 15 and Earlier

Developer Mode is automatically enabled when you build to the device.

---

## Step 4: Configure Xcode Project

### 4.1 Open Xcode Project

```bash
# From apps/universal-app directory
open ios/WonderTales.xcworkspace
```

**Important**: Always open `.xcworkspace`, NOT `.xcodeproj` (required for CocoaPods).

### 4.2 Configure Signing & Capabilities

1. In Xcode, select the **WonderTales** project in the navigator (left sidebar)
2. Select the **WonderTales** target
3. Go to **Signing & Capabilities** tab

#### Set Team & Bundle Identifier

- **Team**: Select your Apple Developer account from dropdown
  - If not listed, click "Add Account" and sign in with your Apple ID
- **Bundle Identifier**: Keep `com.anonymous.wondertales` or change to your own (e.g., `com.yourcompany.wondertales`)
  - Must be unique if publishing to App Store
  - Free accounts: Change it to something unique to avoid conflicts

#### Signing Certificate

- **Automatically manage signing**: ✅ Checked (recommended for development)
- **Provisioning Profile**: Will be created automatically

### 4.3 Set Deployment Target

1. In **General** tab → **Deployment Info**
2. Set **iOS Deployment Target** to `13.4` (minimum supported version)
3. Check device support:
   - ✅ iPhone
   - ✅ iPad
   - ✅ Mac (Designed for iPad) - optional

---

## Step 5: Connect and Trust Your iPad

### 5.1 Connect iPad to Mac

1. Connect iPad to Mac using USB/USB-C cable
2. Unlock your iPad
3. If prompted "Trust This Computer?" → Tap **Trust**
4. Enter iPad passcode

### 5.2 Verify Connection in Xcode

1. In Xcode, check the device dropdown (top toolbar, next to "WonderTales")
2. Your iPad should appear in the list (e.g., "Ivan's iPad")
3. Select your iPad as the build destination

---

## Step 6: Build and Deploy to iPad

### 6.1 Start Local API (Only if using local development)

**Skip this step if using production environment** (`EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org`)

If testing with local backend:

```bash
# In a separate terminal, from project root
pnpm dev:api
```

Verify the API is running:

```bash
curl http://localhost:3000/health/health
# Should return: {"status":"healthy"}
```

### 6.2 Build and Run from Xcode

#### Method A: Using Xcode GUI

1. Select your iPad in the device dropdown
2. **IMPORTANT:** Make sure you're building in **Debug** mode (not Release)
   - Click on scheme dropdown (next to device dropdown)
   - Select **Edit Scheme...**
   - Under **Run** → **Build Configuration** → Select **Debug**
3. Click the **Play** button (▶️) or press `Cmd + R`
4. Xcode will:
   - Compile the app
   - Sign the app with your certificate
   - Install it on your iPad
   - Launch the app

**Note:** Debug mode enables Developer Menu, Hot Reload, and better debugging. Use Release mode only for production testing.

#### Method B: Using Expo CLI

```bash
# From apps/universal-app directory

# For development/debugging (Debug mode - recommended)
npx expo run:ios --device --configuration Debug

# For production testing (Release mode)
npx expo run:ios --device --configuration Release
```

**Use Debug mode for development:** It enables Developer Menu, Hot Reload, and better error messages.

### 6.3 First Time Installation

If this is your first time installing an app from your Apple ID:

1. On iPad: Go to **Settings → General → VPN & Device Management**
2. Find your Apple ID under "Developer App"
3. Tap on it and select **Trust "[Your Name]"**
4. Confirm by tapping **Trust**

### 6.4 Launch the App

- The app should launch automatically after installation
- If not, find "WonderTales" icon on your iPad home screen and tap it

---

## Step 7: Development Workflow

### 7.1 Switching Between Environments

When switching from production to local or vice versa:

```bash
# From apps/universal-app directory

# 1. Update .env file
# For production:
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EOF

# OR for local development (use your Mac's IP):
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EOF

# 2. Clear Metro bundler cache
npx expo start -c

# 3. Rebuild the app
npx expo run:ios --device
# Or rebuild in Xcode (Cmd + B)
```

**Important:** Environment variables are baked into the app bundle at build time. You **must rebuild** after changing `.env` file.

### 7.2 Verify Environment

Check which API the app is connecting to:

1. Build and launch app on iPad
2. Check Xcode console output (View → Debug Area)
3. Look for these logs:
   ```
   🔗 API_BASE_URL: https://magic-sleep-time.duckdns.org
   🔗 EXPO_PUBLIC_API_BASE_URL: https://magic-sleep-time.duckdns.org
   ```

### 7.3 Enable Fast Refresh

When running from Xcode, the app connects to Metro bundler for fast refresh:

1. Ensure Metro bundler is running:
   ```bash
   # From apps/universal-app directory
   npx expo start
   ```

2. Shake your iPad or use **Cmd + D** in simulator to open developer menu
3. Enable **Fast Refresh**
4. Now code changes will reflect immediately

**Note:** Fast refresh only works for UI code changes. Changing `.env` requires a full rebuild.

### 7.4 View Console Logs

In Xcode:
- **View → Debug Area → Activate Console** (or `Cmd + Shift + Y`)
- See `console.log()` output and errors here

### 7.5 Debugging

#### Enable React Native Debugger

1. On iPad: Shake device → **Debug**
2. Opens Chrome debugger in Safari

#### Xcode Breakpoints

1. In Xcode, open Swift/Objective-C files
2. Click line number to add breakpoint
3. Debug native code issues

---

## Step 8: Common Issues and Solutions

### Issue: "Personal development teams do not support the Push Notifications capability"

**Error Message:**
```
Cannot create a iOS App Development provisioning profile for "com.wondertales.app".
Personal development teams, including "Your Name", do not support the Push Notifications capability.
```

**Cause:** Free Apple Developer accounts (Personal Team) don't support Push Notifications.

**Solution:**

1. In Xcode, select the **WonderTales** project in the left sidebar
2. Select the **WonderTales** target
3. Go to **Signing & Capabilities** tab
4. Find **Push Notifications** capability
5. Click the **trash icon (🗑️)** next to "Push Notifications" to remove it
6. Build again (`Cmd + R`)

**Alternative Solution (Regenerate iOS project):**

```bash
# From apps/universal-app directory

# 1. Delete iOS folder
rm -rf ios

# 2. Regenerate (expo-notifications is already disabled in app.config.js)
npx expo prebuild --platform ios --clean

# 3. Reinstall pods
cd ios && pod install && cd ..

# 4. Open in Xcode
open ios/WonderTales.xcworkspace

# 5. Configure signing and build
```

**Note:** Push notifications will be enabled later when using a paid Apple Developer account or EAS Build.

### Issue: "Failed to verify code signature"

**Solution**:
1. In Xcode: **Product → Clean Build Folder** (`Cmd + Shift + K`)
2. Delete `ios/build` folder manually
3. Rebuild

### Issue: "No profiles for 'com.anonymous.wondertales' were found"

**Solution**:
1. Go to **Signing & Capabilities**
2. Change Bundle Identifier to something unique (e.g., `com.yourname.wondertales`)
3. Ensure "Automatically manage signing" is checked

### Issue: "Unable to install app"

**Solution**:
1. On iPad: Delete existing WonderTales app if present
2. Go to **Settings → General → VPN & Device Management**
3. Remove old certificates
4. Rebuild and reinstall

### Issue: "Could not connect to development server"

**If using Production Environment:**
- ✅ No Metro bundler needed for production API
- ✅ App connects directly to `https://magic-sleep-time.duckdns.org`
- ⚠️ Check your internet connection
- ⚠️ Verify `.env` has correct production URL

**If using Local Development:**
1. Ensure iPad and Mac are on the same Wi-Fi network
2. Use Mac's local IP (not `localhost`) in `EXPO_PUBLIC_API_BASE_URL`
3. Check firewall isn't blocking connections
4. Verify local API is running: `curl http://localhost:3000/health/health`
5. Restart Metro bundler:
   ```bash
   npx expo start -c
   ```

### Issue: "Environment variables not updating"

**Solution:**
```bash
# Environment variables are baked into bundle at build time
# You MUST rebuild after changing .env

# 1. Clear cache
npx expo start -c

# 2. Clean iOS build
cd ios
rm -rf build
cd ..

# 3. Rebuild
npx expo run:ios --device
```

**Verify which API is being used:**
- Check Xcode console for: `🔗 API_BASE_URL: ...`
- Should show your production or local API URL

### Issue: "CocoaPods could not find compatible versions"

**Solution**:
```bash
cd ios
rm -rf Pods Podfile.lock
pod cache clean --all
pod install
cd ..
```

### Issue: "App expires after 7 days" (Free Apple ID)

**Solution**:
- With free Apple ID, apps expire after 7 days
- Rebuild and reinstall every week
- Or upgrade to paid Apple Developer account ($99/year)

### Issue: "Build failed with linker errors"

**Solution**:
```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean and rebuild
cd ios
pod deintegrate
pod install
cd ..
```

---

## Step 9: Building for Distribution (Optional)

### For TestFlight / App Store

1. **Use EAS Build** (recommended):
   ```bash
   # From apps/universal-app directory
   npm install -g eas-cli
   eas build --platform ios
   ```

2. **Or use Xcode Archive**:
   - In Xcode: **Product → Archive**
   - After successful archive: **Window → Organizer**
   - Select your archive → **Distribute App**
   - Follow the wizard to upload to App Store Connect

---

## Step 10: Useful Commands

### Clean and Rebuild

```bash
# From apps/universal-app directory

# Clean Metro bundler cache
npx expo start -c

# Clean iOS build
cd ios
rm -rf build
pod cache clean --all
pod install
cd ..

# Full rebuild
npx expo run:ios --device
```

### Check Bundle Identifier

```bash
# From apps/universal-app/ios directory
grep -A1 "PRODUCT_BUNDLE_IDENTIFIER" WonderTales.xcodeproj/project.pbxproj
```

### View Device Logs

```bash
# Install ideviceinstaller (if needed)
brew install ideviceinstaller

# View real-time logs
idevicesyslog
```

---

## Additional Resources

- **Expo iOS Development**: https://docs.expo.dev/workflow/ios-simulator/
- **Xcode Documentation**: https://developer.apple.com/documentation/xcode
- **React Native iOS Guide**: https://reactnative.dev/docs/running-on-device
- **Apple Developer Portal**: https://developer.apple.com/account/

---

## Configuration Summary

### Production Environment

- **API URL**: `https://magic-sleep-time.duckdns.org`
- **Bundle Identifier**: `com.anonymous.wondertales`
- **EAS Project ID**: `f96175da-3327-4a98-ba09-90ed92e7e668`
- **Minimum iOS Version**: iOS 13.4+
- **Supported Devices**: iPhone, iPad
- **Encryption**: Non-exempt (declared in Info.plist)

### OAuth Credentials

**Google OAuth:**
- iOS Client ID: `151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com`
- Web Client ID: `151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com`
- Android Client ID: `151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com`

**Apple OAuth:**
- Client ID: `com.anonymous.wondertales`

---

## Notes

- **OAuth Limitations**: Native OAuth (Google/Apple Sign-In) requires proper URL schemes and entitlements configured in Xcode
- **Local API Testing**: Use your Mac's local IP address, not `localhost`, when testing on physical device
- **Certificate Management**: Free Apple IDs create development certificates that expire after 7 days
- **Production Builds**: For App Store distribution, use EAS Build or Xcode Archive workflow

---

## Troubleshooting Checklist

Before asking for help, verify:

- [ ] Xcode is up to date (15.0+)
- [ ] iPad is in Developer Mode (iOS 16+)
- [ ] iPad trusts your Mac ("Trust This Computer")
- [ ] Apple Developer account is signed in to Xcode
- [ ] Bundle Identifier is unique (if using free account)
- [ ] "Automatically manage signing" is enabled
- [ ] `.env` file exists in `apps/universal-app/` directory
- [ ] `EXPO_PUBLIC_API_BASE_URL` is set correctly in `.env`
- [ ] App was rebuilt after changing `.env` file
- [ ] CocoaPods installed and ran successfully
- [ ] Developer app is trusted in iPad Settings

**For Production Environment:**
- [ ] Internet connection is working
- [ ] Production URL is accessible: `curl https://magic-sleep-time.duckdns.org/health/health`

**For Local Development:**
- [ ] iPad and Mac are on same Wi-Fi (not cellular)
- [ ] `EXPO_PUBLIC_API_BASE_URL` uses Mac's local IP (not localhost)
- [ ] Local API is running: `pnpm dev:api`
- [ ] Local API responds: `curl http://localhost:3000/health/health`

---

## Quick Start (TL;DR)

### Production Build (Recommended)

```bash
# 1. Install dependencies
cd apps/universal-app
pnpm install
cd ios && pod install && cd ..

# 2. Configure .env for production
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# 3. Enable Developer Mode on iPad
# Settings → Privacy & Security → Developer Mode → ON

# 4. Open Xcode and configure signing
open ios/WonderTales.xcworkspace
# Select your Apple ID in Signing & Capabilities

# ⚠️ IMPORTANT: If using FREE Apple account:
# Remove "Push Notifications" capability (click trash icon)
# Free accounts don't support this capability

# 5. Connect iPad via USB and trust computer

# 6. Build and run
# Press Play button in Xcode or:
npx expo run:ios --device

# 7. Trust developer certificate on iPad
# Settings → General → VPN & Device Management → Trust
```

### Local Development Build

```bash
# Follow steps 1, 3-7 from above, but use this .env in step 2:

# Find your Mac's local IP
ipconfig getifaddr en0
# Example: 192.168.1.100

# Create .env with local API
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# Start local API
pnpm dev:api  # From project root in separate terminal
```

That's it! Your WonderTales app should now be running on your iPad. Happy coding! 🚀
