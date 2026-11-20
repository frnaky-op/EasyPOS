const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
if (!fs.existsSync(archive)) throw new Error(`Packaged app archive not found: ${archive}`);

const files = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, '')));
for (const required of ['index.html', 'assets/dist/css/bundle.min.css', 'assets/dist/js/bundle.min.js']) {
  if (!files.has(required)) throw new Error(`Packaged app is missing ${required}`);
}

console.log('Verified Electron archive includes the startup page and renderer bundles.');
