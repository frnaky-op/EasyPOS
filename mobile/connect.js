(() => {
  const scannedCode = window.EasyPOSPairing.takePairCode(location, history);
  if (scannedCode) sessionStorage.setItem('easypos_pair_code', scannedCode);
  const code = scannedCode || sessionStorage.getItem('easypos_pair_code');
  const $ = id => document.getElementById(id);
  if (!code) {
    $('status').textContent = 'Ce QR de connexion est invalide. Affichez un nouveau QR dans EasyPOS.';
    $('openApp').hidden = true;
    $('browserLink').hidden = true;
    return;
  }

  const server = location.origin + '/';
  const appUrl = window.EasyPOSPairing.buildAppUrl(server, code);
  $('browserLink').href = `/#pair=${code}`;

  const android = /Android/i.test(navigator.userAgent);
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fallbackUrl = `${server}connect?install=1#pair=${code}`;
  const intentUrl = `intent://pair${new URL(appUrl).search}#Intent;scheme=easypos;package=com.easypos.companion;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  $('openApp').href = android ? intentUrl : appUrl;
  fetch('/install-options').then(response => response.json()).then(options => {
    if (android && options.android) $('androidInstall').hidden = false;
    if (iphone && options.ios) { $('iosInstall').href = options.ios; $('iosInstall').hidden = false; }
    if (android && !options.android) {
      $('installNote').textContent = 'Le fichier Android n’est pas encore disponible sur cet ordinateur.';
      $('installNote').hidden = false;
    }
    if (iphone && !options.ios) {
      $('installNote').textContent = 'Installation iPhone : demandez au propriétaire du magasin le lien TestFlight. Vous pouvez continuer dans le navigateur.';
      $('installNote').hidden = false;
    }
  }).catch(() => {});

  let opened = false;
  document.addEventListener('visibilitychange', () => { if (document.hidden) opened = true; });
  const tryOpen = () => { window.location.href = intentUrl; };
  $('openApp').addEventListener('click', () => { $('status').textContent = 'Ouverture de l’application…'; });
  if (android && !new URLSearchParams(location.search).has('install')) setTimeout(tryOpen, 200);
  if (iphone) $('status').textContent = 'Si l’application est installée, touchez « Ouvrir l’application » pour la connecter.';
  setTimeout(() => { if (!opened) $('status').textContent = 'Si l’application ne s’ouvre pas, installez-la ou touchez « Ouvrir l’application ».'; }, 1800);
})();
