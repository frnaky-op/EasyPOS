const express = require("express");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const validator = require("validator");

const clean = value => String(value || "").trim();
const keyFor = value => clean(validator.unescape(String(value || ""))).toLocaleLowerCase();
const fields = ["name", "phone", "email", "address", "note"];
const limits = { name: 120, phone: 40, email: 120, address: 200, note: 500 };

module.exports = function createSuppliersApi(inventoryDB, receiptsDB) {
  const app = express();
  const supplierDB = new Datastore({
    filename: path.join(process.env.APPDATA, process.env.APPNAME, "server", "databases", "suppliers.db"),
    autoload: true,
  });
  supplierDB.ensureIndex({ fieldName: "key", unique: true });
  app.use(express.json());

  function readDirectory(done) {
    let remaining = 3;
    let failed = false;
    const data = {};
    const finish = (name, error, rows) => {
      if (failed) return;
      if (error) { failed = true; return done(error); }
      data[name] = rows;
      if (--remaining) return;
      const directory = new Map();
      for (const product of data.products) {
        const name = clean(validator.unescape(String(product.supplier || "")));
        if (!name) continue;
        const key = keyFor(name);
        if (!directory.has(key)) directory.set(key, { name, productCount: 0, receiptCount: 0 });
        directory.get(key).productCount++;
      }
      for (const receipt of data.receipts) {
        const name = clean(validator.unescape(String(receipt.supplier || "")));
        if (!name) continue;
        const key = keyFor(name);
        if (!directory.has(key)) directory.set(key, { name, productCount: 0, receiptCount: 0 });
        directory.get(key).receiptCount++;
      }
      for (const supplier of data.suppliers) {
        const key = keyFor(supplier.name);
        directory.set(key, { ...directory.get(key), ...supplier,
          productCount: directory.get(key)?.productCount || 0,
          receiptCount: directory.get(key)?.receiptCount || 0 });
      }
      done(null, [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    };
    inventoryDB.find({}, { supplier: 1 }, (err, rows) => finish("products", err, rows));
    receiptsDB.find({}, { supplier: 1 }, (err, rows) => finish("receipts", err, rows));
    supplierDB.find({}, (err, rows) => finish("suppliers", err, rows));
  }

  function payload(body) {
    const item = {};
    for (const field of fields) {
      item[field] = clean(body[field]);
      if (item[field].length > limits[field]) return null;
    }
    if (!item.name || (item.email && !validator.isEmail(item.email))) return null;
    item.key = keyFor(item.name);
    return item;
  }

  app.get("/all", (req, res) => {
    readDirectory((error, rows) => error
      ? res.status(500).json({ error: "Impossible de charger les fournisseurs." })
      : res.json(rows));
  });

  app.post("/supplier", (req, res) => {
    const item = payload(req.body);
    if (!item) return res.status(400).json({ error: "Vérifiez les informations du fournisseur." });
    supplierDB.insert(item, (error, saved) => error
      ? res.status(error.errorType === "uniqueViolated" ? 409 : 500).json({
        error: error.errorType === "uniqueViolated" ? "Ce fournisseur existe déjà." : "Impossible d'enregistrer le fournisseur.",
      })
      : res.status(201).json(saved));
  });

  app.put("/supplier/:id", (req, res) => {
    const item = payload(req.body);
    if (!item) return res.status(400).json({ error: "Vérifiez les informations du fournisseur." });
    supplierDB.findOne({ _id: req.params.id }, (error, existing) => {
      if (error) return res.status(500).json({ error: "Impossible de modifier le fournisseur." });
      if (!existing) return res.status(404).json({ error: "Fournisseur introuvable." });
      readDirectory((readError, rows) => {
        if (readError) return res.status(500).json({ error: "Impossible de vérifier les références." });
        const current = rows.find(row => keyFor(row.name) === existing.key);
        if (existing.key !== item.key && (current?.productCount || current?.receiptCount)) {
          return res.status(409).json({ error: "Ce fournisseur est utilisé par des produits ou des réceptions. Gardez son nom et modifiez ses coordonnées." });
        }
        supplierDB.update({ _id: existing._id }, { $set: item }, {}, (updateError) => updateError
          ? res.status(updateError.errorType === "uniqueViolated" ? 409 : 500).json({
            error: updateError.errorType === "uniqueViolated" ? "Ce nom est déjà utilisé." : "Impossible de modifier le fournisseur.",
          })
          : res.json({ ...existing, ...item }));
      });
    });
  });

  app.delete("/supplier/:id", (req, res) => {
    supplierDB.findOne({ _id: req.params.id }, (error, existing) => {
      if (error) return res.status(500).json({ error: "Impossible de supprimer le fournisseur." });
      if (!existing) return res.status(404).json({ error: "Fournisseur introuvable." });
      readDirectory((readError, rows) => {
        if (readError) return res.status(500).json({ error: "Impossible de vérifier les références." });
        const current = rows.find(row => keyFor(row.name) === existing.key);
        if (current?.productCount || current?.receiptCount) {
          return res.status(409).json({ error: "Ce fournisseur est utilisé par des produits ou des réceptions." });
        }
        supplierDB.remove({ _id: existing._id }, {}, removeError => removeError
          ? res.status(500).json({ error: "Impossible de supprimer le fournisseur." })
          : res.sendStatus(204));
      });
    });
  });
  return app;
};
