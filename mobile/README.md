# EasyPOS mobile catalogue and caisse

For faster native barcode scanning on Android and iPhone, see the [Capacitor companion](../companion/README.md). This page documents the browser version.

The desktop app starts a separate mobile catalogue on port **3211**. It uses the same product and category databases as the desktop app. The desktop API stays bound to localhost.

1. Start EasyPOS on the shop computer and sign in with an account that can manage products.
2. Click **Accès mobile** in the header. The dialog shows a QR code, the local address, and an eight-digit pairing code.
3. Connect the phone to the same Wi-Fi and scan the QR code with its camera. The connection page opens the installed EasyPOS Mobile app for pairing, offers the Android installer if the app is missing, and lets you continue in the browser. If scanning is unavailable, open the displayed address and enter the code.
4. Tap **Scanner** to photograph a barcode, or type the code. If the product exists, its form opens for editing. Otherwise, complete the new product form. You can capture a separate product photo with the phone camera.
5. **Caisse** opens first after pairing. Add products by photo, name, category, or barcode. A scanned sale product opens a confirmation panel: set its quantity, then choose **Scanner le produit suivant** or **Passer à l’encaissement**. Closing the panel leaves the cart unchanged. Use the header cart to review quantities, choose a customer and payment method, then confirm the sale. The server checks current prices and stock before recording it.

The header menu and bottom navigation open **Caisse**, **Catalogue**, and **Stock**. The menu also opens a new product form and the current cart. Stock can be searched and filtered to low or out-of-stock products; results are paginated.

The installed companion checks for a newer build after pairing and offers **Vérifier les mises à jour** in its menu. Android downloads the newer APK from the same shop PC and opens the system installer after verification. iPhone updates use a configured TestFlight or App Store link. The browser version always loads the current files from the PC.

The mobile address is available while EasyPOS is running. If the phone cannot open it, allow EasyPOS or TCP port 3211 through the computer's firewall on the **private** network. The pairing code changes each time the desktop app restarts, and phone sessions expire after 12 hours.

Tap **Scanner avec la caméra** to open the guided scanner. On a trusted HTTPS connection it shows the rear camera and reads common retail barcodes. The camera stops after the first sale product is recognized, so the same code cannot be added repeatedly. Confirm its quantity before scanning the next product or checking out. It uses the browser's native Barcode Detector when available and the bundled ZXing reader otherwise. **Prendre une photo** and manual code entry remain available.

Browsers do not allow a live video camera on an ordinary LAN HTTP address. On the default HTTP setup, the scanner explains this and offers photo capture, which still opens the phone camera and decodes the resulting image. To enable live scanning on both Android and iPhone, provide a certificate and private key trusted by the phones, with the shop PC's LAN address in the certificate's subject alternative names. Set `MOBILE_TLS_CERT` and `MOBILE_TLS_KEY` to the corresponding PEM file paths before starting EasyPOS. The desktop QR code then uses `https://` automatically. For example, in PowerShell:

```powershell
$env:MOBILE_TLS_CERT = 'C:\path\to\mobile-cert.pem'
$env:MOBILE_TLS_KEY = 'C:\path\to\mobile-key.pem'
npm.cmd run start
```

The certificate must be trusted on each phone; a browser warning alone does not reliably grant camera access. Keep the private key on the shop PC. On HTTP, use a trusted shop Wi-Fi because the pairing code and product data are not encrypted in transit.
