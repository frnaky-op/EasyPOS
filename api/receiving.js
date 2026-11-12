const Datastore = require('@seald-io/nedb');
const async = require('async');
const path = require('path');

module.exports = function registerReceivingRoutes(app, inventoryDB, movementsDB, appData, appName) {
  const receiptsDB = new Datastore({
    filename: path.join(appData, appName, 'server', 'databases', 'receipts.db'),
    autoload: true,
  });
  receiptsDB.ensureIndex({ fieldName: 'receiptKey', unique: true });
  app.receiptsDB = receiptsDB;

  app.post('/receiving', function (req, res) {
    const supplier = String(req.body.supplier || '').trim();
    const reference = String(req.body.reference || '').trim();
    const receivedAt = String(req.body.receivedAt || '').trim();
    const rawLines = req.body.lines;
    if (!supplier || supplier.length > 120 || !reference || reference.length > 80 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) ||
        Number.isNaN(Date.parse(receivedAt + 'T00:00:00Z')) ||
        !Array.isArray(rawLines) || rawLines.length < 1 || rawLines.length > 100) {
      return res.status(400).json({ error: 'Invalid supplier receipt.' });
    }
    const lines = [];
    const ids = new Set();
    for (const row of rawLines) {
      const productId = Number(row.productId);
      const quantity = Number(row.quantity);
      const unitCost = Number(row.unitCost);
      if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(quantity) || quantity <= 0 ||
          !Number.isFinite(unitCost) || unitCost < 0 || Math.abs(Math.round(unitCost * 100) - unitCost * 100) > 1e-7 ||
          ids.has(productId)) {
        return res.status(400).json({ error: 'Invalid or duplicate product line.' });
      }
      ids.add(productId);
      lines.push({ productId, quantity, unitCost });
    }

    const changes = [];
    async.eachSeries(lines, function (line, callback) {
      inventoryDB.findOne({ _id: line.productId }, function (error, product) {
        if (error) return callback(error);
        if (!product) return callback(new Error('Product not found.'));
        if (Number(product.stock) !== 1) return callback(new Error('Stock tracking is disabled for ' + product.name + '.'));
        const previous = Number(product.quantity);
        const next = previous + line.quantity;
        if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(next)) {
          return callback(new Error('Invalid stock quantity for ' + product.name + '.'));
        }
        changes.push({ ...line, productName: product.name, previousValue: product.quantity, previous, next });
        callback();
      });
    }, function (checkError) {
      if (checkError) return res.status(409).json({ error: checkError.message });
      const receipt = {
        receiptKey: `${supplier.toLowerCase()}|${reference.toLowerCase()}`,
        supplier, reference, receivedAt, postedAt: new Date().toISOString(),
        lines: changes.map(({ productId, productName, quantity, unitCost }) => ({ productId, productName, quantity, unitCost })),
        total: changes.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost * 100), 0) / 100,
      };
      receiptsDB.insert(receipt, function (insertError, savedReceipt) {
        if (insertError) return res.status(insertError.errorType === 'uniqueViolated' ? 409 : 500).json({ error: 'This supplier invoice is already recorded, or could not be saved.' });
        const applied = [];
        const movementIds = [];
        async.eachSeries(changes, function (change, callback) {
          inventoryDB.update(
            { _id: change.productId, quantity: change.previousValue },
            { $set: { quantity: change.next } }, {},
            function (error, updated) {
              if (!error && updated === 1) applied.push(change);
              if (error) return callback(error);
              if (updated !== 1) return callback(new Error('Stock changed during receipt. Please retry.'));
              callback();
            },
          );
        }, function (updateError) {
          if (updateError) return rollback(updateError);
          async.eachSeries(changes, function (change, callback) {
            movementsDB.insert({
              productId: change.productId, productName: change.productName,
              date: receipt.postedAt, mode: 'receiving', change: change.quantity,
              previous: change.previous, quantity: change.next,
              reference, supplier, receiptId: savedReceipt._id, note: '',
            }, function (error, movement) {
              if (!error) movementIds.push(movement._id);
              callback(error);
            });
          }, function (movementError) {
            if (movementError) return rollback(movementError);
            res.status(201).json({ _id: savedReceipt._id, total: receipt.total, lines: receipt.lines.length });
          });
        });

        function rollback(reason) {
          movementsDB.remove({ _id: { $in: movementIds } }, { multi: true }, function (movementRemoveError) {
            if (movementRemoveError) console.error('Could not remove partial receipt movements:', movementRemoveError);
            async.eachSeries(applied.reverse(), function (change, callback) {
              inventoryDB.update(
                { _id: change.productId, quantity: change.next },
                { $set: { quantity: change.previousValue } }, {},
                function (error, restored) {
                  if (error) return callback(error);
                  if (restored !== 1) return callback(new Error('Stock rollback failed.'));
                  callback();
                },
              );
            }, function (rollbackError) {
              if (rollbackError) console.error('Receipt stock rollback failed:', rollbackError);
              receiptsDB.remove({ _id: savedReceipt._id }, {}, function (removeError) {
                if (removeError) console.error('Could not remove failed receipt:', removeError);
                res.status(409).json({ error: (rollbackError || reason).message });
              });
            });
          });
        }
      });
    });
  });
};
