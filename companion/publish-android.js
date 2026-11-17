const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const variant = process.argv[2] || 'debug';
if (!['debug', 'release'].includes(variant)) throw new Error('Choose debug or release.');
const output = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', variant);
const metadata = JSON.parse(fs.readFileSync(path.join(output, 'output-metadata.json'), 'utf8'));
const element = metadata.elements?.[0];
if (metadata.applicationId !== 'com.easypos.companion' || metadata.variantName !== variant ||
    !element || !Number.isSafeInteger(element.versionCode) || element.versionCode < 1) {
  throw new Error('Android APK metadata is invalid.');
}
const apk = path.join(output, path.basename(element.outputFile));
const destination = path.join(root, 'mobile', 'downloads');
fs.mkdirSync(destination, { recursive: true });
const publishedApk = path.join(destination, 'EasyPOS-Mobile.apk');
fs.copyFileSync(apk, publishedApk);
const bytes = fs.readFileSync(publishedApk);
const manifest = {
  packageId: metadata.applicationId,
  versionCode: element.versionCode,
  versionName: element.versionName,
  size: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
};
fs.writeFileSync(path.join(destination, 'EasyPOS-Mobile.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Published EasyPOS Mobile ${manifest.versionName} (build ${manifest.versionCode}).`);
