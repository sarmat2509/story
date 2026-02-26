# Fixing: Push Notifications Error (Free Apple Account)

## The Error

```
❌ Cannot create a iOS App Development provisioning profile for "com.kazkaplus.app".
❌ Personal development teams, including "Ivan Ryzhenko", do not support the Push Notifications capability.
❌ Provisioning profile "iOS Team Provisioning Profile: com.kazkaplus.app" doesn't include the Push Notifications capability.
❌ Provisioning profile "iOS Team Provisioning Profile: com.kazkaplus.app" doesn't include the aps-environment entitlement.
```

## Why This Happens

**Free Apple Developer accounts** (Personal Team) have limitations:
- ❌ No Push Notifications support
- ❌ No App Groups
- ❌ No Associated Domains
- ❌ Apps expire after 7 days
- ✅ Can test on physical devices
- ✅ Can use most other features

**Paid Apple Developer account** ($99/year):
- ✅ Full Push Notifications support
- ✅ All capabilities available
- ✅ No app expiration
- ✅ App Store distribution

## Solution 1: Remove Push Notifications Capability (Quick Fix)

### Step 1: Open Xcode Project

```bash
cd apps/universal-app
open ios/Kazka.xcworkspace
```

### Step 2: Remove the Capability

1. In Xcode's left sidebar, click on **Kazka** (blue project icon at top)
2. Under **TARGETS**, select **Kazka**
3. Click the **Signing & Capabilities** tab
4. Look for **Push Notifications** section
5. Click the **🗑️ trash icon** in the top-right corner of the Push Notifications section
6. Confirm deletion

### Step 3: Clean and Rebuild

```bash
# In Xcode: Product → Clean Build Folder (Cmd + Shift + K)
# Then: Product → Build (Cmd + B)
# Or just press ▶️ to run
```

## Solution 2: Regenerate iOS Project (Clean Slate)

If removing the capability doesn't work, regenerate the entire iOS project:

```bash
# From apps/universal-app directory

# 1. Delete iOS folder
rm -rf ios

# 2. Clear Expo cache
npx expo prebuild --clean --platform ios

# 3. Install CocoaPods
cd ios
pod install
cd ..

# 4. Open in Xcode
open ios/Kazka.xcworkspace

# 5. Configure signing:
#    - Select Kazka target
#    - Go to Signing & Capabilities
#    - Select your Apple ID in Team dropdown
#    - Change Bundle Identifier if needed (e.g., com.yourname.kazkaplus)

# 6. Build and run
# Press ▶️ or Cmd + R
```

## Solution 3: Verify app.config.js (Already Configured)

The project is already configured to **disable** expo-notifications for free accounts:

```javascript
// apps/universal-app/app.config.js
plugins: [
  [
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: getGoogleIosUrlScheme() },
  ],
  // 'expo-notifications', - Disabled for Personal Team (free Apple account)
],
```

✅ This is correct - keep it commented out!

## Verification

After fixing, verify no Push Notifications references exist:

### Check Xcode

1. **Signing & Capabilities** tab
2. Should only see:
   - ✅ Sign in with Apple
   - ✅ Associated Domains (if using paid account)
3. Should NOT see:
   - ❌ Push Notifications

### Check Entitlements File

```bash
cat ios/Kazka/Kazka.entitlements
```

Should show:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
```

✅ Empty dict is correct for free account!

## Future: Enabling Push Notifications

When you upgrade to a paid Apple Developer account:

1. Uncomment in `app.config.js`:
   ```javascript
   plugins: [
     // ... other plugins
     'expo-notifications', // ✅ Enabled for paid account
   ],
   ```

2. Regenerate iOS project:
   ```bash
   npx expo prebuild --clean --platform ios
   cd ios && pod install && cd ..
   ```

3. In Xcode:
   - Add Push Notifications capability
   - Add aps-environment entitlement

## Related Issues

### If you still get provisioning errors:

1. **Change Bundle Identifier:**
   ```
   com.kazkaplus.app → com.yourname.kazkaplus
   ```

2. **Clean Derived Data:**
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```

3. **Revoke and recreate certificates:**
   - Go to https://developer.apple.com/account/resources/certificates
   - Revoke old certificates
   - Let Xcode create new ones (Automatically manage signing)

## Summary

**For Free Apple Account (Current Setup):**
- ❌ Remove Push Notifications capability
- ✅ Keep `expo-notifications` commented out in app.config.js
- ✅ Build will succeed without push notifications

**For Paid Apple Account (Future):**
- ✅ Uncomment `expo-notifications` in app.config.js
- ✅ Add Push Notifications capability in Xcode
- ✅ Full push notifications support

---

**Current Status:** ✅ Project is correctly configured for free Apple account (notifications disabled)

**Action Required:** Remove the Push Notifications capability from Xcode project (it was likely added automatically during initial setup)
