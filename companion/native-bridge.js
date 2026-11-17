import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import { normalizeServer } from './server-address';
import { parseAppUrl } from '../mobile/pairing';

if (Capacitor.isNativePlatform()) {
  const updater = Capacitor.getPlatform() === 'android' ? registerPlugin('EasyPOSUpdater') : null;
  const serverKey = 'easypos_companion_server';
  const tokenKey = 'easypos_companion_token';
  let listener = null;
  let active = false;
  let pendingPairLink = null;
  let lastPairUrl = '';
  let lastPairAt = 0;

  function receivePairUrl(value) {
    const link = parseAppUrl(value);
    if (!link) return;
    try { link.server = normalizeServer(link.server); } catch { return; }
    if (value === lastPairUrl && Date.now() - lastPairAt < 2000) return;
    lastPairUrl = value;
    lastPairAt = Date.now();
    pendingPairLink = link;
    window.dispatchEvent(new CustomEvent('easypos:pair', { detail: link }));
  }

  App.addListener('appUrlOpen', event => receivePairUrl(event.url));
  App.getLaunchUrl().then(result => { if (result?.url) receivePairUrl(result.url); }).catch(() => {});

  async function stop() {
    if (!active && !listener) return;
    active = false;
    document.documentElement.classList.remove('native-scanning');
    if (listener) { await listener.remove(); listener = null; }
    await BarcodeScanner.stopScan();
  }

  async function start(onCode, pair = false) {
    await stop();
    const permission = await BarcodeScanner.requestPermissions();
    if (permission.camera !== 'granted' && permission.camera !== 'limited') throw new Error('Autorisez la caméra dans les réglages du téléphone.');
    active = true;
    document.documentElement.classList.add('native-scanning');
    try {
      listener = await BarcodeScanner.addListener('barcodeScanned', event => {
        const code = event.barcode?.rawValue;
        if (code) onCode(code);
      });
      await BarcodeScanner.startScan({
        formats: pair ? [BarcodeFormat.QrCode] : [
          BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA,
          BarcodeFormat.UpcE, BarcodeFormat.Code128, BarcodeFormat.Code39,
          BarcodeFormat.Itf, BarcodeFormat.Codabar,
        ],
        lensFacing: LensFacing.Back,
      });
      return { stop, switchTorch: async () => { await BarcodeScanner.toggleTorch(); } };
    } catch (error) {
      await stop().catch(() => {});
      throw error;
    }
  }

  window.EasyPOSCompanion = {
    isNative: true,
    getServerUrl: () => localStorage.getItem(serverKey) || '',
    setServerUrl(value) {
      const next = normalizeServer(value);
      if (next !== localStorage.getItem(serverKey)) localStorage.removeItem(tokenKey);
      localStorage.setItem(serverKey, next);
      return next;
    },
    getToken: () => localStorage.getItem(tokenKey) || '',
    setToken: token => localStorage.setItem(tokenKey, token),
    clearToken: () => localStorage.removeItem(tokenKey),
    apiUrl: route => new URL(route.replace(/^\//, ''), localStorage.getItem(serverKey)).href,
    consumePairLink() { const link = pendingPairLink; pendingPairLink = null; return link; },
    updates: {
      platform: Capacitor.getPlatform(),
      installedInfo: () => App.getInfo(),
      async installAndroid(update, onProgress) {
        if (!updater) throw new Error('Installation Android indisponible.');
        const listener = await updater.addListener('downloadProgress', onProgress);
        try { return await updater.install(update); }
        finally { await listener.remove(); }
      },
      openStore(url) {
        if (!/^https:\/\//i.test(url)) throw new Error('Lien de mise à jour invalide.');
        return Browser.open({ url });
      },
    },
    scanner: { start, stop, toggleTorch: () => BarcodeScanner.toggleTorch() },
  };
}
