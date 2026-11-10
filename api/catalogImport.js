const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const validator = require('validator');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120 * 1024 * 1024 } }).single('package');
const IMAGE_PATH = /^(?:images|manufacturer_images)\/[a-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i;

function imageExtension(bytes) {
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg';
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    throw new Error('Invalid product image in package');
}

function money(value) {
    const text = String(value ?? '0.00').trim();
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid selling price in package. Use MAD with a decimal point.');
    return Number(text).toFixed(2);
}

function nonnegativeInteger(value, label, fallback) {
    const text = String(value ?? fallback).trim();
    if (!/^\d{1,9}$/.test(text)) throw new Error(`Invalid ${label} in package.`);
    return text;
}

module.exports = function registerCatalogImport(app, inventoryDB, generateUniqueProductId, appData, appName) {
    const categories = require('./categories');
    const uploadsPath = path.join(appData, appName, 'uploads');
    const findProduct = sourceKey => new Promise((resolve, reject) =>
        inventoryDB.findOne({ sourceKey }, (err, doc) => err ? reject(err) : resolve(doc)));
    const createId = () => new Promise((resolve, reject) =>
        generateUniqueProductId((err, id) => err ? reject(err) : resolve(id)));
    const createProduct = product => new Promise((resolve, reject) =>
        inventoryDB.insert(product, (err, doc) => err ? reject(err) : resolve(doc)));
    const ensureCategory = name => new Promise((resolve, reject) =>
        categories.ensureCategory(name, (err, id) => err ? reject(err) : resolve(id)));

    app.post('/import-package', function (req, res) {
        upload(req, res, async function (uploadErr) {
            if (uploadErr) return res.status(400).json({ error: uploadErr.message });
            if (!req.file) return res.status(400).json({ error: 'Select a catalogue ZIP package.' });
            let added = 0;
            let skipped = 0;
            try {
                const archive = await unzipper.Open.buffer(req.file.buffer);
                if (archive.files.length > 1200 || archive.files.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > 180 * 1024 * 1024) {
                    throw new Error('Catalogue package is too large.');
                }
                const entries = new Map(archive.files.map(entry => [entry.path, entry]));
                const manifestEntry = entries.get('manifest.json');
                if (!manifestEntry || manifestEntry.uncompressedSize > 5 * 1024 * 1024) throw new Error('Missing or oversized manifest.json.');
                const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8'));
                if (manifest.format !== 'pharmaspot-catalog' || manifest.version !== 1 || !Array.isArray(manifest.products) || manifest.products.length > 1000) {
                    throw new Error('Unsupported catalogue package.');
                }
                const keys = new Set();
                for (const product of manifest.products) {
                    if (typeof product.source_key !== 'string' || !product.source_key || product.source_key.length > 500 ||
                        typeof product.name !== 'string' || !product.name.trim() || product.name.length > 500 ||
                        typeof product.category !== 'string' || !product.category.trim() || product.category.length > 200 ||
                        typeof product.department !== 'string' || product.department.length > 200 ||
                        typeof product.image_path !== 'string' || !IMAGE_PATH.test(product.image_path) ||
                        !entries.has('images/' + product.image_path) || keys.has(product.source_key)) {
                        throw new Error('Invalid or duplicate product in catalogue package.');
                    }
                    money(product.selling_price_mad);
                    nonnegativeInteger(product.opening_quantity, 'opening quantity', '100');
                    nonnegativeInteger(product.min_stock, 'minimum stock', '1');
                    if (product.barcode && !/^\d{1,32}$/.test(String(product.barcode))) throw new Error('Invalid barcode in package.');
                    keys.add(product.source_key);
                }
                fs.mkdirSync(uploadsPath, { recursive: true });
                const categoryIds = new Map();
                const imageNames = new Map();
                for (const source of manifest.products) {
                    if (await findProduct(source.source_key)) {
                        skipped++;
                        continue;
                    }
                    const categoryName = validator.escape(`${source.department} - ${source.category}`);
                    let categoryId = categoryIds.get(categoryName);
                    if (!categoryId) {
                        categoryId = await ensureCategory(categoryName);
                        categoryIds.set(categoryName, categoryId);
                    }
                    let imageName = imageNames.get(source.image_path);
                    if (!imageName) {
                        const imageEntry = entries.get('images/' + source.image_path);
                        if (imageEntry.uncompressedSize > 5 * 1024 * 1024) throw new Error('Product image exceeds 5 MB.');
                        const imageBytes = await imageEntry.buffer();
                        const extension = imageExtension(imageBytes);
                        imageName = 'catalog-' + crypto.createHash('sha256').update(source.image_path).digest('hex').slice(0, 20) + extension;
                        const imageTarget = path.join(uploadsPath, imageName);
                        if (!fs.existsSync(imageTarget)) fs.writeFileSync(imageTarget, imageBytes, { flag: 'wx' });
                        imageNames.set(source.image_path, imageName);
                    }
                    const product = {
                        _id: await createId(),
                        barcode: source.barcode ? String(source.barcode) : null,
                        expirationDate: '',
                        price: money(source.selling_price_mad),
                        category: String(categoryId),
                        supplier: validator.escape(String(source.supplier || '')),
                        quantity: nonnegativeInteger(source.opening_quantity, 'opening quantity', '100'),
                        name: validator.escape(source.name),
                        stock: 1,
                        minStock: nonnegativeInteger(source.min_stock, 'minimum stock', '1'),
                        img: imageName,
                        sourceKey: source.source_key,
                        sourceUrl: String(source.source_url || ''),
                        reference: String(source.reference || ''),
                        recordType: String(source.record_type || ''),
                        catalogueMarket: String(source.catalogue_market || ''),
                        sourcePriceMad: String(source.source_price_mad || ''),
                        reviewRequired: money(source.selling_price_mad) === '0.00',
                    };
                    await createProduct(product);
                    added++;
                }
                res.json({ added, skipped, total: manifest.products.length });
            } catch (error) {
                console.error('Catalogue import failed:', error);
                res.status(400).json({ error: error.message, added, skipped });
            }
        });
    });
};
