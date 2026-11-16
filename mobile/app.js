(() => {
  const $ = id => document.getElementById(id);
  const screens = ['catalogueScreen', 'productScreen', 'posScreen', 'checkoutScreen'];
  const cart = new Map();
  let csrf = '';
  let categories = [];
  let category = '';
  let productPage = 1;
  let posPage = 1;
  let productTotal = 0;
  let posTotal = 0;
  let paymentType = 'Cash';
  let photoUrl = '';
  let photoFile = null;
  let searchTimer;
  let messageTimer;
  let language = localStorage.getItem('easypos_mobile_language') || 'fr';
  const translations = { fr: {}, en: {}, ar: {} };
  const originalText = new WeakMap();
  const form = $('productForm');
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
    try { response = await fetch(url, { credentials: 'same-origin', ...options }); }
    catch { throw new Error('Connexion impossible. Vérifiez le Wi-Fi et EasyPOS sur l’ordinateur.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && url !== '/api/pair') showPair();
      const error = new Error(data.error || 'Une erreur est survenue.');
      error.status = response.status;
      error.product = data.product;
      throw error;
    }
    return data;
  }
  function showPair() {
    csrf = '';
    $('pairScreen').hidden = false;
    $('workspace').hidden = true;
    $('cartToggle').hidden = true;
    $('headerSection').textContent = t('Catalogue mobile');
  }
  function showScreen(id) {
    $('pairScreen').hidden = true;
    $('workspace').hidden = false;
    for (const screen of screens) $(screen).hidden = screen !== id;
    $('cartToggle').hidden = id !== 'posScreen' && id !== 'checkoutScreen';
    $('headerSection').textContent = t(id === 'posScreen' || id === 'checkoutScreen' ? 'Caisse mobile' : 'Catalogue mobile');
    $('navCatalogue').classList.toggle('active', id === 'catalogueScreen' || id === 'productScreen');
    $('navPos').classList.toggle('active', id === 'posScreen' || id === 'checkoutScreen');
    $('mobileNav').hidden = id === 'productScreen' || id === 'posScreen' || id === 'checkoutScreen';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  async function showWorkspace() {
    const session = await request('/api/session');
    csrf = session.csrf;
    await Promise.all([loadCategories(), loadCustomers()]);
    showScreen('catalogueScreen');
    await loadProducts();
  }
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
  function productImage(product, className = '') {
    if (product.image) {
      const image = document.createElement('img');
      image.src = product.image;
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
  function posCard(product) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'pos-card';
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
    if (product.stock && next > product.quantity) return message('Stock insuffisant.', true);
    cart.set(product.id, { product, quantity: next });
    updateCartButton();
    for (const button of $('posProducts').querySelectorAll('.pos-card')) {
      const name = button.querySelector('strong');
      if (name && name.textContent === product.name) { button.classList.add('in-cart'); button.dataset.count = next; }
    }
  }
  function updateCartButton() {
    const amount = count();
    $('headerCartCount').textContent = amount;
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
    resetProduct();
    $('productId').value = product.id; $('barcode').value = product.barcode;
    $('name').value = product.name; $('category').value = product.category;
    $('supplier').value = product.supplier; $('price').value = product.price;
    $('quantity').value = product.quantity; $('minStock').value = product.minStock;
    $('formMode').textContent = t('MODIFIER LE PRODUIT'); $('formTitle').textContent = t('Produit identifié');
    $('saveProduct').textContent = t('Enregistrer les modifications');
    if (product.barcode) showBarcode(product.barcode, true);
    $('productSummary').hidden = false;
    $('summaryPhoto').src = product.image || '/logo.png';
    $('summaryName').textContent = product.name;
    $('summaryCategory').textContent = `${categories.find(item => item.id === product.category)?.name || ''} · ${t('En stock')} : ${product.quantity}`;
    $('summaryPrice').textContent = money(product.price);
    if (product.image) { $('photoPreview').src = product.image; $('photoPreview').hidden = false; $('photoPrompt').hidden = true; }
    showScreen('productScreen');
  }
  function newProduct(barcode = '') {
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
        if (forSale) { addToCart(product); showScreen('posScreen'); }
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
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      barcode = result.getText();
    } catch { message('Code illisible. Reprenez la photo de près, bien éclairée, ou saisissez le code.', true); }
    finally { URL.revokeObjectURL(url); input.value = ''; }
    if (barcode) await lookup(barcode, forSale);
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
    try { await request('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('pairCode').value }) }); $('pairCode').value = ''; await showWorkspace(); }
    catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
  $('language').addEventListener('change', event => { language = ['fr', 'en', 'ar'].includes(event.target.value) ? event.target.value : 'fr'; localStorage.setItem('easypos_mobile_language', language); localize(); renderFilters(); updateCartButton(); renderCart(); });
  $('logout').addEventListener('click', async () => { try { await request('/api/logout', { method: 'POST', headers: { 'x-mobile-csrf': csrf } }); } catch (error) { message(error.message, true); } cart.clear(); showPair(); });
  $('navCatalogue').addEventListener('click', () => showScreen('catalogueScreen'));
  $('navPos').addEventListener('click', () => { showScreen('posScreen'); loadPosProducts().catch(error => message(error.message, true)); });
  $('goCatalogue').addEventListener('click', () => showScreen('catalogueScreen'));
  $('manualToggle').addEventListener('click', () => { $('manualLookup').hidden = !$('manualLookup').hidden; if (!$('manualLookup').hidden) $('barcodeSearch').focus(); });
  $('lookupBarcode').addEventListener('click', () => lookup($('barcodeSearch').value));
  $('barcodeSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); lookup(event.currentTarget.value); } });
  $('barcodePhoto').addEventListener('change', event => scanImage(event.currentTarget));
  $('posBarcodePhoto').addEventListener('change', event => scanImage(event.currentTarget, true));
  $('showForm').addEventListener('click', () => newProduct());
  $('productBack').addEventListener('click', () => showScreen('catalogueScreen'));
  $('checkoutBack').addEventListener('click', () => showScreen('posScreen'));
  $('cartToggle').addEventListener('click', showCheckout);
  $('viewCart').addEventListener('click', showCheckout);
  $('moreProducts').addEventListener('click', () => loadProducts(true).catch(error => message(error.message, true)));
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
      resetProduct(); $('barcodeSearch').value = ''; showScreen('catalogueScreen'); await loadProducts();
    } catch (error) { if (error.status === 409 && error.product) openProduct(error.product); message(error.message, true); }
    finally { button.disabled = false; }
  });
  loadTranslations().catch(() => {}).finally(() => { localize(); showWorkspace().catch(error => { showPair(); if (error.status !== 401) message(error.message, true); }); });
})();
