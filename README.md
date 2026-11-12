# EasyPOS

EasyPOS is an open-source desktop point-of-sale system for hardware, plumbing, paint, electrical, and other general retail shops. It includes a fast product grid, barcode lookup, sales, customers, supplier receiving, stock movements, and reports.

This project is a fork of [PharmaSpot](https://github.com/drkNsubuga/PharmaSpot). The original project and its contributors remain credited under the [MIT license](LICENSE). The internal package name remains `PharmaSpot` for now so existing local installations continue to use their current data directory; the application and installer are branded EasyPOS.

## Features

- Search and scan products at checkout, with a paginated product grid.
- Track stock through paid sales, supplier receipts, and manual adjustments.
- Manage products, categories, customers, and staff permissions.
- Print receipts and export selected product barcodes as a PDF.
- Import a portable catalogue ZIP with images, and back up or restore local data.
- Check for and install new versions from the app's Settings page.

## Run locally

Requires Node.js and npm. From the project directory:

```sh
npm install
npm run start
```

The first local admin account is created with username `admin` and password `admin`. Change that password after the first login. Run `npm test` for the automated checks.

## Install and update

Download the Windows installer from [GitHub Releases](https://github.com/frnaky-op/EasyPOS/releases/latest). In an installed copy, open **Paramètres → Mises à jour** to check for a new version. The app also checks at startup. When a download finishes, choose **Installer et redémarrer**. Source checkouts started with `npm run start` do not auto-update.

Versions installed using the previous Forge/Squirrel installer need one manual installation of the new NSIS release before in-app updates work. The internal package name remains `PharmaSpot` so the existing local data directory is retained. Back up your data before changing installers.

Maintainers: see [RELEASING.md](RELEASING.md) for versioning and publishing steps.

## Website

The French landing page is in [`website/`](website/). It uses a temporary text mark until the final EasyPOS logo is supplied. Its download links point to GitHub Releases.

## Catalogue data

The local `products/` catalogue and `design/` exports are excluded from this repository. They contain downloaded third-party product images and other working files. Import your own product data and images into each installation.

## Development and attribution

The original PharmaSpot repository is maintained at [drkNsubuga/PharmaSpot](https://github.com/drkNsubuga/PharmaSpot). This fork retains its Git history and copyright notice. Contributions are welcome through issues and pull requests.

EasyPOS is licensed under the [MIT license](LICENSE).
