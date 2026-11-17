(() => {
  const $ = id => document.getElementById(id);
  const screens = ['catalogueScreen', 'stockScreen', 'productScreen', 'posScreen', 'checkoutScreen'];
  const cart = new Map();
  let csrf = '';
  let categories = [];
  let category = '';
  let productPage = 1;
  let posPage = 1;
  let stockPage = 1;
  let stockFilter = 'all';
  let productReturnScreen = 'catalogueScreen';
  let productTotal = 0;
  let posTotal = 0;
  let paymentType = 'Cash';
  let photoUrl = '';
  let photoFile = null;
  let searchTimer;
  let messageTimer;
  let scanSession = 0;
  let scanControls = null;
  let scanFrame = 0;
  let scanBusy = false;
  let scanForSale = false;
  let scanPairing = false;
  let scanTorchOn = false;
  let lastScanCode = '';
  let lastScanAt = 0;
  let scannedProduct = null;
  let scannedQuantity = 1;
  let nativePairing = false;
  let availableUpdate = null;
  let updateChecking = false;
  const imageCache = new Map();
  let language = localStorage.getItem('easypos_mobile_language') || 'fr';
  const translations = { fr: {}, en: {}, ar: {} };
  const originalText = new WeakMap();
  const form = $('productForm');
  const companion = window.EasyPOSCompanion || null;
  if (companion) document.body.classList.add('easypos-companion');
  const qrPairCode = window.EasyPOSPairing.takePairCode(window.location, window.history);
  const money = value => `${Number(value || 0).toLocaleString(language === 'fr' ? 'fr-MA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
  const count = () => [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
  const total = () => Math.round([...cart.values()].reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0) * 100) / 100;
  const t = text => translations[language][text] || text;

  function localize() {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    $('language').value = language;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[translate="no"]')) continue;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      const original = originalText.get(node);
      const trimmed = original.trim();
      node.nodeValue = trimmed ? original.replace(trimmed, t(trimmed)) : original;
    }
    for (const element of document.querySelectorAll('[placeholder], [aria-label]')) {
      for (const attribute of ['placeholder', 'aria-label']) {
        if (!element.hasAttribute(attribute)) continue;
        const key = `original${attribute.replace('-', '')}`;
        if (!element.dataset[key]) element.dataset[key] = element.getAttribute(attribute);
        element.setAttribute(attribute, t(element.dataset[key]));
      }
    }
  }
  async function loadTranslations() {
    const response = await fetch('/catalog.tsv');
    if (!response.ok) return;
    for (const line of (await response.text()).split(/\r?\n/)) {
      const [source, english, arabic] = line.split('\t');
      if (source && english && arabic) { translations.en[source] = english; translations.ar[source] = arabic; }
    }
    localize();
  }
  function message(value, error = false) {
    const box = $('message');
    box.textContent = t(value);
    box.classList.toggle('error', error);
    box.hidden = false;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { box.hidden = true; }, 6000);
  }
  async function request(url, options = {}) {
    let response;
    const headers = new Headers(options.headers || {});
    if (companion && url.startsWith('/api/')) {
      const token = companion.getToken();
      if (token && url !== '/api/pair') headers.set('Authorization', `Bearer ${token}`);
    }
    try {
      response = await fetch(companion && url.startsWith('/api/') ? companion.apiUrl(url) : url, {
        credentials: companion ? 'omit' : 'same-origin', ...options, headers,
      });
    }
    catch { throw new Error('Connexion impossible. Vérifiez le Wi-Fi et EasyPOS sur l’ordinateur.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && url !== '/api/pair') showPair();
      const error = new Error(data.error || 'Une erreur est survenue.');
      error.status = response.status;
      error.product = data.product;
      throw error;
    }
    if (companion && url === '/api/pair' && data.token) companion.setToken(data.token);
    return data;
  }
  function showPair() {
    csrf = '';
    closeMenu();
    closeScannedProduct();
    $('updateOverlay').hidden = true;
    if (companion) $('pairServer').value = companion.getServerUrl();
    $('pairScreen').hidden = false;
    $('workspace').hidden = true;
    $('menuToggle').hidden = true;
    $('cartToggle').hidden = true;
    $('headerSection').textContent = t('Catalogue mobile');
  }
  function closeMenu() {
    $('mobileMenu').hidden = true;
    $('menuToggle').setAttribute('aria-expanded', 'false');
  }
  function showScreen(id) {
    closeMenu();
    $('pairScreen').hidden = true;
    $('workspace').hidden = false;
    $('menuToggle').hidden = false;
    for (const screen of screens) $(screen).hidden = screen !== id;
    $('cartToggle').hidden = false;
    $('headerSection').textContent = t(id === 'posScreen' || id === 'checkoutScreen' ? 'Caisse mobile' : id === 'stockScreen' ? 'Stock' : 'Catalogue mobile');
    $('navCatalogue').classList.toggle('active', id === 'catalogueScreen' || (id === 'productScreen' && productReturnScreen === 'catalogueScreen'));
    $('navPos').classList.toggle('active', id === 'posScreen' || id === 'checkoutScreen');
    $('navStock').classList.toggle('active', id === 'stockScreen' || (id === 'productScreen' && productReturnScreen === 'stockScreen'));
    $('mobileNav').hidden = id === 'productScreen' || id === 'checkoutScreen';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  async function showWorkspace() {
    const session = await request('/api/session');
    csrf = session.csrf;
    await Promise.all([loadCategories(), loadCustomers()]);
    showScreen('posScreen');
    await loadPosProducts();
    checkForUpdates().catch(() => {});
  }
  async function checkForUpdates(manual = false) {
    if (!companion || updateChecking || !companion.getServerUrl()) return;
    updateChecking = true;
    if (manual) { closeMenu(); message('Recherche de mises à jour…'); }
    try {
      const [installed, releases] = await Promise.all([companion.updates.installedInfo(), request('/api/mobile-update')]);
      const release = releases[companion.updates.platform];
      const installedBuild = Number(installed.build);
      if (!release || !Number.isSafeInteger(installedBuild) || release.versionCode <= installedBuild) {
        availableUpdate = null;
        $('updateBadge').hidden = true;
        if (manual) message('L’application est à jour.');
        return;
      }
      availableUpdate = release;
      $('updateBadge').hidden = false;
      $('updateVersions').textContent = `${t('Version installée')} ${installed.version} · ${t('Nouvelle version')} ${release.versionName}`;
      $('updateStatus').textContent = t('Une nouvelle version est prête sur l’ordinateur.');
      $('updateInstall').textContent = t(companion.updates.platform === 'android' ? 'Télécharger et installer' : 'Ouvrir la mise à jour');
      $('updateInstall').disabled = false;
      $('updateOverlay').hidden = false;
    } catch (error) { if (manual) message(error.message, true); }
    finally { updateChecking = false; }
  }
  async function installUpdate() {
    if (!companion || !availableUpdate) return;
    const button = $('updateInstall');
    button.disabled = true;
    try {
      if (companion.updates.platform === 'ios') {
        await companion.updates.openStore(availableUpdate.url);
        $('updateStatus').textContent = t('Terminez la mise à jour dans TestFlight ou l’App Store.');
        return;
      }
      $('updateStatus').textContent = t('Téléchargement de la mise à jour…');
      const result = await companion.updates.installAndroid({
        ...availableUpdate, url: companion.apiUrl(availableUpdate.url),
      }, progress => {
        const percent = Math.min(100, Math.round(100 * progress.received / progress.total));
        $('updateStatus').textContent = `${t('Téléchargement')} ${percent} %`;
      });
      $('updateStatus').textContent = t(result.status === 'permission_required'
        ? 'Autorisez cette application à installer les mises à jour, puis réessayez.'
        : 'Confirmez l’installation dans Android.');
      if (result.status === 'permission_required') button.textContent = t('Réessayer');
    } catch (error) { $('updateStatus').textContent = error.message; }
    finally { button.disabled = false; }
  }
  async function pairWithCode(code, serverAddress) {
    if (companion) companion.setServerUrl(serverAddress);
    await request('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    $('pairCode').value = '';
    await showWorkspace();
  }
  async function pairFromAppLink(link) {
    if (!companion || !link) return;
    nativePairing = true;
    stopScanner();
    showPair();
    try { await pairWithCode(link.code, link.server); }
    catch (error) { showPair(); message(error.message, true); }
    finally { companion.consumePairLink(); nativePairing = false; }
  }
  if (companion) window.addEventListener('easypos:pair', event => { pairFromAppLink(event.detail); });
  async function loadCategories() {
    categories = await request('/api/categories');
    const select = $('category');
    select.replaceChildren(new Option(t('Choisir une catégorie'), ''));
    for (const entry of categories) select.add(new Option(entry.name, entry.id));
    renderFilters();
  }
  async function loadCustomers() {
    const customers = await request('/api/customers');
    const select = $('checkoutCustomer');
    select.replaceChildren(new Option(t('Client comptoir'), ''));
    for (const customer of customers) select.add(new Option(customer.name, customer.id));
  }
  function renderFilters() {
    const container = $('posFilters');
    container.replaceChildren();
    for (const entry of [{ id: '', name: t('Tous') }, ...categories]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.name;
      button.classList.toggle('active', entry.id === category);
      button.addEventListener('click', () => { category = entry.id; renderFilters(); loadPosProducts().catch(error => message(error.message, true)); });
      container.append(button);
    }
  }
  function setProductImage(element, source) {
    if (!companion || !source?.startsWith('/api/image/')) { element.src = source; return; }
    const key = `${companion.getServerUrl()}${source}`;
    if (!imageCache.has(key)) {
      imageCache.set(key, fetch(companion.apiUrl(source), {
        headers: { Authorization: `Bearer ${companion.getToken()}` }, credentials: 'omit',
      }).then(response => {
        if (!response.ok) throw new Error('Image unavailable');
        return response.blob();
      }).then(blob => URL.createObjectURL(blob)).catch(error => { imageCache.delete(key); throw error; }));
    }
    imageCache.get(key).then(url => { element.src = url; }).catch(() => {});
  }
  function productImage(product, className = '') {
    if (product.image) {
      const image = document.createElement('img');
      setProductImage(image, product.image);
      image.alt = '';
      image.loading = 'lazy';
      if (className) image.className = className;
      return image;
    }
    const placeholder = document.createElement('span');
    placeholder.className = `photo-placeholder ${className}`;
    placeholder.textContent = '□';
    return placeholder;
  }
  function catalogueRow(product) {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'product-row';
    const info = document.createElement('span'); info.className = 'product-info';
    const name = document.createElement('strong'); name.textContent = product.name; name.setAttribute('translate', 'no');
    const barcode = document.createElement('small'); barcode.textContent = product.barcode || String(product.id); barcode.setAttribute('translate', 'no');
    const price = document.createElement('b'); price.textContent = money(product.price); price.setAttribute('translate', 'no');
    const arrow = document.createElement('span'); arrow.className = 'product-arrow'; arrow.textContent = '›';
    info.append(name, barcode, price); row.append(productImage(product), info, arrow);
    row.addEventListener('click', () => openProduct(product));
    return row;
  }
  async function loadProducts(append = false) {
    const page = append ? productPage + 1 : 1;
    const query = $('productSearch').value.trim();
    const result = await request(`/api/products?q=${encodeURIComponent(query)}&page=${page}`);
    if (!append) $('productList').replaceChildren();
    productPage = page; productTotal = result.total;
    for (const product of result.items) $('productList').append(catalogueRow(product));
    if (!result.total) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Aucun produit trouvé.'); $('productList').append(empty); }
    $('moreProducts').hidden = page * result.pageSize >= productTotal;
  }
  function stockRow(product) {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'product-row stock-row';
    const info = document.createElement('span'); info.className = 'product-info';
    const name = document.createElement('strong'); name.textContent = product.name; name.setAttribute('translate', 'no');
    const barcode = document.createElement('small'); barcode.textContent = product.barcode || String(product.id); barcode.setAttribute('translate', 'no');
    const quantity = document.createElement('b');
    quantity.textContent = product.stock ? `${product.quantity} ${t('En stock')} · ${t('Seuil')} ${product.minStock}` : t('Sans suivi de stock');
    quantity.classList.toggle('stock-out', product.stock && product.quantity <= 0);
    quantity.classList.toggle('stock-low', product.stock && product.quantity > 0 && product.quantity <= product.minStock);
    info.append(name, barcode, quantity);
    const arrow = document.createElement('span'); arrow.className = 'product-arrow'; arrow.textContent = '›';
    row.append(productImage(product), info, arrow);
    row.addEventListener('click', () => openProduct(product));
    return row;
  }
  async function loadStock(append = false) {
    const page = append ? stockPage + 1 : 1;
    const query = $('stockSearch').value.trim();
    const result = await request(`/api/products?q=${encodeURIComponent(query)}&stock=${stockFilter}&page=${page}`);
    if (!append) $('stockList').replaceChildren();
    stockPage = page;
    $('stockCount').textContent = `${result.total} ${t('produits au total')}`;
    for (const product of result.items) $('stockList').append(stockRow(product));
    if (!result.total) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Aucun produit trouvé.'); $('stockList').append(empty); }
    $('moreStock').hidden = page * result.pageSize >= result.total;
  }
  function selectStockFilter(value) {
    stockFilter = value;
    for (const [id, filter] of [['stockAll', 'all'], ['stockLow', 'low'], ['stockOut', 'out']]) $(id).classList.toggle('active', filter === value);
    loadStock().catch(error => message(error.message, true));
  }
  function posCard(product) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'pos-card'; button.dataset.productId = product.id;
    button.disabled = product.stock && product.quantity < 1;
    const photo = document.createElement('span'); photo.className = 'pos-photo'; photo.append(productImage(product));
    const stock = document.createElement('span'); stock.className = 'stock-chip'; stock.textContent = product.stock ? product.quantity : '∞';
    const name = document.createElement('strong'); name.textContent = product.name; name.setAttribute('translate', 'no');
    const price = document.createElement('b'); price.textContent = money(product.price); price.setAttribute('translate', 'no');
    button.append(photo, stock, name, price);
    button.addEventListener('click', () => addToCart(product));
    const current = cart.get(product.id);
    if (current) { button.classList.add('in-cart'); button.dataset.count = current.quantity; }
    return button;
  }
  async function loadPosProducts(append = false) {
    const page = append ? posPage + 1 : 1;
    const query = $('posSearch').value.trim();
    const result = await request(`/api/products?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&page=${page}`);
    if (!append) $('posProducts').replaceChildren();
    posPage = page; posTotal = result.total;
    $('posCount').textContent = `${result.total} ${t('produits au total')}`;
    for (const product of result.items) $('posProducts').append(posCard(product));
    if (!result.total) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Aucun produit trouvé.'); $('posProducts').append(empty); }
    $('morePosProducts').hidden = page * result.pageSize >= posTotal;
  }
  function addToCart(product) {
    const current = cart.get(product.id);
    const next = (current?.quantity || 0) + 1;
    if (product.stock && next > product.quantity) { message('Stock insuffisant.', true); return false; }
    cart.set(product.id, { product, quantity: next });
    updateCartButton();
    for (const button of $('posProducts').querySelectorAll('.pos-card')) {
      const name = button.querySelector('strong');
      if (name && name.textContent === product.name) { button.classList.add('in-cart'); button.dataset.count = next; }
    }
    return true;
  }
  function closeScannedProduct() {
    scannedProduct = null;
    $('scannedProductOverlay').hidden = true;
  }
  function renderScannedQuantity() {
    if (!scannedProduct) return;
    const inCart = cart.get(scannedProduct.id)?.quantity || 0;
    const available = scannedProduct.stock ? Math.max(0, scannedProduct.quantity - inCart) : Infinity;
    $('scannedProductQuantity').textContent = scannedQuantity;
    $('scannedProductInCart').textContent = inCart ? `${t('Déjà dans le panier')} : ${inCart}` : '';
    $('scannedProductSubtotal').textContent = money(scannedQuantity * Number(scannedProduct.price));
    $('scannedProductMinus').disabled = scannedQuantity <= 1;
    $('scannedProductPlus').disabled = scannedQuantity >= available;
  }
  function openScannedProduct(product) {
    const inCart = cart.get(product.id)?.quantity || 0;
    if (product.stock && inCart >= product.quantity) return message('Stock insuffisant.', true);
    scannedProduct = product;
    scannedQuantity = 1;
    setProductImage($('scannedProductImage'), product.image || (companion ? './logo.png' : '/logo.png'));
    $('scannedProductTitle').textContent = product.name;
    $('scannedProductBarcode').textContent = product.barcode || String(product.id);
    $('scannedProductPrice').textContent = money(product.price);
    $('scannedProductStock').textContent = product.stock ? `${t('En stock')} : ${product.quantity}` : t('Sans suivi de stock');
    renderScannedQuantity();
    $('scannedProductOverlay').hidden = false;
    $('scannedProductCheckout').focus();
  }
  function confirmScannedProduct(nextScan) {
    if (!scannedProduct) return;
    const product = scannedProduct;
    const inCart = cart.get(product.id)?.quantity || 0;
    if (product.stock && inCart + scannedQuantity > product.quantity) return message('Stock insuffisant.', true);
    cart.set(product.id, { product, quantity: inCart + scannedQuantity });
    updateCartButton();
    for (const button of $('posProducts').querySelectorAll('.pos-card')) {
      if (button.dataset.productId === String(product.id)) { button.classList.add('in-cart'); button.dataset.count = inCart + scannedQuantity; }
    }
    closeScannedProduct();
    if (nextScan) openScanner(true);
    else showCheckout();
  }
  function updateCartButton() {
    const amount = count();
    $('headerCartCount').textContent = amount;
    $('menuCartCount').textContent = amount;
    $('viewCart').textContent = `${t('Voir le panier')} · ${amount} ${t(amount === 1 ? 'article' : 'articles')} · ${money(total())}`;
  }
  function resetProduct() {
    form.reset();
    $('productId').value = '';
    $('quantity').value = '100'; $('minStock').value = '5';
    $('formMode').textContent = t('NOUVEAU PRODUIT'); $('formTitle').textContent = t('Ajouter un produit');
    $('saveProduct').textContent = t('Enregistrer le produit');
    $('barcodeBanner').hidden = true; $('productSummary').hidden = true;
    $('barcodeLabel').hidden = false; $('barcode').hidden = false;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = ''; photoFile = null;
    $('photoPreview').removeAttribute('src'); $('photoPreview').hidden = true; $('photoPrompt').hidden = false;
  }
  function showBarcode(code, found) {
    $('barcodeBanner').hidden = false;
    $('barcodeBannerLabel').textContent = t(found ? 'CODE-BARRES TROUVÉ' : 'CODE SCANNÉ');
    $('barcodeBannerValue').textContent = code;
    $('barcodeLabel').hidden = true; $('barcode').hidden = true;
  }
  function openProduct(product) {
    productReturnScreen = ['catalogueScreen', 'stockScreen', 'posScreen'].find(id => !$(id).hidden) || 'catalogueScreen';
    $('productBackLabel').textContent = t(productReturnScreen === 'stockScreen' ? 'Stock' : productReturnScreen === 'posScreen' ? 'Caisse' : 'Produits');
    resetProduct();
    $('productId').value = product.id; $('barcode').value = product.barcode;
    $('name').value = product.name; $('category').value = product.category;
    $('supplier').value = product.supplier; $('price').value = product.price;
    $('quantity').value = product.quantity; $('minStock').value = product.minStock;
    $('formMode').textContent = t('MODIFIER LE PRODUIT'); $('formTitle').textContent = t('Produit identifié');
    $('saveProduct').textContent = t('Enregistrer les modifications');
    if (product.barcode) showBarcode(product.barcode, true);
    $('productSummary').hidden = false;
    setProductImage($('summaryPhoto'), product.image || (companion ? './logo.png' : '/logo.png'));
    $('summaryName').textContent = product.name;
    $('summaryCategory').textContent = `${categories.find(item => item.id === product.category)?.name || ''} · ${t('En stock')} : ${product.quantity}`;
    $('summaryPrice').textContent = money(product.price);
    if (product.image) { setProductImage($('photoPreview'), product.image); $('photoPreview').hidden = false; $('photoPrompt').hidden = true; }
    showScreen('productScreen');
  }
  function newProduct(barcode = '') {
    productReturnScreen = ['catalogueScreen', 'stockScreen', 'posScreen'].find(id => !$(id).hidden) || 'catalogueScreen';
    $('productBackLabel').textContent = t(productReturnScreen === 'stockScreen' ? 'Stock' : productReturnScreen === 'posScreen' ? 'Caisse' : 'Produits');
    resetProduct();
    $('barcode').value = barcode;
    if (barcode) showBarcode(barcode, false);
    showScreen('productScreen');
  }
  async function lookup(barcode, forSale = false) {
    barcode = String(barcode || '').trim();
    if (!barcode) return message('Saisissez ou scannez un code-barres.', true);
    try {
      const { product } = await request(`/api/product?barcode=${encodeURIComponent(barcode)}`);
      if (product) {
        if (forSale) { showScreen('posScreen'); openScannedProduct(product); }
        else openProduct(product);
      } else {
        newProduct(barcode);
        message('Nouveau code-barres. Complétez le produit.');
      }
    } catch (error) { message(error.message, true); }
  }
  async function scanImage(input, forSale = false) {
    const file = input.files[0];
    if (!file) return;
    message('Lecture du code-barres…');
    const url = URL.createObjectURL(file);
    let barcode;
    try {
      if (window.BarcodeDetector) {
        try { barcode = (await new BarcodeDetector().detect(file))[0]?.rawValue; }
        catch (_) { /* Use the bundled decoder for unsupported image formats. */ }
      }
      if (!barcode) {
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        try { barcode = (await reader.decodeFromImageUrl(url)).getText(); }
        catch (_) {
          const image = new Image();
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
          const regions = [
            [0, 0, image.naturalWidth, image.naturalHeight],
            [image.naturalWidth * .12, image.naturalHeight * .2, image.naturalWidth * .76, image.naturalHeight * .6],
          ];
          for (const [x, y, width, height] of regions) {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 1600 / Math.max(width, height));
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
            try { barcode = reader.decodeFromCanvas(canvas).getText(); break; }
            catch (_) { /* Try a tighter central crop. */ }
          }
          if (!barcode) throw new Error('Barcode not found');
        }
      }
    } catch { message('Code illisible. Reprenez la photo de près, bien éclairée, ou saisissez le code.', true); }
    finally { URL.revokeObjectURL(url); input.value = ''; }
    if (barcode) await lookup(barcode, forSale);
  }
  function scanStatus(text) { $('scanStatus').textContent = t(text); }
  function stopScanner() {
    scanSession++;
    cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    if (scanControls) { scanControls.stop(); scanControls = null; }
    const video = $('scanVideo');
    if (video.srcObject) { for (const track of video.srcObject.getTracks()) track.stop(); video.srcObject = null; }
    $('scanOverlay').hidden = true;
    $('scanTorch').hidden = true;
    $('scanTorch').textContent = t('Lampe');
    scanTorchOn = false;
    scanBusy = false;
    scanPairing = false;
  }
  async function foundScan(code, session) {
    code = String(code || '').trim();
    if (!code || session !== scanSession || scanBusy) return;
    const now = Date.now();
    if (code === lastScanCode && now - lastScanAt < 1800) return;
    lastScanCode = code; lastScanAt = now; scanBusy = true;
    if (scanPairing) {
      try {
        const link = new URL(code);
        const match = link.hash.match(/^#pair=(\d{8})$/);
        if (!match) throw new Error('Scannez le QR affiché dans Accès mobile.');
        const serverAddress = link.href;
        companion.setServerUrl(serverAddress);
        stopScanner();
        await pairWithCode(match[1], serverAddress);
      } catch (error) {
        if (session === scanSession) scanStatus(error.message);
        else { showPair(); message(error.message, true); }
        scanBusy = false;
      }
      return;
    }
    if (!scanForSale) { stopScanner(); await lookup(code); return; }
    try {
      const { product } = await request(`/api/product?barcode=${encodeURIComponent(code)}`);
      if (session !== scanSession) return;
      if (!product) { stopScanner(); newProduct(code); message('Nouveau code-barres. Complétez le produit.'); return; }
      stopScanner();
      openScannedProduct(product);
      if (navigator.vibrate) navigator.vibrate(45);
    } catch (error) { scanStatus(error.message); }
    finally { scanBusy = false; }
  }
  async function openScanner(forSale = false, pair = false) {
    stopScanner();
    scanForSale = forSale;
    scanPairing = pair;
    lastScanCode = ''; lastScanAt = 0;
    $('scanOverlay').hidden = false;
    $('scanVideo').hidden = Boolean(companion);
    $('scanPhotoAction').hidden = pair;
    $('scanManual').hidden = pair;
    $('scanGuide').textContent = t(pair ? 'Placez le QR de l’ordinateur dans le cadre' : 'Placez le code-barres dans le cadre');
    scanStatus('Ouverture de la caméra…');
    const session = scanSession;
    if (companion) {
      try {
        const controls = await companion.scanner.start(code => foundScan(code, session), pair);
        if (session !== scanSession) { await controls.stop(); return; }
        scanControls = controls;
        $('scanTorch').hidden = false;
        scanStatus(pair ? 'Placez le QR de l’ordinateur dans le cadre' : 'Placez le code-barres dans le cadre');
      } catch (error) { if (session === scanSession) scanStatus(error.message); }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      $('scanVideo').hidden = true;
      scanStatus('Le scan vidéo nécessite HTTPS. Prenez une photo du code-barres ou saisissez-le.');
      return;
    }
    try {
      const constraints = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
      const commonFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];
      const supported = window.BarcodeDetector?.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : [];
      const formats = commonFormats.filter(format => supported.includes(format));
      if (formats.length) {
        const detector = new BarcodeDetector({ formats });
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (session !== scanSession) { stream.getTracks().forEach(track => track.stop()); return; }
        const video = $('scanVideo');
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        $('scanTorch').hidden = !track?.getCapabilities?.().torch;
        scanStatus('Placez le code-barres dans le cadre');
        const detect = async () => {
          if (session !== scanSession) return;
          if (!scanBusy && video.readyState >= 2) {
            try { const results = await detector.detect(video); if (results[0]) await foundScan(results[0].rawValue, session); }
            catch (_) { /* Keep scanning when a frame cannot be decoded. */ }
          }
          if (session === scanSession) scanFrame = requestAnimationFrame(detect);
        };
        scanFrame = requestAnimationFrame(detect);
      } else {
        const reader = new ZXingBrowser.BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 250 });
        const controls = await reader.decodeFromConstraints(constraints, $('scanVideo'), result => {
          if (result) foundScan(result.getText(), session);
        });
        if (session !== scanSession) { controls.stop(); return; }
        scanControls = controls;
        $('scanTorch').hidden = typeof controls.switchTorch !== 'function';
        scanStatus('Placez le code-barres dans le cadre');
      }
    } catch (error) {
      if (session !== scanSession) return;
      $('scanVideo').hidden = true;
      scanStatus(error.name === 'NotAllowedError'
        ? 'Autorisez la caméra dans le navigateur, ou prenez une photo du code-barres.'
        : 'Caméra indisponible. Prenez une photo du code-barres ou saisissez-le.');
    }
  }
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(new File([blob], 'product.jpg', { type: 'image/jpeg' })) : reject(new Error('Photo illisible.')), 'image/jpeg', .78);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible.')); };
      image.src = url;
    });
  }
  function renderCart() {
    const container = $('cartItems');
    container.replaceChildren();
    for (const [id, item] of cart) {
      const line = document.createElement('div'); line.className = 'cart-line';
      const details = document.createElement('div'); details.className = 'cart-line-details';
      const name = document.createElement('strong'); name.textContent = item.product.name;
      const detail = document.createElement('small'); detail.textContent = `${item.quantity} × ${money(item.product.price)}`;
      const price = document.createElement('b'); price.textContent = money(item.quantity * Number(item.product.price));
      details.append(name, detail, price);
      const controls = document.createElement('div'); controls.className = 'quantity-control';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', t('Diminuer la quantité'));
      const value = document.createElement('span'); value.textContent = item.quantity;
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', t('Augmenter la quantité'));
      minus.addEventListener('click', () => changeQuantity(id, -1)); plus.addEventListener('click', () => changeQuantity(id, 1));
      controls.append(minus, value, plus); line.append(productImage(item.product), details, controls); container.append(line);
    }
    if (!cart.size) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = t('Le panier est vide.'); container.append(empty); }
    $('checkoutCount').textContent = `${count()} ${t(count() === 1 ? 'article dans le panier' : 'articles dans le panier')}`;
    $('subtotal').textContent = money(total()); $('total').textContent = money(total());
    $('confirmSale').textContent = `${t('Confirmer la vente')} · ${money(total())}`;
    $('confirmSale').disabled = !cart.size;
    if (!$('paidAmount').value) $('paidAmount').value = total().toFixed(2);
    updateChange();
  }
  function changeQuantity(id, change) {
    const item = cart.get(id); if (!item) return;
    const next = item.quantity + change;
    if (next <= 0) cart.delete(id);
    else if (item.product.stock && next > item.product.quantity) return message('Stock insuffisant.', true);
    else item.quantity = next;
    updateCartButton(); renderCart();
  }
  function showCheckout() { renderCart(); showScreen('checkoutScreen'); }
  function choosePayment(method) {
    paymentType = method;
    $('cashMethod').classList.toggle('active', method === 'Cash');
    $('cardMethod').classList.toggle('active', method === 'Card');
    $('cashField').hidden = method === 'Card';
  }
  function updateChange() {
    const paid = Number(String($('paidAmount').value).replace(',', '.'));
    $('changeAmount').textContent = Number.isFinite(paid) && paid >= total() ? `${t('Monnaie à rendre')} : ${money(paid - total())}` : '';
  }
  async function confirmSale() {
    if (!cart.size) return;
    const paid = paymentType === 'Card' ? total() : Number(String($('paidAmount').value).replace(',', '.'));
    if (!Number.isFinite(paid) || paid < total()) return message('Le paiement doit couvrir le total.', true);
    const button = $('confirmSale'); button.disabled = true;
    try {
      const result = await request('/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mobile-csrf': csrf }, body: JSON.stringify({ items: [...cart].map(([id, item]) => ({ id, quantity: item.quantity })), paymentType, paid, customerId: $('checkoutCustomer').value }) });
      cart.clear(); $('paidAmount').value = ''; $('checkoutCustomer').value = '';
      updateCartButton(); renderCart();
      showScreen('posScreen'); await loadPosProducts();
      message(`${t('Vente enregistrée')} · ${result.order}`);
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  }

  $('pairForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await pairWithCode($('pairCode').value, companion ? $('pairServer').value : ''); }
    catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
  $('pairScan').addEventListener('click', () => openScanner(false, true));
  $('language').addEventListener('change', event => { language = ['fr', 'en', 'ar'].includes(event.target.value) ? event.target.value : 'fr'; localStorage.setItem('easypos_mobile_language', language); localize(); renderFilters(); updateCartButton(); renderCart(); renderScannedQuantity(); if (!$('stockScreen').hidden) loadStock().catch(error => message(error.message, true)); });
  $('logout').addEventListener('click', async () => { try { await request('/api/logout', { method: 'POST', headers: { 'x-mobile-csrf': csrf } }); } catch (error) { message(error.message, true); } if (companion) companion.clearToken(); cart.clear(); showPair(); });
  const goCatalogue = () => { showScreen('catalogueScreen'); loadProducts().catch(error => message(error.message, true)); };
  const goPos = () => { showScreen('posScreen'); loadPosProducts().catch(error => message(error.message, true)); };
  const goStock = () => { showScreen('stockScreen'); loadStock().catch(error => message(error.message, true)); };
  $('menuToggle').addEventListener('click', () => { const opening = $('mobileMenu').hidden; $('mobileMenu').hidden = !opening; $('menuToggle').setAttribute('aria-expanded', String(opening)); });
  $('menuClose').addEventListener('click', closeMenu);
  $('mobileMenu').addEventListener('click', event => { if (event.target === $('mobileMenu')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('scannedProductOverlay').hidden) closeScannedProduct();
    else if (!$('scanOverlay').hidden) stopScanner();
    else if (!$('mobileMenu').hidden) closeMenu();
  });
  $('menuPos').addEventListener('click', goPos);
  $('menuCatalogue').addEventListener('click', goCatalogue);
  $('menuStock').addEventListener('click', goStock);
  $('menuNewProduct').addEventListener('click', () => { closeMenu(); newProduct(); });
  $('menuCart').addEventListener('click', showCheckout);
  $('menuUpdates').addEventListener('click', () => checkForUpdates(true));
  $('updateLater').addEventListener('click', () => { $('updateOverlay').hidden = true; });
  $('updateInstall').addEventListener('click', installUpdate);
  $('navCatalogue').addEventListener('click', goCatalogue);
  $('navPos').addEventListener('click', goPos);
  $('navStock').addEventListener('click', goStock);
  $('goCatalogue').addEventListener('click', goCatalogue);
  $('stockAll').addEventListener('click', () => selectStockFilter('all'));
  $('stockLow').addEventListener('click', () => selectStockFilter('low'));
  $('stockOut').addEventListener('click', () => selectStockFilter('out'));
  $('manualToggle').addEventListener('click', () => { $('manualLookup').hidden = !$('manualLookup').hidden; if (!$('manualLookup').hidden) $('barcodeSearch').focus(); });
  $('lookupBarcode').addEventListener('click', () => lookup($('barcodeSearch').value));
  $('barcodeSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); lookup(event.currentTarget.value); } });
  $('catalogueScan').addEventListener('click', () => openScanner());
  $('posScan').addEventListener('click', () => openScanner(true));
  $('scanClose').addEventListener('click', stopScanner);
  $('scannedProductClose').addEventListener('click', closeScannedProduct);
  $('scannedProductOverlay').addEventListener('click', event => { if (event.target === $('scannedProductOverlay')) closeScannedProduct(); });
  $('scannedProductMinus').addEventListener('click', () => { if (scannedQuantity > 1) { scannedQuantity--; renderScannedQuantity(); } });
  $('scannedProductPlus').addEventListener('click', () => { if (scannedProduct && (!scannedProduct.stock || scannedQuantity < scannedProduct.quantity - (cart.get(scannedProduct.id)?.quantity || 0))) { scannedQuantity++; renderScannedQuantity(); } });
  $('scannedProductNext').addEventListener('click', () => confirmScannedProduct(true));
  $('scannedProductCheckout').addEventListener('click', () => confirmScannedProduct(false));
  $('scanManual').addEventListener('click', () => {
    const forSale = scanForSale;
    stopScanner();
    if (forSale) $('posSearch').focus();
    else { $('manualLookup').hidden = false; $('barcodeSearch').focus(); }
  });
  $('scanPhoto').addEventListener('change', event => { const forSale = scanForSale; stopScanner(); scanImage(event.currentTarget, forSale); });
  $('scanTorch').addEventListener('click', async () => {
    try {
      scanTorchOn = !scanTorchOn;
      if (scanControls?.switchTorch) await scanControls.switchTorch(scanTorchOn);
      else await $('scanVideo').srcObject.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: scanTorchOn }] });
      $('scanTorch').textContent = t(scanTorchOn ? 'Éteindre la lampe' : 'Lampe');
    } catch (_) { scanTorchOn = false; $('scanTorch').hidden = true; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !$('scanOverlay').hidden) stopScanner(); });
  window.addEventListener('pagehide', stopScanner);
  $('showForm').addEventListener('click', () => newProduct());
  $('productBack').addEventListener('click', () => showScreen(productReturnScreen));
  $('checkoutBack').addEventListener('click', () => showScreen('posScreen'));
  $('cartToggle').addEventListener('click', showCheckout);
  $('viewCart').addEventListener('click', showCheckout);
  $('moreProducts').addEventListener('click', () => loadProducts(true).catch(error => message(error.message, true)));
  $('moreStock').addEventListener('click', () => loadStock(true).catch(error => message(error.message, true)));
  $('stockSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadStock().catch(error => message(error.message, true)), 250); });
  $('morePosProducts').addEventListener('click', () => loadPosProducts(true).catch(error => message(error.message, true)));
  $('productSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProducts().catch(error => message(error.message, true)), 250); });
  $('posSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadPosProducts().catch(error => message(error.message, true)), 250); });
  $('cashMethod').addEventListener('click', () => choosePayment('Cash'));
  $('cardMethod').addEventListener('click', () => choosePayment('Card'));
  $('paidAmount').addEventListener('input', updateChange);
  $('confirmSale').addEventListener('click', confirmSale);
  $('photo').addEventListener('change', async event => {
    const file = event.currentTarget.files[0]; if (!file) return;
    try {
      photoFile = file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? await compressPhoto(file) : file;
      if (photoFile.size > 2 * 1024 * 1024) throw new Error('Photo trop volumineuse. Choisissez une autre image.');
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(photoFile);
      $('photoPreview').src = photoUrl; $('photoPreview').hidden = false; $('photoPrompt').hidden = true;
    } catch (error) { photoFile = null; message(error.message, true); }
    event.currentTarget.value = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = $('saveProduct'); button.disabled = true;
    try {
      const data = new FormData(form); if (photoFile) data.set('photo', photoFile, photoFile.name);
      const result = await request('/api/product', { method: 'POST', headers: { 'x-mobile-csrf': csrf }, body: data });
      message(`${result.product.name} ${t('enregistré.')}`);
      const returnScreen = productReturnScreen;
      resetProduct(); $('barcodeSearch').value = ''; showScreen(returnScreen);
      if (returnScreen === 'stockScreen') await loadStock();
      else if (returnScreen === 'posScreen') await loadPosProducts();
      else await loadProducts();
    } catch (error) { if (error.status === 409 && error.product) openProduct(error.product); message(error.message, true); }
    finally { button.disabled = false; }
  });
  loadTranslations().catch(() => {}).finally(async () => {
    localize();
    if (nativePairing) return;
    const nativeLink = companion?.consumePairLink();
    if (nativeLink) { await pairFromAppLink(nativeLink); return; }
    if (companion && !companion.getServerUrl()) { showPair(); return; }
    if (qrPairCode) {
      try {
        await request('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: qrPairCode }) });
        await showWorkspace();
      } catch (error) { showPair(); message(error.message, true); }
      return;
    }
    showWorkspace().catch(error => { showPair(); if (error.status !== 401) message(error.message, true); });
  });
})();
