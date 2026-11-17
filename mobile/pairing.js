(function (root, factory) {
  const pairing = factory();
  if (typeof module === 'object' && module.exports) module.exports = pairing;
  if (root) root.EasyPOSPairing = pairing;
})(typeof window === 'undefined' ? null : window, function () {
  function buildPairUrl(address, code) {
    if (!/^\d{8}$/.test(String(code))) throw new Error('Invalid pairing code');
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid mobile address');
    url.pathname = '/connect';
    url.search = '';
    url.hash = `pair=${code}`;
    return url.href;
  }

  function buildAppUrl(address, code) {
    const pairUrl = new URL(buildPairUrl(address, code));
    const appUrl = new URL('easypos://pair');
    appUrl.searchParams.set('server', pairUrl.origin + '/');
    appUrl.searchParams.set('code', String(code));
    return appUrl.href;
  }

  function parseAppUrl(value) {
    try {
      const url = new URL(value);
      const code = url.searchParams.get('code');
      const server = url.searchParams.get('server');
      if (url.protocol !== 'easypos:' || url.hostname !== 'pair' || url.pathname !== '' || !/^\d{8}$/.test(code || '')) return null;
      const parsed = new URL(server);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return null;
      return { server: parsed.href, code };
    } catch { return null; }
  }

  function takePairCode(location, history) {
    const fragment = location.hash.replace(/^#/, '');
    if (!fragment.startsWith('pair=')) return '';
    history.replaceState(null, '', location.pathname + location.search);
    return /^pair=\d{8}$/.test(fragment) ? fragment.slice(5) : '';
  }

  return { buildPairUrl, buildAppUrl, parseAppUrl, takePairCode };
});
