let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("@seald-io/nedb");
let Inventory = require("./inventory");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
  appData,
  appName,
  "server",
  "databases",
  "transactions.db",
);

app.use(bodyParser.json());

module.exports = app;

let transactionsDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

transactionsDB.ensureIndex({ fieldName: "_id", unique: true });
transactionsDB.ensureIndex({ fieldName: "date" });

const saleDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
});
function saleDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(saleDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function saleDays() {
  const [year, month, day] = saleDateKey(new Date()).split('-').map(Number);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (6 - index)));
    return date.toISOString().slice(0, 10);
  });
}
function paidTransaction(transaction) {
  return Number(transaction.status) === 1 && Number.isFinite(Number(transaction.total));
}

app.get('/sales/summary', function (_req, res) {
  const days = saleDays();
  const totals = new Map(days.map(day => [day, { date: day, amount: 0, count: 0 }]));
  const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();
  transactionsDB.find({ date: { $gte: cutoff } }, function (findError, transactions) {
    if (findError) return res.status(500).json({ error: 'Could not load sales.' });
    const products = new Map();
    transactions.forEach(transaction => {
      if (!paidTransaction(transaction)) return;
      const bucket = totals.get(saleDateKey(transaction.date));
      if (!bucket) return;
      bucket.amount += Number(transaction.total);
      bucket.count++;
      (Array.isArray(transaction.items) ? transaction.items : []).forEach(item => {
        const productId = String(item.id || item.product_name || '');
        const quantity = Number(item.quantity);
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) return;
        const existing = products.get(productId) || { name: String(item.product_name || productId), quantity: 0 };
        existing.quantity += quantity;
        products.set(productId, existing);
      });
    });
    transactionsDB.find({}).sort({ date: -1 }).limit(8).exec(function (recentError, recent) {
      if (recentError) return res.status(500).json({ error: 'Could not load recent transactions.' });
      const today = totals.get(days[6]);
      res.json({
        today: { amount: today.amount, count: today.count, average: today.count ? today.amount / today.count : 0 },
        daily: Array.from(totals.values()),
        topProducts: Array.from(products.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
        recent: recent.map(transaction => ({
          _id: transaction._id, order: transaction.order, date: transaction.date,
          user: transaction.user, customer: transaction.customer,
          total: transaction.total, status: transaction.status,
        })),
      });
    });
  });
});

app.get('/sales/export', function (_req, res) {
  const days = new Set(saleDays());
  const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();
  transactionsDB.find({ date: { $gte: cutoff } }).sort({ date: -1 }).exec(function (error, transactions) {
    if (error) return res.status(500).json({ error: 'Could not export sales.' });
    function csvCell(value) {
      const string = String(value == null ? '' : value);
      const safe = /^[=+\-@\t\r]/.test(string) ? "'" + string : string;
      return '"' + safe.replace(/"/g, '""') + '"';
    }
    const rows = [['Référence', 'Date', 'Caissier', 'Client', 'Total', 'Statut']];
    transactions.filter(transaction => days.has(saleDateKey(transaction.date))).forEach(transaction => {
      const customer = transaction.customer && typeof transaction.customer === 'object'
        ? transaction.customer.name : transaction.customer;
      rows.push([
        transaction.order || transaction._id, transaction.date, transaction.user || '',
        customer === '0' || customer === 0 ? 'Client comptoir' : customer || '',
        transaction.total || 0, Number(transaction.status) === 1 ? 'Payée' : 'En attente',
      ]);
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="ventes-7-jours.csv"');
    res.send('\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'));
  });
});

app.post('/sales/customers/latest', function (req, res) {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return res.status(400).json({ error: 'Invalid customer IDs.' });
  }
  const values = ids.flatMap(id => [String(id), Number(id)]);
  transactionsDB.find({ 'customer.id': { $in: values }, status: 1 }, function (error, transactions) {
    if (error) return res.status(500).json({ error: 'Could not load customer purchases.' });
    const latest = {};
    transactions.forEach(transaction => {
      const id = String(transaction.customer && transaction.customer.id);
      if (!latest[id] || String(transaction.date || '') > latest[id]) latest[id] = String(transaction.date || '');
    });
    res.json(latest);
  });
});

app.get('/sales/customer/:customerId', function (req, res) {
  const customerId = Number(req.params.customerId);
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 5);
  if (!Number.isSafeInteger(customerId) || customerId <= 0 || !Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return res.status(400).json({ error: 'Invalid customer history request.' });
  }
  transactionsDB.find({ 'customer.id': { $in: [customerId, String(customerId)] }, status: 1 }, function (error, transactions) {
    if (error) return res.status(500).json({ error: 'Could not load customer history.' });
    transactions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const spent = transactions.reduce((sum, transaction) => sum + (Number(transaction.total) || 0), 0);
    const products = new Map();
    transactions.forEach(transaction => (Array.isArray(transaction.items) ? transaction.items : []).forEach(item => {
      const id = String(item.id || item.product_name || '');
      const quantity = Number(item.quantity);
      if (!id || !Number.isFinite(quantity) || quantity <= 0) return;
      const entry = products.get(id) || { name: String(item.product_name || id), quantity: 0 };
      entry.quantity += quantity;
      products.set(id, entry);
    }));
    const currentPage = Math.min(page, Math.max(1, Math.ceil(transactions.length / pageSize)));
    res.json({
      total: transactions.length, spent, lastPurchase: transactions[0] ? transactions[0].date : null,
      topProducts: Array.from(products.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3),
      page: currentPage, pageSize,
      items: transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(transaction => ({
        _id: transaction._id, order: transaction.order, date: transaction.date,
        total: transaction.total, itemCount: Array.isArray(transaction.items) ? transaction.items.length : 0,
      })),
    });
  });
});

function isPaidSale(transaction) {
  const paid = Number(transaction.paid);
  const total = Number(transaction.total);
  return Number(transaction.status) === 1 && transaction.paid !== "" &&
    Number.isFinite(paid) && Number.isFinite(total) && paid >= total;
}

function validatePayment(transaction, res) {
  if (Number(transaction.status) === 1 && !isPaidSale(transaction)) {
    res.status(400).json({ message: "Payment must cover the order total." });
    return false;
  }
  return true;
}

/**
 * GET endpoint: Get the welcome message for the Transactions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
  res.send("Transactions API");
});

/**
 * GET endpoint: Get details of all transactions.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/all", function (req, res) {
  transactionsDB.find({}, function (err, docs) {
    res.send(docs);
  });
});

/**
 * GET endpoint: Get on-hold transactions.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/on-hold", function (req, res) {
  transactionsDB.find(
    { $and: [{ ref_number: { $ne: "" } }, { status: 0 }] },
    function (err, docs) {
      if (docs) res.send(docs);
    },
  );
});

/**
 * GET endpoint: Get customer orders with a status of 0 and an empty reference number.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer-orders", function (req, res) {
  transactionsDB.find(
    { $and: [{ customer: { $ne: "0" } }, { status: 0 }, { ref_number: "" }] },
    function (err, docs) {
      if (docs) res.send(docs);
    },
  );
});

/**
 * GET endpoint: Get transactions based on date, user, and till parameters.
 *
 * @param {Object} req request object with query parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/by-date", function (req, res) {
  let startDate = new Date(req.query.start);
  let endDate = new Date(req.query.end);

  if (req.query.user == 0 && req.query.till == 0) {
    transactionsDB.find(
      {
        $and: [
          { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
          { status: parseInt(req.query.status) },
        ],
      },
      function (err, docs) {
        if (docs) res.send(docs);
      },
    );
  }

  if (req.query.user != 0 && req.query.till == 0) {
    transactionsDB.find(
      {
        $and: [
          { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
          { status: parseInt(req.query.status) },
          { user_id: parseInt(req.query.user) },
        ],
      },
      function (err, docs) {
        if (docs) res.send(docs);
      },
    );
  }

  if (req.query.user == 0 && req.query.till != 0) {
    transactionsDB.find(
      {
        $and: [
          { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
          { status: parseInt(req.query.status) },
          { till: parseInt(req.query.till) },
        ],
      },
      function (err, docs) {
        if (docs) res.send(docs);
      },
    );
  }

  if (req.query.user != 0 && req.query.till != 0) {
    transactionsDB.find(
      {
        $and: [
          { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
          { status: parseInt(req.query.status) },
          { till: parseInt(req.query.till) },
          { user_id: parseInt(req.query.user) },
        ],
      },
      function (err, docs) {
        if (docs) res.send(docs);
      },
    );
  }
});

/**
 * POST endpoint: Create a new transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/new", function (req, res) {
  let newTransaction = req.body;
  if (!validatePayment(newTransaction, res)) return;

  transactionsDB.insert(newTransaction, function (err, transaction) {
    if (err) {
      console.error(err);
      res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    } else {
      if (!isPaidSale(newTransaction)) return res.sendStatus(200);

      Inventory.decrementInventory(newTransaction.items, function (stockErr) {
        if (!stockErr) return res.sendStatus(200);
        transactionsDB.remove({ _id: transaction._id }, {}, function (removeErr) {
          if (removeErr) console.error("Could not remove failed sale:", removeErr);
          res.status(409).json({ message: stockErr.message });
        });
      }, String(transaction._id));
    }
  });
});

/**
 * PUT endpoint: Update an existing transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/new", function (req, res) {
  if (!validatePayment(req.body, res)) return;

  transactionsDB.findOne({ _id: req.body._id }, function (findErr, previous) {
    if (findErr) return res.status(500).json({ message: findErr.message });
    if (!previous) return res.status(404).json({ message: "Order not found." });

    transactionsDB.update({ _id: previous._id }, req.body, {}, function (err, updated) {
      if (err) return res.status(500).json({ message: err.message });
      if (updated !== 1) return res.status(409).json({ message: "Order changed. Please retry." });
      if (isPaidSale(previous) || !isPaidSale(req.body)) return res.sendStatus(200);

      Inventory.decrementInventory(req.body.items, function (stockErr) {
        if (!stockErr) return res.sendStatus(200);
        transactionsDB.update({ _id: previous._id }, previous, {}, function (restoreErr) {
          if (restoreErr) console.error("Could not restore unpaid order:", restoreErr);
          res.status(409).json({ message: stockErr.message });
        });
      }, String(previous._id));
    });
  });
});

/**
 * POST endpoint: Delete a transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/delete", function (req, res) {
  let transaction = req.body;
  transactionsDB.remove(
    {
      _id: transaction.orderId,
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
 * GET endpoint: Get details of a specific transaction by transaction ID.
 *
 * @param {Object} req request object with transaction ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:transactionId", function (req, res) {
  transactionsDB.find({ _id: req.params.transactionId }, function (err, doc) {
    if (doc) res.send(doc[0]);
  });
});
