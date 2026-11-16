# EasyPOS mobile catalogue and caisse

The desktop app starts a separate mobile catalogue on port **3211**. It uses the same product and category databases as the desktop app. The desktop API stays bound to localhost.

1. Start EasyPOS on the shop computer and sign in with an account that can manage products.
2. Click **Accès mobile** in the header. The dialog shows the local address and an eight-digit pairing code.
3. Connect the phone to the same Wi-Fi, open the address in its browser, and enter the code.
4. Tap **Scanner** to photograph a barcode, or type the code. If the product exists, its form opens for editing. Otherwise, complete the new product form. You can capture a separate product photo with the phone camera.
5. Open **Caisse** from the bottom navigation to add products by photo, name, category, or barcode. Use the header cart to review quantities, choose a customer and payment method, then confirm the sale. The server checks current prices and stock before recording it.

The mobile address is available while EasyPOS is running. If the phone cannot open it, allow EasyPOS or TCP port 3211 through the computer's firewall on the **private** network. The pairing code changes each time the desktop app restarts, and phone sessions expire after 12 hours.

Barcode capture uses the phone's camera or photo picker and decodes the image in the browser. Live video scanning requires an HTTPS origin; this local HTTP version uses photo capture so it works without installing a certificate on the phone. Keep the shop Wi-Fi trusted because HTTP does not encrypt the pairing code or product data in transit.
