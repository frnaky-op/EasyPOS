const fs = require('fs');

function readAndroidUpdate(apkPath, manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const size = fs.statSync(apkPath).size;
    if (manifest.packageId !== 'com.easypos.companion' ||
        !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1 ||
        typeof manifest.versionName !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(manifest.versionName) ||
        !Number.isSafeInteger(manifest.size) || manifest.size !== size ||
        typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) return null;
    return { versionCode: manifest.versionCode, versionName: manifest.versionName,
      size, sha256: manifest.sha256, url: '/download/android' };
  } catch { return null; }
}

module.exports = { readAndroidUpdate };
