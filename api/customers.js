const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customers.db",
);

app.use(bodyParser.json());

module.exports = app;

let customerDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

customerDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Customer API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Customer API");
});

/**
 * GET endpoint: Get customer details by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        res.status(500).send("ID field is required.");
    } else {
        const numericId = Number(req.params.customerId);
        const ids = Number.isSafeInteger(numericId) ? [req.params.customerId, numericId] : [req.params.customerId];
        customerDB.findOne(
            { _id: { $in: ids } },
            function (err, customer) {
                if (err) return res.status(500).json({ error: "Could not load customer." });
                res.send(customer);
            },
        );
    }
});

app.get("/page", function (req, res) {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 25);
    const search = String(req.query.q || '').trim();
    const type = String(req.query.type || '').trim();
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
        search.length > 100 || !['', 'all', 'professional'].includes(type)) {
        return res.status(400).json({ error: 'Invalid customer page request.' });
    }
    const filters = [];
    if (type === 'professional') filters.push({ type: 'professional' });
    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'i');
        filters.push({ $or: [{ name: pattern }, { phone: pattern }, { email: pattern }, { city: pattern }] });
    }
    const query = filters.length === 2 ? { $and: filters } : filters[0] || {};
    customerDB.count(query, function (countError, total) {
        if (countError) return res.status(500).json({ error: 'Could not count customers.' });
        const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
        customerDB.find(query).sort({ _id: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).exec(function (findError, items) {
            if (findError) return res.status(500).json({ error: 'Could not load customers.' });
            res.json({ items, total, page: currentPage, pageSize });
        });
    });
});

/**
 * GET endpoint: Get details of all customers.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/all", function (req, res) {
    customerDB.find({}, function (err, docs) {
        res.send(docs);
    });
});

/**
 * POST endpoint: Create a new customer.
 *
 * @param {Object} req request object with new customer data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/customer", function (req, res) {
    var newCustomer = req.body;
    customerDB.insert(newCustomer, function (err, customer) {
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

/**
 * DELETE endpoint: Delete a customer by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/customer/:customerId", function (req, res) {
    customerDB.remove(
        {
            _id: req.params.customerId,
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
 * PUT endpoint: Update customer details.
 *
 * @param {Object} req request object with updated customer data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/customer", function (req, res) {
    const customerId = Number(req.body._id);
    if (!Number.isSafeInteger(customerId)) return res.status(400).json({ error: "Invalid customer ID." });

    customerDB.update(
        {
            _id: { $in: [customerId, String(customerId)] },
        },
        { $set: {
            name: req.body.name,
            phone: req.body.phone || '',
            email: req.body.email || '',
            address: req.body.address || '',
            city: req.body.city || '',
            type: req.body.type || '',
        } },
        {},
        function (err, numReplaced, customer) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numReplaced === 0) {
                res.status(404).json({ error: "Customer not found." });
            } else {
                res.sendStatus(200);
            }
        },
    );
});
