const Datastore = require('@seald-io/nedb');
const path = require('path');

module.exports = function registerStockRoutes(app, inventoryDB, appData, appName) {
  const movementsDB = new Datastore({
    filename: path.join(appData, appName, 'server', 'databases', 'stock-movements.db'),
    autoload: true,
  });

  app.get('/stock/overview', function (_req, res) {
    inventoryDB.find({}, function (error, products) {
      if (error) return res.status(500).json({ error: 'Could not load stock.' });
      let value = 0;
      let lowCount = 0;
      let outCount = 0;
      const lowProducts = [];
      products.forEach(product => {
        if (Number(product.stock) !== 1) return;
        const quantity = Number(product.quantity);
        if (!Number.isFinite(quantity)) return;
        const price = Number(product.price);
        if (Number.isFinite(price) && price > 0) value += quantity * price;
        const minimum = Number(product.minStock);
        if (quantity <= 0) outCount++;
        else if (Number.isFinite(minimum) && minimum > 0 && quantity <= minimum) lowCount++;
        else return;
        lowProducts.push({
          _id: product._id, name: product.name, barcode: product.barcode,
          quantity, minStock: Number.isFinite(minimum) ? minimum : 0,
        });
      });
      lowProducts.sort((a, b) => a.quantity - b.quantity || String(a.name).localeCompare(String(b.name)));
      res.json({ value, lowCount, outCount, lowProducts: lowProducts.slice(0, 20) });
    });
  });

  app.get('/stock/movements', function (req, res) {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 10);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return res.status(400).json({ error: 'Invalid movement page.' });
    }
    movementsDB.count({}, function (countError, total) {
      if (countError) return res.status(500).json({ error: 'Could not count movements.' });
      const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
      movementsDB.find({}).sort({ date: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).exec(function (findError, items) {
        if (findError) return res.status(500).json({ error: 'Could not load movements.' });
        res.json({ items, total, page: currentPage, pageSize });
      });
    });
  });

  app.post('/stock/adjust', function (req, res) {
    const productId = Number(req.body.productId);
    const mode = req.body.mode;
    const amount = Number(req.body.amount);
    const note = String(req.body.note || '').trim();
    if (!Number.isSafeInteger(productId) || !['add', 'remove', 'count'].includes(mode) ||
        !Number.isSafeInteger(amount) || amount < 0 || (mode !== 'count' && amount === 0) ||
        note.length > 200) {
      return res.status(400).json({ error: 'Invalid stock adjustment.' });
    }
    inventoryDB.findOne({ _id: productId }, function (findError, product) {
      if (findError) return res.status(500).json({ error: 'Could not load product.' });
      if (!product) return res.status(404).json({ error: 'Product not found.' });
      if (Number(product.stock) !== 1) return res.status(409).json({ error: 'Stock tracking is disabled for this product.' });
      const previous = Number(product.quantity);
      if (!Number.isSafeInteger(previous) || previous < 0) return res.status(409).json({ error: 'Product stock is invalid.' });
      const next = mode === 'count' ? amount : previous + (mode === 'add' ? amount : -amount);
      if (!Number.isSafeInteger(next) || next < 0) return res.status(409).json({ error: 'Not enough stock.' });
      if (next === previous) return res.status(400).json({ error: 'Stock quantity did not change.' });
      inventoryDB.update({ _id: productId, quantity: product.quantity }, { $set: { quantity: next } }, {}, function (updateError, updated) {
        if (updateError) return res.status(500).json({ error: 'Could not update stock.' });
        if (updated !== 1) return res.status(409).json({ error: 'Stock changed. Please retry.' });
        const movement = {
          productId, productName: product.name, date: new Date().toISOString(),
          mode, change: next - previous, previous, quantity: next, note,
        };
        movementsDB.insert(movement, function (insertError, saved) {
          if (!insertError) return res.json(saved);
          inventoryDB.update({ _id: productId, quantity: next }, { $set: { quantity: product.quantity } }, {}, function (rollbackError, restored) {
            if (rollbackError || restored !== 1) console.error('Stock adjustment rollback failed:', rollbackError);
            res.status(500).json({ error: 'Could not record stock movement.' });
          });
        });
      });
    });
  });

  return movementsDB;
};
