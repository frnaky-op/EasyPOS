# EasyPOS Mobile companion

This is the installable Android/iPhone companion for the EasyPOS desktop app. It bundles the existing mobile catalogue and caisse screens and uses the native ML Kit barcode scanner. The desktop app remains the source of product, customer, stock, and sale data. The phone and PC must be on the same shop network while working.

## Pair a phone

1. Start EasyPOS on the PC and open **Accès mobile** in the header.
2. Scan the QR with the phone camera. If EasyPOS Mobile is installed, the connection page opens it with the PC address and pairing code. Otherwise, it offers the Android APK. After installing, return to the page and tap **Ouvrir l’application**.
3. You can also scan the desktop QR from inside the companion, or enter the displayed local address and eight-digit code.
4. Allow camera access. In **Produits** or **Caisse**, tap **Scanner avec la caméra** or **Scan**. The camera shows behind the guide frame. In Caisse, scanning remains active for successive products.

After pairing, **Caisse** opens first. Use the header menu or bottom navigation for Catalogue and Stock. The Stock page has search, low-stock and out-of-stock filters, and product editing. The menu also opens the new-product form and cart.

The app sends requests to the PC's paired mobile API on port 3211. Android and iPhone packages contain the UI; they do not load executable code from the PC. Native sessions expire after 12 hours. For a shop that already uses trusted local HTTPS, the companion accepts the HTTPS desktop QR as well. On ordinary shop HTTP, product and pairing traffic is not encrypted, so keep the Wi-Fi private.

## Build

From the repository root, install its dependencies once (`npm ci`) because the companion build copies the existing ZXing fallback bundle. Then:

```powershell
cd companion
npm ci
npm run sync
```

Open `companion/android` in Android Studio, or run `npm run android`. An Android SDK with API 36 and Android Studio's JDK are needed. To build a debug APK from PowerShell on Windows:

```powershell
cd companion/android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\sdk"
.\gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/`. After building, run `npm run publish:android` from `companion`. This copies the APK into `mobile/downloads/` and creates its version/checksum manifest. For a signed release build, run `npm run publish:android -- release` after Gradle produces the release APK.

EasyPOS serves the APK from `/download/android` on the shop Wi-Fi. The companion checks `/api/mobile-update` after pairing and through **Vérifier les mises à jour** in its menu. If the served build number is higher, Android downloads the APK, verifies its size, SHA-256, package ID and build number, then opens the system installer. Android may first ask you to allow EasyPOS Mobile to install apps; return to the update prompt and tap **Réessayer** afterward. The installation always needs the user's confirmation. You can set `MOBILE_ANDROID_APK` to a full APK path if its matching `.json` manifest is beside it.

Increase `versionCode` and `versionName` in `android/app/build.gradle` for each new Android build. Keep the same signing key across updates. The generated debug APK is for local testing; use a signed release APK for production. The desktop installer includes the APK and manifest when they are present in `mobile/downloads/` at packaging time. Existing Android installations made before this updater was added need one manual installation of build 2 before in-app updates are available.

The iPhone project is in `companion/ios`. On a Mac, install Xcode and CocoaPods, run `npm ci` and `npm run sync` in `companion`, then open `ios/App/App.xcworkspace` in Xcode. The ML Kit plugin requires CocoaPods and an iOS deployment target of at least 15.5. iOS cannot be compiled or tested on Windows.

An iPhone cannot install an unsigned iOS build from the local QR page. Once you have a TestFlight or App Store installation URL, set `MOBILE_IOS_INSTALL_URL` to that HTTPS link before starting EasyPOS. For in-app update notices, also set `MOBILE_IOS_VERSION_CODE` to the newer iOS build number and optionally `MOBILE_IOS_VERSION_NAME` to its display version. The prompt opens the configured store link; iOS completes the update there. Increase `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` in the Xcode project for each build.

Generated web assets in `companion/www` and copied platform assets are rebuilt by `npm run sync`; edit the shared screens in `mobile/` and the native bridge in `companion/native-bridge.js`.

The launcher artwork is `resources/icon.png`. Native icons and splash screens use the black and yellow mark on white. To regenerate them after changing the artwork, install Pillow (`python -m pip install Pillow`) and run `python resources/generate-icons.py` from `companion` before building the apps.
