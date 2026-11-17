function normalizeServer(value) {
  const url = new URL(String(value || '').trim());
  const privateIPv4 = /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateIPv4))) {
    throw new Error('Utilisez l’adresse locale affichée par EasyPOS.');
  }
  url.pathname = '/'; url.search = ''; url.hash = '';
  return url.href;
}

module.exports = { normalizeServer };
