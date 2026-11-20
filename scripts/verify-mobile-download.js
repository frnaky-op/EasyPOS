const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { readAndroidUpdate } = require('../mobile/update');

const apk = path.join(__dirname, '..', 'mobile', 'downloads', 'EasyPOS-Mobile.apk');
const manifest = path.join(__dirname, '..', 'mobile', 'downloads', 'EasyPOS-Mobile.json');
const update = readAndroidUpdate(apk, manifest);
if (!update) throw new Error('Android companion APK or manifest is missing or invalid');
const digest = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
if (digest !== update.sha256) throw new Error('Android companion APK checksum does not match the manifest');
console.log(`Verified Android companion ${update.versionName} (${update.size} bytes).`);
