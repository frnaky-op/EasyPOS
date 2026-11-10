const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const sanitizeFilename = require('sanitize-filename');
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {filterFile} = require('../assets/js/utils');
const validFileTypes = [
    "image/jpg",
    "image/jpeg",
    "image/png",
    "image/webp"];
const maxFileSize = 2097152 //2MB = 2*1024*1024
const validator = require("validator");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "inventory.db",
);

const storage = multer.diskStorage({
    destination: path.join(appData, appName, "uploads"),
    filename: function (req, file, callback) {
        callback(null, Date.now()+path.extname(file.originalname));
    },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
  fileFilter: filterFile,
}).single("imagename");


app.use(bodyParser.json());

module.exports = app;

let inventoryDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

inventoryDB.ensureIndex({ fieldName: "_id", unique: true });
const stockMovementsDB = require('./stock')(app, inventoryDB, appData, appName);
require('./receiving')(app, inventoryDB, stockMovementsDB, appData, appName);

function generateUniqueProductId(callback) {
    let candidateId = Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`);

    inventoryDB.findOne({ _id: candidateId }, function (err, existingProduct) {
        if (err) {
            callback(err);
            return;
        }

        if (existingProduct) {
            generateUniqueProductId(callback);
            return;
        }

        callback(null, candidateId);
    });
}

/**
 * GET endpoint: Get the welcome message for the Inventory API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Inventory API");
});

/**
 * GET endpoint: Get product details by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/product/:productId", function (req, res) {
    if (!req.params.productId) {
        res.status(500).send("ID field is required.");
    } else {
        inventoryDB.findOne(
            {
                _id: parseInt(req.params.productId),
            },
            function (err, product) {
                res.send(product);
            },
        );
    }
});

/**
 * GET endpoint: Get details of all products.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/products", function (req, res) {
    inventoryDB.find({}, function (err, docs) {
        res.send(docs);
    });
});

app.get("/products/category-counts", function (req, res) {
    inventoryDB.find({}, { category: 1 }, function (err, products) {
        if (err) return res.status(500).json({ error: "Could not load category counts." });
        const counts = Object.create(null);
        for (const product of products) {
            const key = String(product.category || "0");
            counts[key] = (counts[key] || 0) + 1;
        }
        res.json({ counts, total: products.length });
    });
});

app.get("/products/page", function (req, res) {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 24);
    const search = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) ||
        pageSize < 1 || pageSize > 100 || search.length > 100 || category.length > 100) {
        return res.status(400).json({ error: 'Invalid product page request.' });
    }
    const filters = [];
    if (category && category !== '0') filters.push({ category });
    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'i');
        filters.push({ $or: [{ name: pattern }, { barcode: pattern }, { reference: pattern }, { supplier: pattern }] });
    }
    const query = filters.length === 2 ? { $and: filters } : filters[0] || {};
    inventoryDB.count(query, function (countErr, total) {
        if (countErr) return res.status(500).json({ error: 'Could not count products.' });
        const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
        inventoryDB.find(query).sort({ _id: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).exec(function (findErr, items) {
            if (findErr) return res.status(500).json({ error: 'Could not load products.' });
            res.json({ items, total, page: currentPage, pageSize });
        });
    });
});

app.post("/products/stocks", function (req, res) {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => !Number.isSafeInteger(Number(id)))) {
        return res.status(400).json({ error: 'Invalid product IDs.' });
    }
    inventoryDB.find({ _id: { $in: ids.map(Number) } }, function (err, products) {
        if (err) return res.status(500).json({ error: 'Could not load product stock.' });
        res.json(products.map(({ _id, quantity, stock }) => ({ _id, quantity, stock })));
    });
});

/**
 * POST endpoint: Create or update a product.
 *
 * @param {Object} req request object with product data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/product", function (req, res) {
    upload(req, res, function (err) {

        if (err) {
            if (err instanceof multer.MulterError) {
                console.error('Upload Error:', err);
                return res.status(400).json({
                    error: 'Upload Error',
                    message: err.message,
                });
            } else {
                console.error('Unknown Error:', err);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: err.message,
                });
            }
        }

    let image = "";

    if (validator.escape(req.body.img) !== "") {
        image = sanitizeFilename(req.body.img);
    }

    if (req.file) {
        image = sanitizeFilename(req.file.filename);
    }


    if (validator.escape(req.body.remove) === "1") {
            try {
                let imgPath = path.join(
                appData,
                appName,
                "uploads",
                image,
                );

                if (!req.file) {
                fs.unlinkSync(imgPath);
                image = "";
                }
                
            } catch (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

        }

    let Product = {
        _id: parseInt(validator.escape(req.body.id)),
        barcode: validator.escape(req.body.barcode).trim(),
        expirationDate: validator.escape(req.body.expirationDate),
        price: validator.escape(req.body.price),
        category: validator.escape(req.body.category),
        supplier: validator.escape(req.body.supplier || ""),
        quantity:
            validator.escape(req.body.quantity) == ""
                ? 100
                : validator.escape(req.body.quantity),
        name: validator.escape(req.body.name),
        stock: req.body.stock === "on" ? 0 : 1,
        minStock: validator.escape(req.body.minStock),
        img: image,
    };

    if (validator.escape(req.body.id) === "") {
        generateUniqueProductId(function (idErr, productId) {
            if (idErr) {
                console.error(idErr);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
                return;
            }

            Product._id = productId;
            inventoryDB.insert(Product, function (err, product) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                } else {
                    res.sendStatus(200);
                }
            });
        });
    } else {
        const { _id, ...editableProduct } = Product;
        inventoryDB.update(
            {
                _id: parseInt(validator.escape(req.body.id)),
            },
            { $set: editableProduct },
            {},
            function (err, numReplaced, product) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                } else {
                    res.sendStatus(200);
                }
            },
        );
    }
    });
});

require('./catalogImport')(app, inventoryDB, generateUniqueProductId, appData, appName);

/**
 * DELETE endpoint: Delete a product by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/product/:productId", function (req, res) {
    inventoryDB.remove(
        {
            _id: parseInt(req.params.productId),
        },
        function (err, numRemoved) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                res.sendStatus(200);
            }
        },
    );
});

/**
 * POST endpoint: Find a product by SKU code.
 *
 * @param {Object} req request object with SKU code in the body.
 * @param {Object} res response object.
 * @returns {void}
 */

app.post("/product/sku", function (req, res) {
    let sku = validator.escape(req.body.skuCode);
    const legacyNumber = Number(sku);
    const barcodeValues = [sku];
    if (Number.isSafeInteger(legacyNumber)) barcodeValues.push(legacyNumber);
    inventoryDB.findOne(
        {
            barcode: { $in: barcodeValues },
        },
        function (err, doc) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (doc || !Number.isSafeInteger(legacyNumber)) {
                res.send(doc);
            } else {
                inventoryDB.findOne({ _id: legacyNumber }, function (idErr, byId) {
                    if (idErr) return res.status(500).json({ error: "Could not find product." });
                    res.send(byId);
                });
            }
        },
    );
});

/**
 * Decrement inventory quantities based on a list of products in a transaction.
 *
 * @param {Array} products - List of products in the transaction.
 * @returns {void}
 */
app.decrementInventory = function (products, done, saleReference) {
    if (!Array.isArray(products) || products.length === 0) {
        return done(new Error("A sale must contain at least one product."));
    }

    const quantities = new Map();
    for (const transactionProduct of products) {
        const productId = Number(transactionProduct.id);
        const soldQuantity = Number(transactionProduct.quantity);
        if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(soldQuantity) || soldQuantity <= 0) {
            return done(new Error("Invalid product or quantity in sale."));
        }
        quantities.set(productId, (quantities.get(productId) || 0) + soldQuantity);
    }

    const changes = [];
    async.eachSeries(quantities, function (entry, callback) {
        const [productId, soldQuantity] = entry;
        inventoryDB.findOne(
            { _id: productId },
            function (err, product) {
                if (err) return callback(err);
                if (!product) return callback(new Error("Product no longer exists."));
                if (product.stock === 0) return callback();

                const available = Number(product.quantity);
                if (!Number.isSafeInteger(available) || available < soldQuantity) {
                    return callback(new Error("Insufficient stock for " + product.name + "."));
                }

                changes.push({ productId, productName: product.name, previous: product.quantity, remaining: available - soldQuantity });
                callback();
            },
        );
    }, function (checkErr) {
        if (checkErr) return done(checkErr);

        const applied = [];
        async.eachSeries(changes, function (change, callback) {
            inventoryDB.update(
                { _id: change.productId, quantity: change.previous },
                { $set: { quantity: change.remaining } },
                {},
                function (updateErr, updated) {
                    if (updateErr) return callback(updateErr);
                    if (updated !== 1) return callback(new Error("Stock changed during the sale. Please retry."));
                    applied.push(change);
                    callback();
                },
            );
        }, function (updateErr) {
            if (!updateErr) {
                const savedMovementIds = [];
                const date = new Date().toISOString();
                return async.eachSeries(applied, function (change, callback) {
                    stockMovementsDB.insert({
                        productId: change.productId, productName: change.productName,
                        date, mode: 'sale', change: change.remaining - Number(change.previous),
                        previous: Number(change.previous), quantity: change.remaining,
                        reference: saleReference || '', note: '',
                    }, function (insertErr, movement) {
                        if (!insertErr) savedMovementIds.push(movement._id);
                        callback(insertErr);
                    });
                }, function (movementErr) {
                    if (!movementErr) return done();
                    stockMovementsDB.remove({ _id: { $in: savedMovementIds } }, { multi: true }, function (removeErr) {
                        if (removeErr) console.error('Could not remove partial sale movements:', removeErr);
                        rollbackStock(movementErr);
                    });
                });
            }
            rollbackStock(updateErr);
        });

        function rollbackStock(reason) {
            async.eachSeries(applied.reverse(), function (change, callback) {
                inventoryDB.update(
                    { _id: change.productId, quantity: change.remaining },
                    { $set: { quantity: change.previous } },
                    {},
                    function (rollbackErr, restored) {
                        callback(rollbackErr || (restored !== 1 && new Error("Stock rollback failed.")));
                    },
                );
            }, function (rollbackErr) {
                if (rollbackErr) console.error("Could not restore stock after failed sale:", rollbackErr);
                done(rollbackErr || reason);
            });
        }
    });
};
