const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');
const crypto = require('crypto');

const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
if (!fs.existsSync(archive)) throw new Error(`Packaged app archive not found: ${archive}`);

const files = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, '')));
for (const required of ['index.html', 'assets/dist/css/bundle.min.css', 'assets/dist/js/bundle.min.js', 'mobile/downloads/EasyPOS-Mobile.apk', 'mobile/downloads/EasyPOS-Mobile.json']) {
  if (!files.has(required)) throw new Error(`Packaged app is missing ${required}`);
}

const apk = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'mobile', 'downloads', 'EasyPOS-Mobile.apk');
const manifest = JSON.parse(asar.extractFile(archive, path.join('mobile', 'downloads', 'EasyPOS-Mobile.json')).toString());
if (!fs.existsSync(apk) || fs.statSync(apk).size !== manifest.size ||
  crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex') !== manifest.sha256) {
  throw new Error('Packaged Android companion does not match its manifest');
}

console.log('Verified Electron archive includes startup files and the Android companion.');
