const http = require("http");
const express = require("express")();
const server = http.createServer(express);
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");
const {app} = require('electron');
process.env.APPDATA = app.getPath('appData');
process.env.APPNAME = pkg.name;
const PORT = Number(process.env.PORT || 3210);
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
});

console.log("Server started");

express.use(bodyParser.json());
express.use(bodyParser.urlencoded({ extended: false }));
express.use(limiter);

express.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-type,Accept,X-Access-Token,X-Key",
    );
    if (req.method == "OPTIONS") {
        res.status(200).end();
    } else {
        next();
    }
});

express.get("/", function (req, res) {
    res.send("POS Server Online.");
});

const inventoryApi = require("./api/inventory");
express.use("/api/inventory", inventoryApi);
express.use("/api/suppliers", require("./api/suppliers")(inventoryApi.inventoryDB, inventoryApi.receiptsDB));
const customersApi = require("./api/customers");
express.use("/api/customers", customersApi);
const categoriesApi = require("./api/categories");
express.use("/api/categories", categoriesApi);
express.use("/api/settings", require("./api/settings"));
express.use("/api/users", require("./api/users"));
const transactionsApi = require("./api/transactions");
express.use("/api", transactionsApi);
const mobile = require('./mobile/server').startMobileServer({
    inventoryDB: inventoryApi.inventoryDB,
    categoryDB: categoriesApi.categoryDB,
    customerDB: customersApi.customerDB,
    transactionsDB: transactionsApi.transactionsDB,
    decrementInventory: inventoryApi.decrementInventory,
    uploadsDir: require('path').join(process.env.APPDATA, process.env.APPNAME, 'uploads'),
});

server.listen(PORT, "127.0.0.1", () => {
    process.env.PORT = server.address().port;
    console.log("Listening on PORT", process.env.PORT);
});

/**
 * Restarts the server process.
 */
function restartServer() {
    mobile.server.close(() => server.close(() => {
        // Remove cached modules so require() reloads them
        Object.keys(require.cache).forEach(key => {
            if (key.includes('api') || key.endsWith('server.js')) {
                delete require.cache[key];
            }
        });
        // Re-require server.js to restart everything
        require('./server');
    }));
}

module.exports = { restartServer, mobileInfo: mobile.info };
