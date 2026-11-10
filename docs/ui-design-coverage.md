# EasyPOS UI design coverage

Figma file: **Untitled**, page: **PharmaSpot**. The page has one design system frame and 22 screen/state frames. The frames below map to the current user-facing views in `index.html`.

| Screen or state | Figma frame | App element |
|---|---|---|
| Design system | 00 · `503:64` | `assets/css/redesign.css` |
| Caisse | 01 · `503:62` | `#pos_view` |
| Catalogue and barcode export | 02 · `503:66` | `#Products` |
| Product fiche | 03 · `503:68` | `#productDetails` |
| Achats / receiving | 04 · `503:70` | `#receiving_view` |
| Stock | 05 · `503:72` | `#stock_view` |
| Ventes | 06 · `503:74` | `#transactions_view` |
| Clients | 07 · `503:76` | `#clients_view` |
| Paramètres | 08 · `503:78` | `#settings_view` |
| Connexion | 09 · `503:80` | `#login` |
| Add/edit product | 10 · `508:82` | `#newProduct` |
| Checkout | 11 · `531:683` | `#paymentModel` |
| Hold sale | 12 · `538:787` | `#dueModal` |
| Receipt | 13 · `539:845` | `#orderModal` |
| Add/edit customer | 14 · `540:983` | `#newCustomer` |
| Add/edit category | 15 · `540:1029` | `#newCategory` |
| Pending orders | 16 · `541:1081` | `#pending_view` |
| Users | 17 · `542:1174` | `#users_view` |
| Categories | 18 · `542:1262` | `#categories_view` |
| Stock adjustment and count | 19 · `542:1335` | `#stockAdjustModal` |
| Add/edit user and own account | 20 · `542:1379` | `#userModal` |
| Network configuration | 21 · `542:1431` | `#settingsModal` terminal mode |
| First-run store setup | 22 · `542:1472` | `#settingsModal` standalone mode |

The old Users, Categories, held orders, and customer orders list dialogs had no active navigation entry point and were removed. Pending orders are served by `GET /pending-orders/page` with search and pagination. The seven frames added in the final audit have local operation JSON and exported PNG previews in `design/figma/`.
