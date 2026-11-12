const jsPDF = require("jspdf");
const html2canvas = require("html2canvas");
const JsBarcode = require("jsbarcode");
const { barcodeValue, createBarcodeSheet } = require("./barcode-sheet");
const { saleTerminal } = require("./sale-terminal");
const { parsePaymentAmount, paymentChange } = require("./payment-amount");
const { pageLabel, renderNavigation, setActiveNavigation } = require("./navigation");
const macaddress = require("macaddress");
const notiflix = require("notiflix");
const validator = require("validator");
const DOMPurify = require("dompurify");
const _ = require("lodash");
let fs = require("fs");
let path = require("path");
let moment = require("moment");
let { ipcRenderer } = require("electron");
let Store = require("electron-store");
const remote = require("@electron/remote");
const app = remote.app;
let cart = [];
let index = 0;
let allUsers = [];
let allProducts = [];
let listedProducts = [];
const selectedBarcodeProducts = new Map();
let posPage = 1;
let posTotal = 0;
let listPage = 1;
let listTotal = 0;
let listPageSize = 7;
let allCategories = [];
let categoryProductCounts = {};
let categoryProductTotal = 0;
let allTransactions = [];
let state = [];
let item;
let auth;
let holdOrder = 0;
let vat = 0;
let perms = null;
let paymentType = 0;
let receipt = "";
let totalVat = 0;
let subTotal = 0;
let method = "";
let order_index = 0;
let user_index = 0;
let product_index = 0;
let transaction_index;
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
let host = "127.0.0.1";
let port = process.env.PORT || "3210";
let img_path = path.join(appData, appName, "uploads", "/");
let api = "http://" + host + ":" + port + "/api/";
const bcrypt = require("bcrypt");
let categories = [];
let holdOrderList = [];
let customerOrderList = [];
let ownUserEdit = null;
let orderTotal = 0;
let auth_error = "Incorrect username or password";
let auth_empty = "Please enter a username and password";
let storage = new Store();
let settings;
let platform;
let user = {};
let start = moment().startOf("month");
let end = moment();
let start_date = moment(start).toDate();
let end_date = moment(end).toDate();
let by_till = 0;
let by_user = 0;
let by_status = 1;
const default_item_img = path.join("assets","images","default.jpg");
const permissions = [
  "perm_products",
  "perm_categories",
  "perm_transactions",
  "perm_users",
  "perm_settings",
];
notiflix.Notify.init({
  position: "right-top",
  cssAnimationDuration: 600,
  messageMaxLength: 150,
  clickToClose: true,
  closeButton: true
});
const {
  DATE_FORMAT,
  moneyFormat,
  isExpired,
  daysToExpire,
  getStockStatus,
  checkFileExists,
  setContentSecurityPolicy,
} = require("./utils");

//set the content security policy of the app
setContentSecurityPolicy();

$(function () {
  function cb(start, end) {
    $("#reportrange span").text(start.format("DD/MM/YYYY") + " au " + end.format("DD/MM/YYYY"));
  }

  $("#reportrange").daterangepicker(
    {
      startDate: start,
      endDate: end,
      autoApply: true,
      locale: { format: "DD/MM/YYYY", separator: " au ", applyLabel: "Appliquer", cancelLabel: "Annuler" },
      timePicker: true,
      timePicker24Hour: true,
      timePickerIncrement: 10,
      timePickerSeconds: true,
      // minDate: '',
      ranges: {
        Today: [moment().startOf("day"), moment()],
        Yesterday: [
          moment().subtract(1, "days").startOf("day"),
          moment().subtract(1, "days").endOf("day"),
        ],
        "Last 7 Days": [
          moment().subtract(6, "days").startOf("day"),
          moment().endOf("day"),
        ],
        "Last 30 Days": [
          moment().subtract(29, "days").startOf("day"),
          moment().endOf("day"),
        ],
        "This Month": [moment().startOf("month"), moment().endOf("month")],
        "This Month": [moment().startOf("month"), moment()],
        "Last Month": [
          moment().subtract(1, "month").startOf("month"),
          moment().subtract(1, "month").endOf("month"),
        ],
      },
    },
    cb,
  );

  cb(start, end);

  $("#expirationDate").daterangepicker({
    singleDatePicker: true,
    locale: {
      format: DATE_FORMAT,
    },
  });
});

//Allow only numbers in input field
$.fn.allowOnlyNumbers = function() {
  return this.on('keydown', function(e) {
  // Allow: backspace, delete, tab, escape, enter, ., ctrl/cmd+A, ctrl/cmd+C, ctrl/cmd+X, ctrl/cmd+V, end, home, left, right, down, up
    if ($.inArray(e.keyCode, [46, 8, 9, 27, 13, 110, 190]) !== -1 || 
      (e.keyCode >= 35 && e.keyCode <= 40) || 
      ((e.keyCode === 65 || e.keyCode === 67 || e.keyCode === 86 || e.keyCode === 88) && (e.ctrlKey === true || e.metaKey === true))) {
      return;
  }
  // Ensure that it is a number and stop the keypress
  if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
    e.preventDefault();
  }
});
};
$('.number-input').allowOnlyNumbers();

//Serialize Object
$.fn.serializeObject = function () {
  var o = {};
  var a = this.serializeArray();
  $.each(a, function () {
    if (o[this.name]) {
      if (!o[this.name].push) {
        o[this.name] = [o[this.name]];
      }
      o[this.name].push(this.value || "");
    } else {
      o[this.name] = this.value || "";
    }
  });
  return o;
};

auth = storage.get("auth");
user = storage.get("user");

$("#main_app").hide();
if (auth == undefined) {
  $.get(api + "users/check/", function (data) {});

  authenticate();
} else {
  $("#login").hide();
  $("#main_app").show();
  platform = storage.get("settings");

  if (platform != undefined) {
    if (platform.app == "Network Point of Sale Terminal") {
      const remotePort = platform.port || port;
      api = "http://" + platform.ip + ":" + remotePort + "/api/";
      perms = true;
    }
  }

  $.get(api + "users/user/" + user._id, function (data) {
    user = data;
    $("#loggedin-user").text(user.fullname);
    $(document).trigger("easypos:user-updated");
  });

  const settingsRequest = $.get(api + "settings/get", function (data) {
    settings = data && data.settings;
  });

  $.get(api + "users/all", function (users) {
    allUsers = [...users];
  });

  $(document).ready(function () {
    $(".loading").hide();
    loadCustomers();

    $.when(settingsRequest, loadCategories()).always(function () {
      let appTitle = settings ? `${validator.unescape(settings.store)} - ${appName}` : appName;
      $("title").text(appTitle);
      if (settings && settings.store) $("#appStoreName").text(validator.unescape(settings.store));

      if (settings && settings.symbol) {
        $("#price_curr, #payment_curr, #change_curr").text(validator.unescape(settings.symbol));
      }

      loadProducts();
      $(document).renderTable(cart);

      if (settings == undefined && auth != undefined) {
        $("#app").val((platform && platform.app) || "Standalone Point of Sale");
        if (platform && platform.ip) $("#ip").val(platform.ip);
        if (platform && platform.till) $("#till").val(platform.till);
        $("#settingsModal").modal("show");
      } else {
        vat = parseFloat(validator.unescape(settings.percentage));
        $("#taxInfo").text(settings.charge_tax ? vat : 0);
      }
    });

    $("#settingsModal").on("hide.bs.modal", function () {
      setTimeout(function () {
        if (settings == undefined && auth != undefined) {
          $("#settingsModal").modal("show");
        }
      }, 1000);
    });

    function applyPermissionVisibility() {
      if (0 == user.perm_products) $(".p_one").hide();
      if (0 == user.perm_categories) $(".p_two").hide();
      if (0 == user.perm_transactions) $(".p_three").hide();
      if (0 == user.perm_users) $(".p_four").hide();
      if (0 == user.perm_settings) $(".p_five").hide();
    }
    applyPermissionVisibility();

    const navigation = $("#appNavigation");
    renderNavigation(navigation.get(0), user);
    setActiveNavigation(navigation.get(0), "pos");
    $(document).on("easypos:user-updated", function () {
      const active = navigation.find("button.active").data("page") || "pos";
      renderNavigation(navigation.get(0), user);
      setActiveNavigation(navigation.get(0), active);
    });
    function closeNavigation() {
      navigation.prop("hidden", true);
      $("#appMenuToggle").attr("aria-expanded", "false").attr("aria-label", "Open navigation");
    }
    $("#appMenuToggle").on("click", function () {
      const opening = navigation.prop("hidden");
      navigation.prop("hidden", !opening);
      $(this).attr("aria-expanded", String(opening)).attr("aria-label", opening ? "Close navigation" : "Open navigation");
    });
    navigation.on("click", "button", function () {
      closeNavigation();
    });
    $(document).on("keydown", function (event) {
      if (event.key === "Escape") closeNavigation();
    });
    $(document).on("click", function (event) {
      if (!navigation.prop("hidden") && !$(event.target).closest("#appNavigation, #appMenuToggle").length) closeNavigation();
    });

    $("#parent").on("click", ".pos-product-card", function () {
      $(this).addToCart(Number(this.dataset.productId), Number(this.dataset.quantity), Number(this.dataset.stock));
    });

    function renderPosCategoryPills() {
      const selected = String($("#categories").val() || "0");
      const holder = $("#posCategoryPills").empty();
      const options = [{ _id: "0", name: "Tous" }, ...allCategories];
      options.forEach(category => {
        const categoryId = String(category._id);
        const button = $("<button>", {
          type: "button", text: validator.unescape(String(category.name)),
          class: categoryId === selected ? "active" : "",
        });
        button.attr("data-category-id", categoryId);
        holder.append(button);
      });
    }
    $("#posCategoryPills").on("click", "button", function () {
      $("#categories").val($(this).attr("data-category-id")).trigger("change");
    });

    function loadProducts(page = posPage) {
      if (loadProducts.request) loadProducts.request.abort();
      const request = {
        page,
        pageSize: 25,
        q: $("#search").val() || "",
        category: $("#categories").val() || "0",
      };
      loadProducts.request = $.get(api + "inventory/products/page", request, function (result) {
        const data = result.items;
        posPage = result.page;
        posTotal = result.total;
        const pageCount = Math.max(1, Math.ceil(posTotal / 25));
        $("#posPageInfo").text(`${data.length} sur ${posTotal} produits · page ${posPage} / ${pageCount}`);
        $("#posVisibleCount").text(`${data.length} produits visibles · ${posTotal} au total`);
        $("#posPrevious").prop("disabled", posPage <= 1);
        $("#posNext").prop("disabled", posPage >= pageCount);
        allProducts = [...data];
        const grid = $("#parent").empty();
        if (!data.length) grid.append($("<p>", { class: "pos-cart-empty", text: "Aucun produit trouvé." }));
        data.forEach((item) => {
          const name = validator.unescape(String(item.name || "Produit"));
          const category = allCategories.find(entry => String(entry._id) === String(item.category));
          const categoryName = category ? validator.unescape(String(category.name)) : "Produit";
          const imagePath = item.img && checkFileExists(path.join(img_path, item.img))
            ? path.join(img_path, item.img) : default_item_img;
          const expired = item.expirationDate && isExpired(item.expirationDate);
          const stockStatus = getStockStatus(item.quantity, item.minStock);
          const tracked = Number(item.stock) === 1;
          const stockLabel = tracked ? String(item.quantity || 0) : "∞";
          const amount = Number(item.price);
          const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
          const priceLabel = `${moneyFormat(Number.isFinite(amount) ? amount : 0)} ${symbol}`;
          const card = $("<button>", { type: "button", class: "pos-product-card", title: name });
          card.attr({ "data-product-id": item._id, "data-quantity": item.quantity || 0, "data-stock": item.stock });
          if (expired || (tracked && stockStatus === 0)) card.addClass("is-unavailable");
          const photo = $("<span>", { class: "pos-product-photo" }).append(
            $("<img>", { src: imagePath, alt: "" }),
            $("<span>", { class: `pos-stock-badge ${tracked && stockStatus < 1 ? "low" : ""}`, text: expired ? "Exp." : stockLabel }),
          );
          card.append(photo,
            $("<span>", { class: "pos-product-name", text: name }),
            $("<span>", { class: "pos-product-detail", text: item.barcode || item._id }),
            $("<span>", { class: "pos-product-foot" }).append(
              $("<span>", { text: categoryName }), $("<strong>", { text: priceLabel }),
            ));
          grid.append(card);
        });
      });
      return loadProducts.request;
    }

    let searchTimer;
    $("#search").on("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadProducts(1), 250);
    });
    $("#categories").on("change", () => { renderPosCategoryPills(); loadProducts(1); });
    $("body").on("click", "#jq-keyboard button", function () {
      if ($("#search").is(":focus")) loadProducts(1);
    });
    $("#posPrevious").on("click", () => loadProducts(posPage - 1));
    $("#posNext").on("click", () => loadProducts(posPage + 1));

    let stockMovementPage = 1;
    let stockMovementPages = 1;
    function loadStockPage() {
      $.get(api + "inventory/stock/overview", function (data) {
        const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
        $("#stockValue").text(`${moneyFormat(Number(data.value).toFixed(2))} ${symbol}`);
        $("#stockLowCount").text(data.lowCount);
        $("#stockOutCount").text(data.outCount);
        const list = $("#stockLowProducts").empty();
        if (!data.lowProducts.length) list.append($("<p>", { class: "stock-empty", text: "Aucun produit à réapprovisionner." }));
        data.lowProducts.forEach(product => {
          list.append($("<div>", { class: "stock-low-item" }).append(
            $("<span>", { class: product.quantity <= 0 ? "stock-low-dot out" : "stock-low-dot" }),
            $("<div>").append(
              $("<strong>", { text: validator.unescape(String(product.name || "Produit")) }),
              $("<small>", { text: `${product.quantity} en stock · seuil ${product.minStock}` }),
            ),
          ));
        });
      }).fail(() => $("#stockLowProducts").text("Impossible de charger le stock."));
      loadStockMovements(stockMovementPage);
    }
    function loadStockMovements(page) {
      $.get(api + "inventory/stock/movements", { page, pageSize: 10 }, function (data) {
        stockMovementPage = data.page;
        stockMovementPages = Math.max(1, Math.ceil(data.total / data.pageSize));
        $("#stockMovementPageInfo").text(`Page ${data.page} / ${stockMovementPages}`);
        $("#stockMovementPrevious").prop("disabled", data.page <= 1);
        $("#stockMovementNext").prop("disabled", data.page >= stockMovementPages);
        const rows = $("#stockMovementRows").empty();
        if (!data.items.length) rows.append($("<tr>").append($("<td>", { colspan: 5, class: "stock-empty", text: "Aucun mouvement enregistré." })));
        data.items.forEach(item => {
          const type = item.mode === "count" ? "Inventaire" : item.mode === "add" ? "Entrée" : item.mode === "receiving" ? "Réception" : item.mode === "sale" ? "Vente" : "Sortie";
          const date = new Date(item.date);
          rows.append($("<tr>").append(
            $("<td>", { text: Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" }) }),
            $("<td>", { text: validator.unescape(String(item.productName || item.productId)) }),
            $("<td>", { text: type }),
            $("<td>", { text: `${item.change > 0 ? "+" : ""}${item.change}` }),
            $("<td>", { text: item.quantity }),
          ));
        });
      }).fail(() => $("#stockMovementRows").empty().append($("<tr>").append($("<td>", { colspan: 5, class: "stock-empty", text: "Impossible de charger les mouvements." }))));
    }
    $("#stockRefresh").on("click", loadStockPage);
    $("#stockMovementPrevious").on("click", () => loadStockMovements(stockMovementPage - 1));
    $("#stockMovementNext").on("click", () => loadStockMovements(stockMovementPage + 1));
    $("#stockOpenCatalogue").on("click", () => $("#productModal").trigger("click"));

    function openStockAdjust(mode) {
      $("#stockAdjustForm").get(0).reset();
      $("#stockProductId").val("");
      $("#stockProductResults,#stockCurrentQuantity,#stockAdjustError").empty();
      $("#stockAdjustMode").val(mode);
      $(".stock-mode-buttons button").each(function () {
        $(this).attr("aria-pressed", String($(this).data("mode") === mode));
      });
      $("#stockAdjustTitle").text(mode === "count" ? "Nouvel inventaire" : "Ajuster le stock");
      $("#stockAdjustAmount").attr("min", mode === "count" ? 0 : 1);
      $("#stockAdjustModal").modal("show");
      setTimeout(() => $("#stockProductSearch").trigger("focus"), 250);
    }
    $("#stockCountButton").on("click", () => openStockAdjust("count"));
    $("#stockAdjustButton").on("click", () => openStockAdjust("add"));
    $(".stock-mode-buttons button").on("click", function () {
      $("#stockAdjustMode").val($(this).data("mode")).trigger("change");
    });
    $("#stockAdjustMode").on("change", function () {
      $("#stockAdjustAmount").attr("min", this.value === "count" ? 0 : 1);
      $(".stock-mode-buttons button").each((_, button) => {
        $(button).attr("aria-pressed", String($(button).data("mode") === this.value));
      });
    });
    let stockSearchTimer;
    let stockSearchRequest;
    $("#stockProductSearch").on("input", function () {
      $("#stockProductId").val("");
      $("#stockCurrentQuantity").empty();
      const query = this.value.trim();
      const results = $("#stockProductResults").empty();
      clearTimeout(stockSearchTimer);
      if (stockSearchRequest) stockSearchRequest.abort();
      if (!query) return;
      stockSearchTimer = setTimeout(() => {
        stockSearchRequest = $.get(api + "inventory/products/page", { page: 1, pageSize: 12, q: query }, function (data) {
          if (!data.items.length) results.text("Aucun produit trouvé.");
          data.items.filter(product => Number(product.stock) === 1).forEach(product => {
            const button = $("<button>", { type: "button" }).append(
              $("<strong>", { text: validator.unescape(String(product.name || "Produit")) }),
              $("<small>", { text: `${product.barcode || product._id} · stock ${product.quantity}` }),
            );
            button.on("click", function () {
              $("#stockProductId").val(product._id);
              $("#stockProductSearch").val(validator.unescape(String(product.name || "")));
              $("#stockCurrentQuantity").text(`Stock actuel : ${product.quantity}`);
              results.empty();
              $("#stockAdjustAmount").trigger("focus");
            });
            results.append(button);
          });
          if (!results.children().length && data.items.length) results.text("Aucun produit avec suivi de stock.");
        });
      }, 230);
    });
    $("#stockAdjustForm").on("submit", function (event) {
      event.preventDefault();
      const productId = Number($("#stockProductId").val());
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        $("#stockAdjustError").text("Sélectionnez un produit dans la liste.");
        return;
      }
      const button = $(this).find('[type="submit"]').prop("disabled", true);
      $.ajax({
        url: api + "inventory/stock/adjust", type: "POST", contentType: "application/json",
        data: JSON.stringify({ productId, mode: $("#stockAdjustMode").val(), amount: Number($("#stockAdjustAmount").val()), note: $("#stockAdjustNote").val() }),
        success: function () {
          $("#stockAdjustModal").modal("hide");
          stockMovementPage = 1;
          loadStockPage();
          loadProducts();
          loadProductList();
        },
        error: response => $("#stockAdjustError").text((response.responseJSON || {}).error || "Ajustement impossible."),
        complete: () => button.prop("disabled", false),
      });
    });

    const receivingDraftKey = "pharmaspot.receivingDraft.v1";
    let receivingDraftLoaded = false;
    function receivingToday() {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    function updateReceivingTotals() {
      let references = 0;
      let units = 0;
      let cost = 0;
      $("#receivingLines tr").each(function () {
        const product = $(this).data("product");
        const quantity = Number($(this).find(".receiving-quantity").val()) || 0;
        const unitCost = Number($(this).find(".receiving-cost").val()) || 0;
        $(this).find(".receiving-new-stock").text(product && quantity > 0 ? Number(product.quantity) + quantity : "—");
        if (product) references++;
        if (product && quantity > 0) units += quantity;
        if (product && quantity > 0 && unitCost >= 0) cost += quantity * unitCost;
      });
      $("#receivingLineCount").text(`${references} référence${references === 1 ? "" : "s"} · ${units} unité${units === 1 ? "" : "s"} reçue${units === 1 ? "" : "s"}`);
      const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
      $("#receivingTotal").text(`${moneyFormat(cost.toFixed(2))} ${symbol}`);
    }
    function selectReceivingProduct(row, product) {
      row.data("product", product);
      row.find(".receiving-product-search").val(validator.unescape(String(product.name || "")));
      row.find(".receiving-current-stock").text(product.quantity);
      row.find(".receiving-product-results").empty();
      updateReceivingTotals();
    }
    function addReceivingLine(draftLine) {
      const row = $("<tr>");
      const search = $("<input>", { type: "search", class: "receiving-product-search", placeholder: "Nom, code-barres ou référence", "aria-label": "Rechercher un produit" });
      const results = $("<div>", { class: "receiving-product-results" });
      const quantity = $("<input>", { type: "number", class: "receiving-quantity", min: 1, step: 1, placeholder: "0", "aria-label": "Quantité reçue" });
      const unitCost = $("<input>", { type: "number", class: "receiving-cost", min: 0, step: "0.01", placeholder: "0,00", "aria-label": "Coût unitaire" });
      row.append(
        $("<td>", { class: "receiving-product-cell" }).append(search, results),
        $("<td>", { class: "receiving-current-stock", text: "—" }),
        $("<td>").append(quantity),
        $("<td>").append(unitCost),
        $("<td>", { class: "receiving-new-stock", text: "—" }),
        $("<td>").append($("<button>", { type: "button", class: "receiving-remove-line", "aria-label": "Retirer la ligne" }).append($("<i>", { class: "fa fa-times" })).on("click", function () { row.remove(); updateReceivingTotals(); })),
      );
      $("#receivingLines").append(row);
      quantity.add(unitCost).on("input", updateReceivingTotals);
      let timer;
      let request;
      search.on("input", function () {
        row.removeData("product");
        row.find(".receiving-current-stock").text("—");
        updateReceivingTotals();
        const query = this.value.trim();
        results.empty();
        clearTimeout(timer);
        if (request) request.abort();
        if (!query) return;
        timer = setTimeout(() => {
          request = $.get(api + "inventory/products/page", { page: 1, pageSize: 10, q: query }, function (data) {
            const products = data.items.filter(product => Number(product.stock) === 1);
            if (!products.length) results.text("Aucun produit avec suivi de stock.");
            products.forEach(product => {
              const option = $("<button>", { type: "button" }).append(
                $("<strong>", { text: validator.unescape(String(product.name || "Produit")) }),
                $("<small>", { text: `${product.barcode || product._id} · stock ${product.quantity}` }),
              );
              option.on("click", () => { selectReceivingProduct(row, product); quantity.trigger("focus"); });
              results.append(option);
            });
          });
        }, 220);
      });
      if (draftLine) {
        quantity.val(draftLine.quantity);
        unitCost.val(draftLine.unitCost);
        if (draftLine.productId) {
          $.get(api + "inventory/product/" + draftLine.productId, function (product) {
            if (product && Number(product.stock) === 1) selectReceivingProduct(row, product);
          });
        } else if (draftLine.query) search.val(draftLine.query);
      }
      updateReceivingTotals();
      return row;
    }
    $("#receivingAddLine,#receivingAddSearch").on("click", function () {
      addReceivingLine().find(".receiving-product-search").trigger("focus");
    });
    function collectReceivingLines() {
      const lines = [];
      $("#receivingLines tr").each(function () {
        const product = $(this).data("product");
        lines.push({
          productId: product ? product._id : null,
          query: $(this).find(".receiving-product-search").val(),
          quantity: $(this).find(".receiving-quantity").val(),
          unitCost: $(this).find(".receiving-cost").val(),
        });
      });
      return lines;
    }
    $("#receivingSaveDraft").on("click", function () {
      try {
        localStorage.setItem(receivingDraftKey, JSON.stringify({
          supplier: $("#receivingSupplier").val(), reference: $("#receivingReference").val(),
          receivedAt: $("#receivingDate").val(), lines: collectReceivingLines(),
        }));
        $("#receivingState").text("Brouillon enregistré");
        $("#receivingMessage").text("Brouillon enregistré sur cet appareil.");
      } catch (error) {
        $("#receivingMessage").text("Impossible d'enregistrer le brouillon.");
      }
    });
    function openReceivingPage() {
      if (receivingDraftLoaded) return;
      receivingDraftLoaded = true;
      $("#receivingDate").val(receivingToday());
      let draft;
      try { draft = JSON.parse(localStorage.getItem(receivingDraftKey) || "null"); } catch (_) { draft = null; }
      if (draft) {
        $("#receivingSupplier").val(draft.supplier || "");
        $("#receivingReference").val(draft.reference || "");
        $("#receivingDate").val(draft.receivedAt || receivingToday());
        $("#receivingState").text("Brouillon");
        (draft.lines || []).forEach(addReceivingLine);
      }
      if (!$("#receivingLines tr").length) addReceivingLine();
    }
    $("#receivingForm").on("submit", function (event) {
      event.preventDefault();
      const draftLines = collectReceivingLines();
      const ids = draftLines.map(line => Number(line.productId));
      if (!draftLines.length || draftLines.some(line => !Number.isSafeInteger(Number(line.productId)) || !line.productId ||
          !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1 ||
          line.unitCost === "" || !Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0) ||
          new Set(ids).size !== ids.length) {
        notiflix.Report.warning("Réception à vérifier", "Vérifiez les produits, les quantités, les coûts et les lignes en double.", "OK");
        return;
      }
      const button = $("#receivingPost").prop("disabled", true);
      $("#receivingMessage").text("Enregistrement de la réception…");
      $.ajax({
        url: api + "inventory/receiving", type: "POST", contentType: "application/json",
        data: JSON.stringify({
          supplier: $("#receivingSupplier").val(), reference: $("#receivingReference").val(),
          receivedAt: $("#receivingDate").val(),
          lines: draftLines.map(line => ({ productId: Number(line.productId), quantity: Number(line.quantity), unitCost: Number(line.unitCost) })),
        }),
        success: function (receipt) {
          try { localStorage.removeItem(receivingDraftKey); } catch (_) {}
          $("#receivingForm").get(0).reset();
          $("#receivingDate").val(receivingToday());
          $("#receivingLines").empty();
          addReceivingLine();
          $("#receivingState").text("Nouvelle réception");
          $("#receivingMessage").text("");
          notiflix.Report.success("Réception enregistrée", `Le stock a été mis à jour pour ${receipt.lines} référence${receipt.lines === 1 ? "" : "s"}.`, "OK");
          loadProducts();
          loadProductList();
          loadSuppliers();
        },
        error: function (response) {
          $("#receivingMessage").text("");
          const message = (response.responseJSON || {}).error || "Impossible d'enregistrer la réception.";
          notiflix.Report.failure("Réception impossible", $("<div>").text(message).html(), "OK");
        },
        complete: () => button.prop("disabled", false),
      });
    });

    function loadSalesDashboard() {
      $("#salesDashboardMessage").text("");
      $.get(api + "sales/summary", function (report) {
        const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
        const formatAmount = value => `${moneyFormat(Number(value || 0).toFixed(2))} ${symbol}`;
        $("#salesTodayAmount").text(formatAmount(report.today.amount));
        $("#salesTodayCount").text(report.today.count);
        $("#salesTodayAverage").text(formatAmount(report.today.average));

        const chart = $("#salesWeekChart").empty();
        const maximum = Math.max(1, ...report.daily.map(day => Number(day.amount) || 0));
        report.daily.forEach((day, index) => {
          const date = new Date(`${day.date}T12:00:00Z`);
          const label = date.toLocaleDateString("fr-MA", { weekday: "short", timeZone: "Africa/Casablanca" });
          const height = Math.round((Number(day.amount) || 0) / maximum * 100);
          chart.append($("<div>", { class: "sales-chart-day", title: `${day.date} · ${formatAmount(day.amount)}` }).append(
            $("<div>", { class: "sales-chart-track" }).append($("<div>", { class: `sales-chart-bar${index === 6 ? " current" : ""}` }).css("height", `${height}%`)),
            $("<span>", { text: label }),
          ));
        });
        chart.attr("aria-label", "Ventes des sept derniers jours : " + report.daily.map(day => `${day.date}, ${formatAmount(day.amount)}`).join("; "));

        const top = $("#salesTopProducts").empty();
        if (!report.topProducts.length) top.append($("<p>", { class: "sales-empty", text: "Aucune vente sur les 7 derniers jours." }));
        report.topProducts.forEach((product, index) => {
          top.append($("<div>", { class: "sales-top-item" }).append(
            $("<span>", { class: "sales-top-rank", text: index + 1 }),
            $("<div>").append(
              $("<strong>", { text: validator.unescape(String(product.name || "Produit")) }),
              $("<small>", { text: `${product.quantity} unité${product.quantity === 1 ? "" : "s"}` }),
            ),
          ));
        });

      }).fail(() => $("#salesDashboardMessage").text("Impossible de charger le rapport des ventes."));
    }
    $("#salesRefresh").on("click", function () { loadSalesDashboard(); loadTransactions(); });
    $("#salesExportCsv").on("click", function () {
      const link = document.createElement("a");
      link.href = api + "sales/export";
      link.download = "ventes-7-jours.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

    let clientsPageNumber = 1;
    let clientsPageCount = 1;
    let clientsFilter = "all";
    let selectedClient = null;
    let clientsRequest;
    let clientsRenderToken = 0;
    function clientDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-MA", { timeZone: "Africa/Casablanca" });
    }
    function loadClientsPage(page = clientsPageNumber) {
      if (clientsRequest) clientsRequest.abort();
      const token = ++clientsRenderToken;
      clientsRequest = $.get(api + "customers/page", { page, pageSize: 10, q: $("#clientsSearch").val() || "", type: clientsFilter }, function (result) {
        if (token !== clientsRenderToken) return;
        clientsPageNumber = result.page;
        clientsPageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
        const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
        const last = first ? first + result.items.length - 1 : 0;
        $("#clientsPageInfo").text(`${first}–${last} sur ${result.total} clients`);
        $("#clientsPrevious").prop("disabled", result.page <= 1);
        $("#clientsNext").prop("disabled", result.page >= clientsPageCount);
        const rows = $("#clientsRows").empty();
        if (!result.items.length) rows.append($("<tr>").append($("<td>", { colspan: 4, class: "clients-empty", text: "Aucun client trouvé." })));
        result.items.forEach(client => {
          const row = $("<tr>", { tabindex: 0, class: String(selectedClient?._id) === String(client._id) ? "selected" : "" }).attr("data-client-id", String(client._id)).append(
            $("<td>", { text: validator.unescape(String(client.name || "—")) }),
            $("<td>", { text: client.phone || "—" }),
            $("<td>", { text: client.city || "—" }),
            $("<td>", { text: client.type === "professional" ? "Professionnel" : client.type === "individual" ? "Particulier" : "—" }),
          );
          row.on("click", () => openClientDetails(client)).on("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClientDetails(client); }
          });
          rows.append(row);
        });
        const selectedOnPage = result.items.find(client => String(client._id) === String(selectedClient?._id));
        if (!selectedOnPage && result.items.length) openClientDetails(result.items[0]);
        if (!result.items.length) {
          selectedClient = null;
          $("#clientDetails").empty().append($("<p>", { class: "clients-empty", text: "Sélectionnez un client pour voir ses achats." }));
        }
      }).fail((_, status) => {
        if (status !== "abort") $("#clientsRows").empty().append($("<tr>").append($("<td>", { colspan: 4, class: "clients-empty", text: "Impossible de charger les clients." })));
      });
    }
    function openClientDetails(client, page = 1) {
      selectedClient = client;
      $("#clientsRows tr").removeClass("selected").filter(function () { return this.dataset.clientId === String(client._id); }).addClass("selected");
      const panel = $("#clientDetails").empty().append(
        $("<h2>", { class: "client-detail-title", text: "Fiche client" }),
        $("<div>", { class: "client-detail-head" }).append(
          $("<div>").append($("<h2>", { text: validator.unescape(String(client.name || "Client")) }),
            $("<p>", { text: [client.phone, client.city].filter(Boolean).join(" · ") || "Coordonnées non renseignées" })),
        ),
        $("<p>", { class: "client-history-loading", text: "Chargement des achats…" }),
      );
      const showHistoryError = message => {
        const status = panel.find(".client-history-loading");
        if (status.length) status.text(message);
        else panel.append($("<p>", { class: "client-history-loading", text: message }));
      };
      $.ajax({ url: api + "sales/customer/" + client._id, data: { page, pageSize: 5 }, timeout: 12000 }).done(function (history) {
        if (!selectedClient || String(selectedClient._id) !== String(client._id)) return;
        try {
        if (!history || !Array.isArray(history.items) || !Array.isArray(history.topProducts)) throw new Error("Invalid customer history response");
        const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
        const money = value => `${moneyFormat(Number(value || 0).toFixed(2))} ${symbol}`;
        const heading = $("<div>", { class: "client-detail-head" }).append(
          $("<div>").append($("<h2>", { text: validator.unescape(String(client.name || "Client")) }),
            $("<p>", { text: [client.type === "professional" ? "Professionnel" : "Particulier", client.city].filter(Boolean).join(" · ") })),
          $("<button>", { type: "button", text: "Modifier" }).on("click", () => openCustomerEditor(client)),
        );
        const contact = $("<div>", { class: "client-detail-contact" }).append(
          $("<div>").append($("<span>", { text: "Téléphone" }), $("<strong>", { text: client.phone || "—" })),
          $("<div>").append($("<span>", { text: "Adresse" }), $("<strong>", { text: [client.address, client.city].filter(Boolean).join(", ") || "—" })),
          $("<div>").append($("<span>", { text: "Dernier achat" }), $("<strong>", { text: clientDate(history.lastPurchase) })),
        );
        const stats = $("<div>", { class: "client-detail-stats" }).append(
          $("<div>").append($("<span>", { text: "Achats payés" }), $("<strong>", { text: history.total })),
          $("<div>").append($("<span>", { text: "Montant total" }), $("<strong>", { text: money(history.spent) })),
          $("<div>").append($("<span>", { text: "Dernier achat" }), $("<strong>", { text: clientDate(history.lastPurchase) })),
        );
        const orders = $("<div>", { class: "client-detail-orders" }).append($("<h3>", { text: "Achats récents" }));
        if (!history.items.length) orders.append($("<p>", { class: "clients-empty", text: "Aucun achat payé pour ce client." }));
        history.items.forEach(order => orders.append($("<div>", { class: "client-order-row" }).append(
          $("<strong>", { text: order.order || order._id }),
          $("<span>", { text: clientDate(order.date) }),
          $("<span>", { text: `${order.itemCount} article${order.itemCount === 1 ? "" : "s"}` }),
          $("<strong>", { text: money(order.total) }),
        )));
        const top = $("<div>", { class: "client-detail-top" }).append($("<h3>", { text: "Produits fréquents" }));
        top.append($("<p>", { text: history.topProducts.length ? history.topProducts.map(product => `${validator.unescape(String(product.name))} (${product.quantity})`).join(" · ") : "Aucun produit à afficher." }));
        panel.empty().append($("<h2>", { class: "client-detail-title", text: "Fiche client" }), heading, contact, stats, orders, top);
        const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
        if (pages > 1) panel.append($("<div>", { class: "client-detail-pager" }).append(
          $("<button>", { type: "button", text: "Précédent", disabled: history.page <= 1 }).on("click", () => openClientDetails(client, history.page - 1)),
          $("<span>", { text: `${history.page} / ${pages}` }),
          $("<button>", { type: "button", text: "Suivant", disabled: history.page >= pages }).on("click", () => openClientDetails(client, history.page + 1)),
        ));
        } catch (error) {
          console.error("Could not render customer history:", error);
          showHistoryError("Historique des achats indisponible. Réessayez en sélectionnant ce client.");
        }
      }).fail(() => {
        if (selectedClient && String(selectedClient._id) === String(client._id)) {
          showHistoryError("Impossible de charger les achats de ce client. Réessayez en le sélectionnant.");
        }
      });
    }
    let clientsSearchTimer;
    $("#clientsSearch").on("input", function () {
      clearTimeout(clientsSearchTimer);
      clientsSearchTimer = setTimeout(() => loadClientsPage(1), 230);
    });
    $("#clientsAllFilter,#clientsProfessionalFilter").on("click", function () {
      clientsFilter = this.id === "clientsProfessionalFilter" ? "professional" : "all";
      $("#clientsAllFilter,#clientsProfessionalFilter").removeClass("active");
      $(this).addClass("active");
      loadClientsPage(1);
    });
    $("#clientsPrevious").on("click", () => loadClientsPage(clientsPageNumber - 1));
    $("#clientsNext").on("click", () => loadClientsPage(clientsPageNumber + 1));
    $("#clientsAddButton").on("click", function () {
      resetCustomerForm();
      $("#newCustomer").modal("show");
    });

    function fillSettingsPage() {
      if (!settings) return;
      const value = key => validator.unescape(String(settings[key] || ""));
      $("#settingsPageStore").val(value("store"));
      $("#settingsPageContact").val(value("contact"));
      $("#settingsPageCity").val(value("address_two"));
      $("#settingsPageAddress").val(value("address_one"));
      $("#settingsPageSymbol").val(value("symbol"));
      $("#settingsPageVat").val(value("percentage"));
      $("#settingsPageTax").val(value("tax"));
      $("#settingsPageFooter").val(value("footer"));
      $("#settingsPageChargeTax").prop("checked", Boolean(settings.charge_tax));
      $("#settingsPageQuickBilling").prop("checked", Boolean(settings.quick_billing));
      $("#settingsPageLogoName").text(settings.img ? `Logo actuel : ${settings.img}` : "Aucun logo enregistré");
      $("#settingsPageLogo").val("");
      $.get(api + "users/all", function (users) {
        $("#settingsUserCount").text(`${users.length} compte${users.length === 1 ? "" : "s"}`);
        const roles = $("#settingsUserRoles").empty();
        const admins = users.filter(account => Number(account.perm_settings) === 1).length;
        roles.append($("<span>", { text: `${admins} administrateur${admins === 1 ? "" : "s"}` }));
        roles.append($("<span>", { text: `${users.length - admins} autre${users.length - admins === 1 ? "" : "s"} compte${users.length - admins === 1 ? "" : "s"}` }));
      }).fail(() => $("#settingsUserCount").text("Comptes indisponibles"));
    }
    $("#settingsPageForm").on("submit", function (event) {
      event.preventDefault();
      if (!settings) return;
      const data = new FormData(this);
      data.append("id", "1");
      data.append("img", settings.img || "");
      data.append("remove", "0");
      data.append("app", validator.unescape(String(settings.app || (platform && platform.app) || "Standalone Point of Sale")));
      const button = $("#settingsPageSave").prop("disabled", true);
      $("#settingsPageMessage").text("Enregistrement…");
      $.ajax({
        url: api + "settings/post", type: "POST", data, processData: false, contentType: false,
        success: function () {
          $.get(api + "settings/get", function (result) {
            settings = result && result.settings;
            if (settings) {
              vat = Number(validator.unescape(String(settings.percentage || 0)));
              $("#appStoreName").text(validator.unescape(String(settings.store || "")));
              $("#price_curr,#payment_curr,#change_curr").text(validator.unescape(String(settings.symbol || "MAD")));
              $("#taxInfo").text(settings.charge_tax ? vat : 0);
              $(document).renderTable(cart);
              fillSettingsPage();
            }
            $("#settingsPageMessage").text("Paramètres enregistrés.");
          }).fail(() => $("#settingsPageMessage").text("Enregistré. Rechargez la page pour voir les nouvelles valeurs."));
        },
        error: response => $("#settingsPageMessage").text((response.responseJSON || {}).message || "Enregistrement impossible."),
        complete: () => button.prop("disabled", false),
      });
    });
    $("#settingsManageUsers").on("click", () => $("#usersModal").trigger("click"));
    $("#settingsBackup").on("click", () => ipcRenderer.send("settings-backup"));
    $("#settingsRestore").on("click", () => ipcRenderer.send("settings-restore"));
    $("#settingsImportCatalog").on("click", function () {
      $("#productModal").trigger("click");
      $("#catalogueImportDetails").prop("open", true);
      setTimeout(() => $("#catalogPackage").trigger("focus"), 350);
    });
    $("#settingsAdvanced").on("click", function () {
      $("#settings").trigger("click");
      applyPermissionVisibility();
      $("#settingsModal").modal("show");
    });

    function loadCategories() {
      return $.get(api + "categories/all", function (data) {
        allCategories = data;
        renderCategoriesPage();
        const catalogueCategory = $("#productListCategory").val() || "0";
        $("#category,#categories,#productListCategory").empty().append($("<option>", { value: "0", text: "Toutes les catégories" }));
        allCategories.forEach((category) => {
          $("#category,#categories,#productListCategory").append(
            $("<option>", { value: category._id, text: validator.unescape(String(category.name)) }),
          );
        });
        $("#category option[value='0']").text("Choisir une catégorie");
        $("#productListCategory").val(catalogueCategory);
        renderPosCategoryPills();
      });
    }

    const categoriesPageSize = 12;
    let categoriesPage = 1;
    function renderCategoriesPage() {
      const query = String($("#categoriesSearch").val() || "").trim().toLocaleLowerCase();
      const rows = $("#categoriesRows").empty();
      const matching = allCategories.map((category, index) => ({ category, index }))
        .filter(({ category }) => validator.unescape(String(category.name || "")).toLocaleLowerCase().includes(query));
      const pageCount = Math.max(1, Math.ceil(matching.length / categoriesPageSize));
      categoriesPage = Math.min(Math.max(1, categoriesPage), pageCount);
      const first = matching.length ? (categoriesPage - 1) * categoriesPageSize + 1 : 0;
      const last = Math.min(categoriesPage * categoriesPageSize, matching.length);
      $("#categoriesPageInfo").text(`${first}–${last} sur ${matching.length} catégories`);
      $("#categoriesPageNumber").text(`Page ${categoriesPage} / ${pageCount}`);
      $("#categoriesPrevious").prop("disabled", categoriesPage <= 1);
      $("#categoriesNext").prop("disabled", categoriesPage >= pageCount);
      const assigned = allCategories.reduce((sum, category) => sum + (categoryProductCounts[String(category._id)] || 0), 0);
      $("#categoriesTotal").text(allCategories.length);
      $("#categoriesUnassigned").text(Math.max(0, categoryProductTotal - assigned));
      $("#categoriesAssigned").text(assigned);
      if (!matching.length) rows.append($("<tr>").append($("<td>", {
        colspan: 3, class: "categories-empty", text: query ? "Aucune catégorie trouvée." : "Aucune catégorie enregistrée.",
      })));
      matching.slice(first ? first - 1 : 0, last).forEach(({ category, index }) => {
        const count = categoryProductCounts[String(category._id)] || 0;
        const actions = $("<div>", { class: "categories-row-actions" }).append(
          $("<button>", { type: "button", class: "categories-edit", title: "Modifier", "aria-label": `Modifier ${validator.unescape(String(category.name))}` })
            .append($("<i>", { class: "fa fa-pencil" }), " Modifier")
            .on("click", function () { $(this).editCategory(index); }),
          $("<button>", { type: "button", class: "categories-delete", title: count ? "Déplacez les produits avant de supprimer" : "Supprimer", "aria-label": `Supprimer ${validator.unescape(String(category.name))}`, disabled: count > 0 })
            .append($("<i>", { class: "fa fa-trash" }))
            .on("click", function () { $(this).deleteCategory(category._id); }),
        );
        rows.append($("<tr>").append(
          $("<td>").append($("<span>", { class: "categories-icon" }).append($("<i>", { class: "fa fa-tag" })), $("<strong>", { text: validator.unescape(String(category.name || "")) })),
          $("<td>", { text: `${count} produit${count === 1 ? "" : "s"}` }),
          $("<td>").append(actions),
        ));
      });
    }
    function openCategoriesPage() {
      $("#categoriesMessage").text("Chargement des catégories…");
      $.when(loadCategories(), $.get(api + "inventory/products/category-counts"))
        .done(function (_, countsResponse) {
          const result = countsResponse[0];
          categoryProductCounts = result.counts || {};
          categoryProductTotal = Number(result.total || 0);
          renderCategoriesPage();
          $("#categoriesMessage").text("");
        })
        .fail(() => $("#categoriesMessage").text("Impossible de charger les catégories ou leurs produits."));
    }
    $("#categoriesSearch").on("input", function () { categoriesPage = 1; renderCategoriesPage(); });
    $("#categoriesPrevious").on("click", function () { if (categoriesPage > 1) { categoriesPage--; renderCategoriesPage(); } });
    $("#categoriesNext").on("click", function () { categoriesPage++; renderCategoriesPage(); });
    $("#categoriesAddButton").on("click", function () {
      $("#saveCategory").get(0).reset();
      $("#category_id").val("");
      $("#categoryEditorError").text("");
      $("#newCategoryTitle").text("Nouvelle catégorie");
      $("#newCategory").modal("show");
    });
    $("#newCategoryModal").on("click", function () {
      $("#saveCategory").get(0).reset();
      $("#category_id").val("");
      $("#categoryEditorError").text("");
      $("#newCategoryTitle").text("Nouvelle catégorie");
    });
    $("#newCategory").on("hidden.bs.modal", function () {
      $("#saveCategory").get(0).reset();
      $("#category_id").val("");
      $("#categoryEditorError").text("");
    }).on("shown.bs.modal", function () {
      $("#categoryName").trigger("focus");
    });

    function loadCustomers() {
      $.get(api + "customers/all", function (customers) {
        $("#customer").html(
          `<option value="0" selected="selected">Walk in customer</option>`,
        );

        customers.forEach((cust) => {
          $("#customer").append(
            $("<option>", {
              value: JSON.stringify({
                id: cust._id,
                name: cust.name,
              }),
              text: cust.name,
            }),
          );
        });
      });
    }

    $.fn.addToCart = function (id, count, stock) {
      $.get(api + "inventory/product/" + id, function (product) {
        if (isExpired(product.expirationDate)) {
          notiflix.Report.failure(
            "Expired",
            `${product.name} is expired! Please restock.`,
            "Ok",
          );
        } else {
          if (count > 0 || stock != 1) {
            $(this).addProductToCart(product);
          } else {
            if (stock == 1) {
              notiflix.Report.failure(
                "Out of stock!",
                `${product.name} is out of stock! Please restock.`,
                "Ok",
              );
            }
          }
        }
      });
    };

    function barcodeSearch(e) {
      e.preventDefault();
      let searchBarCodeIcon = $(".search-barcode-btn").html();
      $(".search-barcode-btn").empty();
      $(".search-barcode-btn").append(
        $("<i>", { class: "fa fa-spinner fa-spin" }),
      );

      let req = {
        skuCode: $("#skuCode").val(),
      };

      $.ajax({
        url: api + "inventory/product/sku",
        type: "POST",
        data: JSON.stringify(req),
        contentType: "application/json; charset=utf-8",
        cache: false,
        processData: false,
        success: function (product) {
          $(".search-barcode-btn").html(searchBarCodeIcon);
          const expired = isExpired(product.expirationDate);
          if (product._id != undefined && (product.stock != 1 || Number(product.quantity) >= 1) && !expired) {
            $(this).addProductToCart(product);
            $("#searchBarCode").get(0).reset();
            $("#basic-addon2").empty();
            $("#basic-addon2").append(
              $("<i>", { class: "glyphicon glyphicon-ok" }),
            );
          } else if (expired) {
            notiflix.Report.failure(
              "Expired!",
              `${product.name} is expired`,
              "Ok",
            );
          } else if (product.stock == 1 && Number(product.quantity) < 1) {
            notiflix.Report.info(
              "Out of stock!",
              "This item is currently unavailable",
              "Ok",
            );
          } else {
            notiflix.Report.warning(
              "Not Found!",
              "<b>" + $("#skuCode").val() + "</b> is not a valid barcode!",
              "Ok",
            );

            $("#searchBarCode").get(0).reset();
            $("#basic-addon2").empty();
            $("#basic-addon2").append(
              $("<i>", { class: "glyphicon glyphicon-ok" }),
            );
          }
        },
        error: function (err) {
          if (err.status === 422) {
            $(this).showValidationError(err.responseJSON || err);
            $("#basic-addon2").append(
              $("<i>", { class: "glyphicon glyphicon-remove" }),
            );
          } else if (err.status === 404) {
            $("#basic-addon2").empty();
            $("#basic-addon2").append(
              $("<i>", { class: "glyphicon glyphicon-remove" }),
            );
          } else {
            $(this).showServerError();
            $("#basic-addon2").empty();
            $("#basic-addon2").append(
              $("<i>", { class: "glyphicon glyphicon-warning-sign" }),
            );
          }
        },
      });
    }

    $("#searchBarCode").on("submit", function (e) {
      barcodeSearch(e);
    });

    $("body").on("click", "#jq-keyboard button", function (e) {
      let pressed = $(this)[0].className.split(" ");
      if ($("#skuCode").val() != "" && pressed[2] == "enter") {
        barcodeSearch(e);
      }
    });

    $.fn.addProductToCart = function (data) {
      item = {
        id: data._id,
        product_name: data.name,
        sku: data.barcode || data._id,
        img: data.img || "",
        price: data.price,
        quantity: 1,
      };

      if ($(this).isExist(item)) {
        $(this).qtIncrement(index);
      } else {
        cart.push(item);
        $(this).renderTable(cart);
      }
    };

    $.fn.isExist = function (data) {
      let toReturn = false;
      $.each(cart, function (index, value) {
        if (value.id == data.id) {
          $(this).setIndex(index);
          toReturn = true;
        }
      });
      return toReturn;
    };

    $.fn.setIndex = function (value) {
      index = value;
    };

    $.fn.calculateCart = function () {
      let total = 0;
      let grossTotal;
      let total_items = 0;
      $.each(cart, function (index, data) {
        total += data.quantity * data.price;
        total_items += parseInt(data.quantity);
      });
      $("#total").text(total_items);
      const symbol = settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD";
      $("#price").text(moneyFormat(total.toFixed(2)) + " " + symbol);
      const requestedDiscount = Number($("#inputDiscount").val()) || 0;
      const discount = Math.min(Math.max(0, requestedDiscount), total);
      if (requestedDiscount !== discount) $("#inputDiscount").val(discount);
      subTotal = total - discount;

      if (settings && settings.charge_tax) {
        totalVat = (subTotal * vat) / 100;
        grossTotal = subTotal + totalVat;
      } else {
        totalVat = 0;
        grossTotal = subTotal;
      }

      orderTotal = grossTotal.toFixed(2);

      $("#gross_price").text(moneyFormat(orderTotal) + " " + symbol);
      $("#payablePrice").val(moneyFormat(grossTotal));
    };

    $.fn.renderTable = function (cartList) {
      const body = $("#cartTable .card-body").empty();
      $(this).calculateCart();
      if (!cartList.length) {
        body.append($("<div>", { class: "pos-cart-empty", text: "Ajoutez un produit pour commencer la vente." }));
      }
      $.each(cartList, function (index, data) {
        const imagePath = data.img && checkFileExists(path.join(img_path, data.img))
          ? path.join(img_path, data.img) : default_item_img;
        const quantity = $("<span>", { class: "pos-cart-quantity" }).append(
          $("<button>", { type: "button", "aria-label": "Decrease quantity", text: "−" }).on("click", () => $(this).qtDecrement(index)),
          $("<span>", { text: data.quantity }),
          $("<button>", { type: "button", "aria-label": "Increase quantity", text: "+" }).on("click", () => $(this).qtIncrement(index)),
        );
        const details = $("<div>", { class: "pos-cart-item-info" }).append(
          $("<div>", { class: "pos-cart-item-name", text: validator.unescape(String(data.product_name)) }),
          $("<div>", { class: "pos-cart-item-code", text: data.sku }),
          $("<div>", { class: "pos-cart-item-bottom" }).append(
            quantity,
            $("<strong>", { text: `${moneyFormat((data.price * data.quantity).toFixed(2))} ${settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD"}` }),
          ),
        );
        body.append($("<div>", { class: "pos-cart-item" }).append(
          $("<img>", { src: imagePath, alt: "" }), details,
          $("<button>", { type: "button", class: "pos-cart-remove", "aria-label": "Remove product", text: "×" }).on("click", () => $(this).deleteFromCart(index)),
        ));
      });
    };

    $.fn.deleteFromCart = function (index) {
      cart.splice(index, 1);
      $(this).renderTable(cart);
    };

    $.fn.qtIncrement = function (i) {
      const cartItem = cart[i];
      if (!cartItem) return;
      $.get(api + "inventory/product/" + cartItem.id, function (product) {
        if (!product) return;
        if (product.stock == 1 && Number(cartItem.quantity) >= Number(product.quantity)) {
          notiflix.Report.info("No more stock!", "You have already added all the available stock.", "Ok");
          return;
        }
        cartItem.quantity = Number(cartItem.quantity) + 1;
        $(this).renderTable(cart);
      });
    };

    $.fn.qtDecrement = function (i) {
      if (cart[i] && Number(cart[i].quantity) > 1) {
        cart[i].quantity = Number(cart[i].quantity) - 1;
        $(this).renderTable(cart);
      }
    };

    $.fn.qtInput = function (i) {
      item = cart[i];
      item.quantity = $(this).val();
      $(this).renderTable(cart);
    };

    $.fn.cancelOrder = function () {
      if (cart.length > 0) {
        const diagOptions = {
          title: "Are you sure?",
          text: "You are about to remove all items from the cart.",
          icon: "warning",
          showCancelButton: true,
          okButtonText: "Yes, clear it!",
          cancelButtonText: "Cancel",
          options: {
            // okButtonBackground: "#3085d6",
            cancelButtonBackground: "#d33",
          },
        };

        notiflix.Confirm.show(
          diagOptions.title,
          diagOptions.text,
          diagOptions.okButtonText,
          diagOptions.cancelButtonText,
          () => {
            cart = [];
            $(this).renderTable(cart);
            holdOrder = 0;
            notiflix.Report.success(
              "Cleared!",
              "All items have been removed.",
              "Ok",
            );
          },
          "",
          diagOptions.options,
        );
      }
    };

    $("#payButton").on("click", function () {
      if (cart.length != 0) {
        if (settings && settings.quick_billing) {
          const payableAmount = parsePaymentAmount($("#payablePrice").val()).toFixed(2);
          $("#payment").val(payableAmount);
          $("#paymentText").val(moneyFormat(payableAmount));
          $("#payment").trigger("input");
          $(this).submitDueOrder(1);
        } else {
          $("#paymentModel").modal("toggle");
        }
      } else {
        notiflix.Report.warning("Oops!", "There is nothing to pay!", "Ok");
      }
    });

    $("#hold").on("click", function () {
      if (cart.length != 0) {
        const selectedCustomer = JSON.parse($("#customer").val() || "0");
        $("#holdCustomerName").text(selectedCustomer && selectedCustomer.name ? selectedCustomer.name : "Client comptoir");
        $("#holdItemCount").text(`${cart.length} ${cart.length === 1 ? "produit" : "produits"}`);
        $("#holdTotalAmount").text(`${moneyFormat(Number(orderTotal).toFixed(2))} ${validator.unescape(settings.symbol)}`);
        $("#dueModal").modal("show");
      } else {
        notiflix.Report.warning("Oops!", "There is nothing to hold!", "Ok");
      }
    });

    $("#dueModal").on("shown.bs.modal", function () {
      $("#refNumber").trigger("focus");
    });
    $("#refNumber").on("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        $("#confirmHold").trigger("click");
      }
    });

    function printJobComplete() {
      notiflix.Report.success("Done", "print job complete", "Ok");
    }

    $.fn.submitDueOrder = function (status) {
      let terminal;
      try {
        terminal = saleTerminal(platform, settings);
      } catch (error) {
        notiflix.Report.failure("Configuration de la caisse", error.message, "OK");
        return;
      }
      let items = "";
      let payment = 0;
      paymentType = $('.list-group-item.active').data('payment-type');
      cart.forEach((item) => {
    items += `<tr><td>${DOMPurify.sanitize(item.product_name)}</td><td>${
      DOMPurify.sanitize(item.quantity)
    } </td><td class="text-right"> ${DOMPurify.sanitize(validator.unescape(settings.symbol))} ${moneyFormat(
      DOMPurify.sanitize(Math.abs(item.price).toFixed(2)),
    )} </td></tr>`;
});

      let currentTime = new Date(moment());
      let discount = $("#inputDiscount").val();
      let customer = JSON.parse($("#customer").val());
      let date = moment(currentTime).format("YYYY-MM-DD HH:mm:ss");
      let paymentAmount = $("#payment").val().replace(/,/g, "");
      let changeAmount = Number($("#change").data("raw") || 0);
      let paid =
        $("#payment").val() == "" ? "" : parseFloat(paymentAmount).toFixed(2);
      let change = paid === "" ? "" : changeAmount.toFixed(2);
      if (status === 0) {
        paid = "";
        change = "";
        paymentType = null;
      }
      let refNumber = $("#refNumber").val();
      let orderNumber = holdOrder;
      let type = "";
      let tax_row = "";
      switch (paymentType) {
        case 1:
          type = "Cash";
          break;
        case 3:
          type = "Card";
          break;
      }

      if (paid != "") {
        payment = `<tr>
                        <td>Paid</td>
                        <td>:</td>
                        <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                          Math.abs(paid).toFixed(2),
                        )}</td>
                    </tr>
                    <tr>
                        <td>Change</td>
                        <td>:</td>
                        <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                          Math.abs(change).toFixed(2),
                        )}</td>
                    </tr>
                    <tr>
                        <td>Method</td>
                        <td>:</td>
                        <td class="text-right">${type}</td>
                    </tr>`;
      }

      if (settings.charge_tax) {
        tax_row = `<tr>
                    <td>VAT(${validator.unescape(settings.percentage)})% </td>
                    <td>:</td>
                    <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                      parseFloat(totalVat).toFixed(2),
                    )}</td>
                </tr>`;
      }

      if (status == 0) {
        if ($("#customer").val() == 0 && $("#refNumber").val().trim() == "") {
          notiflix.Report.warning(
            "Référence requise",
            "Sélectionnez un client ou saisissez une référence pour retrouver cette vente.",
            "OK",
          );
          return;
        }
      }

      if (holdOrder != 0) {
        orderNumber = holdOrder;
        method = "PUT";
      } else {
        orderNumber = Math.floor(Date.now() / 1000);
        method = "POST";
      }

      logo = path.join(img_path, validator.unescape(settings.img));

      receipt = `<div style="font-size: 10px">                            
        <p style="text-align: center;">
        ${
          checkFileExists(logo)
            ? `<img style='max-width: 50px' src='${logo}' /><br>`
            : ``
        }
            <span style="font-size: 22px;">${validator.unescape(settings.store)}</span> <br>
            ${validator.unescape(settings.address_one)} <br>
            ${validator.unescape(settings.address_two)} <br>
            ${
              validator.unescape(settings.contact) != "" ? "Tel: " + validator.unescape(settings.contact) + "<br>" : ""
            } 
            ${validator.unescape(settings.tax) != "" ? "Vat No: " + validator.unescape(settings.tax) + "<br>" : ""} 
        </p>
        <hr>
        <left>
            <p>
            Order No : ${orderNumber} <br>
            Ref No : ${refNumber == "" ? orderNumber : _.escape(refNumber)} <br>
            Customer : ${
              customer == 0 ? "Walk in customer" : _.escape(customer.name)
            } <br>
            Cashier : ${user.fullname} <br>
            Date : ${date}<br>
            </p>

        </left>
        <hr>
        <table width="90%">
            <thead>
            <tr>
                <th>Item</th>
                <th>Qty</th>
                <th class="text-right">Price</th>
            </tr>
            </thead>
            <tbody>
             ${items}                
            <tr><td colspan="3"><hr></td></tr>
            <tr>                        
                <td><b>Subtotal</b></td>
                <td>:</td>
                <td class="text-right"><b>${validator.unescape(settings.symbol)}${moneyFormat(
                  subTotal.toFixed(2),
                )}</b></td>
            </tr>
            <tr>
                <td>Discount</td>
                <td>:</td>
                <td class="text-right">${
                  discount > 0
                    ? validator.unescape(settings.symbol) +
                      moneyFormat(parseFloat(discount).toFixed(2))
                    : ""
                }</td>
            </tr>
            ${tax_row}
            <tr>
                <td><h5>Total</h5></td>
                <td><h5>:</h5></td>
                <td class="text-right">
                    <h5>${validator.unescape(settings.symbol)} ${moneyFormat(
                      parseFloat(orderTotal).toFixed(2),
                    )}</h3>
                </td>
            </tr>
            ${payment == 0 ? "" : payment}
            </tbody>
            </table>
            <br>
            <hr>
            <br>
            <p style="text-align: center;">
             ${validator.unescape(settings.footer)}
             </p>
            </div>`;

      if (status == 3) {
        if (cart.length > 0) {
          printJS({ printable: receipt, type: "raw-html" });

          $(".loading").hide();
          return;
        } else {
          $(".loading").hide();
          return;
        }
      }

      let data = {
        order: orderNumber,
        ref_number: refNumber,
        discount: discount,
        customer: customer,
        status: status,
        subtotal: parseFloat(subTotal).toFixed(2),
        tax: totalVat,
        order_type: 1,
        items: cart,
        date: currentTime,
        payment_type: type,
        payment_info: status === 0 ? "" : $("#paymentInfo").val(),
        total: orderTotal,
        paid: paid,
        change: change,
        _id: orderNumber,
        till: terminal.till,
        mac: terminal.mac,
        user: user.fullname,
        user_id: user._id,
      };

      $(".loading").show();
      $.ajax({
        url: api + "new",
        type: method,
        data: JSON.stringify(data),
        contentType: "application/json; charset=utf-8",
        cache: false,
        processData: false,
        success: function (data) {
          cart = [];
          receipt = DOMPurify.sanitize(receipt,{ ALLOW_UNKNOWN_PROTOCOLS: true });
          $("#viewTransaction").html("");
          $("#viewTransaction").html(receipt);
          $("#orderModal").modal("show");
          loadProducts();
          loadCustomers();
          $(".loading").hide();
          $("#dueModal").modal("hide");
          $("#paymentModel").modal("hide");
          $("#refNumber").val("");
          if (!$("#pending_view").prop("hidden")) loadPendingPage(pendingPage);
          $(this).renderTable(cart);
        },

        error: function (data) {
          $(".loading").hide();
          notiflix.Report.failure(
            "Sale not completed",
            data.responseJSON?.message || "Please try again.",
            "Ok",
          );
        },
      });

      $("#refNumber").val("");
      $("#change").text("").removeData("raw");
      $("#payment,#paymentText").val("");
    };

    $.fn.orderDetails = function (index, orderType) {
      $("#refNumber").val("");

      const selectCustomerOption = (customerData) => {
        $("#customer option:selected").removeAttr("selected");

        if (customerData && customerData !== 0) {
          let selected = false;

          $("#customer option").each(function () {
            let optionValue = null;
            try {
              optionValue = JSON.parse($(this).val());
            } catch (e) {
              optionValue = null;
            }

            if (optionValue && optionValue.id == customerData.id) {
              $(this).prop("selected", true);
              selected = true;
              return false;
            }
          });

          if (!selected && customerData.name) {
            $("#customer option")
              .filter(function () {
                return $(this).text() == customerData.name;
              })
              .first()
              .prop("selected", true);

            selected = $("#customer option:selected").length > 0;
          }

          if (!selected) {
            $("#customer option")
              .filter(function () {
                return $(this).text() == "Walk in customer";
              })
              .prop("selected", true);
          }
        } else {
          $("#customer option")
            .filter(function () {
              return $(this).text() == "Walk in customer";
            })
            .prop("selected", true);
        }
      };

      if (orderType == 1) {
        $("#refNumber").val(holdOrderList[index].ref_number);
        selectCustomerOption(holdOrderList[index].customer);

        holdOrder = holdOrderList[index]._id;
        cart = [];
        $.each(holdOrderList[index].items, function (index, product) {
          item = {
            id: product.id,
            product_name: product.product_name,
            sku: product.sku,
            price: product.price,
            quantity: product.quantity,
          };
          cart.push(item);
        });
      } else if (orderType == 2) {
        $("#refNumber").val("");
        selectCustomerOption(customerOrderList[index].customer);

        holdOrder = customerOrderList[index]._id;
        cart = [];
        $.each(customerOrderList[index].items, function (index, product) {
          item = {
            id: product.id,
            product_name: product.product_name,
            sku: product.sku,
            price: product.price,
            quantity: product.quantity,
          };
          cart.push(item);
        });
      }
      $(this).renderTable(cart);
    };

    function getSelectedCustomerData() {
      const selected = $("#customer").val();
      if (!selected || selected == 0) {
        return null;
      }

      try {
        return JSON.parse(selected);
      } catch (e) {
        return null;
      }
    }

    function resetCustomerForm() {
      $("#saveCustomer").get(0).reset();
      $("#customer_id").val("");
      $("#customerEditorError").text("");
      $("#customerModalTitle").text("Nouveau client");
      $("#saveCustomerBtn").val("Enregistrer");
    }
    function openCustomerEditor(customer) {
      $("#customer_id").val(customer._id);
      $("#userName").val(customer.name || "");
      $("#phoneNumber").val(customer.phone || "");
      $("#emailAddress").val(customer.email || "");
      $("#userAddress").val(customer.address || "");
      $("#customerCity").val(customer.city || "");
      $(`input[name="customerType"][value="${customer.type === "professional" ? "professional" : "individual"}"]`).prop("checked", true);
      $("#customerEditorError").text("");
      $("#customerModalTitle").text("Modifier le client");
      $("#saveCustomerBtn").val("Enregistrer");
      $("#newCustomer").modal("show");
    }
    $("#newCustomerModal").on("click", resetCustomerForm);

    $("#editCustomerModal").on("click", function () {
      const selectedCustomer = getSelectedCustomerData();

      if (!selectedCustomer || !selectedCustomer.id) {
        notiflix.Report.warning(
          "Customer required",
          "Please select a customer to edit.",
          "Ok",
        );
        return;
      }

      $.get(api + "customers/customer/" + selectedCustomer.id, function (customer) {
        if (!customer) {
          notiflix.Report.warning(
            "Not found",
            "Could not load selected customer details.",
            "Ok",
          );
          return;
        }

        openCustomerEditor(customer);
      });
    });

    $("#saveCustomer").on("submit", function (e) {
      e.preventDefault();

      const customerId = $("#customer_id").val();
      let custData = {
        _id: customerId != "" ? parseInt(customerId) : Math.floor(Date.now() / 1000),
        name: $("#userName").val(),
        phone: $("#phoneNumber").val(),
        email: $("#emailAddress").val(),
        address: $("#userAddress").val(),
        city: $("#customerCity").val(),
        type: $('input[name="customerType"]:checked').val() || "individual",
      };

      const requestType = customerId != "" ? "PUT" : "POST";
      const successMessage = customerId != "" ? "Client modifié." : "Client ajouté.";

      $("#customerEditorError").text("");
      $("#saveCustomerBtn").prop("disabled", true);

      $.ajax({
        url: api + "customers/customer",
        type: requestType,
        data: JSON.stringify(custData),
        contentType: "application/json; charset=utf-8",
        cache: false,
        processData: false,
        success: function (data) {
          $("#newCustomer").modal("hide");
          notiflix.Report.success(
            "Enregistré",
            successMessage,
            "OK",
          );
          loadCustomers();
          loadClientsPage();
          if (selectedClient && String(selectedClient._id) === String(custData._id)) openClientDetails(custData);

          setTimeout(function () {
            $("#customer")
              .val(
                JSON.stringify({
                  id: custData._id,
                  name: custData.name,
                }),
              )
              .trigger("chosen:updated");
          }, 100);
        },
        error: function (response) {
          $("#customerEditorError").text(response.responseJSON?.message || "Impossible d’enregistrer le client. Réessayez.");
        },
        complete: function () { $("#saveCustomerBtn").prop("disabled", false); },
      });
    });

    $("#confirmPayment").hide();

    $("#cardInfo").hide();

    $("#paymentModel").on("show.bs.modal", function () {
      const symbol = settings && settings.symbol ? validator.unescape(String(settings.symbol)) : "MAD";
      $("#paymentOrderRef").text(holdOrder ? `#${holdOrder}` : "nouvelle");
      $("#paymentCustomerName").text($("#customer option:selected").text() || "Client comptoir");
      $("#paymentItemCount").text(`${cart.length} produit${cart.length === 1 ? "" : "s"}`);
      $("#paymentSubtotalDisplay").text($("#price").text() || `0,00 ${symbol}`);
      $("#paymentTotalDisplay").text($("#gross_price").text() || `0,00 ${symbol}`);
    });

    $("#payment").on("input", function () {
      $(this).calculateChange();
    });
    $("#confirmPayment").on("click", function () {
      const result = paymentChange($("#payablePrice").val(), $("#payment").val());
      const exactCard = $("#card").hasClass("active") && Math.round(parsePaymentAmount($("#payablePrice").val()) * 100) !== Math.round(parsePaymentAmount($("#payment").val()) * 100);
      if (!result.valid || exactCard) {
        notiflix.Report.warning(
          "Montant insuffisant",
          "Saisissez un montant valide couvrant le total de la vente.",
          "Ok",
        );
      } else {
        $(this).submitDueOrder(1);
      }
    });

    let activePage = "pos";
    const pageViews = {
      pos: "#pos_view", sales: "#transactions_view", stock: "#stock_view",
      receiving: "#receiving_view", clients: "#clients_view", settings: "#settings_view",
      categories: "#categories_view", suppliers: "#suppliers_view", users: "#users_view", orders: "#pending_view",
      catalogue: "#Products", product: "#productDetails", productEditor: "#newProduct",
    };
    function showAppPage(page) {
      activePage = page;
      document.body.classList.toggle("catalogue-open", page === "catalogue");
      $("#pos_view,#transactions_view").hide();
      $("#stock_view,#receiving_view,#clients_view,#settings_view,#categories_view,#suppliers_view,#users_view,#pending_view,#Products,#productDetails,#newProduct").prop("hidden", true);
      const view = $(pageViews[page]);
      if (page === "pos" || page === "sales") view.show();
      else view.prop("hidden", false);
      setActiveNavigation(navigation.get(0), (page === "product" || page === "productEditor") ? "catalogue" : page);
      $("#appSection").text(pageLabel((page === "product" || page === "productEditor") ? "catalogue" : page));
      $("#appCaisseShortcut").toggleClass("active", page === "pos").attr("aria-current", page === "pos" ? "page" : null);
      window.scrollTo(0, 0);
    }

    navigation.on("click", "#transactions", function () {
      showAppPage("sales");
      loadSalesDashboard();
      loadTransactions();
    });
    navigation.on("click", "#pointofsale", () => showAppPage("pos"));
    $("#appCaisseShortcut").on("click", () => showAppPage("pos"));
    navigation.on("click", "#stockPage", function () { showAppPage("stock"); loadStockPage(); });
    navigation.on("click", "#receivingPage", function () { showAppPage("receiving"); openReceivingPage(); });
    navigation.on("click", "#clientsPage", function () { showAppPage("clients"); loadClientsPage(1); });
    navigation.on("click", "#settings", function () { showAppPage("settings"); fillSettingsPage(); });
    navigation.on("click", "#categoryModal", function () { showAppPage("categories"); openCategoriesPage(); });
    navigation.on("click", "#usersModal", function () { showAppPage("users"); loadUserList(); });

    let pendingType = "all";
    let pendingPage = 1;
    let pendingPageCount = 1;
    let pendingItems = [];
    let selectedPendingId = null;
    let pendingRequestToken = 0;
    function pendingCustomerName(order) {
      const customer = order.customer;
      if (!customer || customer === "0") return "Client comptoir";
      if (typeof customer === "object") return validator.unescape(String(customer.name || "Client"));
      try { return validator.unescape(String(JSON.parse(customer).name || "Client")); }
      catch (_) { return validator.unescape(String(customer)); }
    }
    function pendingMoney(value) {
      const symbol = settings && settings.symbol ? validator.unescape(String(settings.symbol)) : "MAD";
      return `${moneyFormat(Number(value || 0).toFixed(2))} ${symbol}`;
    }
    function openPendingOrder(order, pay) {
      const isHold = Boolean(order.ref_number);
      const orders = isHold ? holdOrderList : customerOrderList;
      const index = orders.findIndex(candidate => String(candidate._id) === String(order._id));
      if (index < 0) return $("#pendingMessage").text("Cette commande a changé. Actualisez la liste.");
      $(document).orderDetails(index, isHold ? 1 : 2);
      $("#pointofsale").trigger("click");
      if (pay) $("#paymentModel").modal("show");
    }
    function renderPendingDetails(order) {
      const panel = $("#pendingDetails").empty();
      if (!order) {
        panel.append($("<strong>", { text: "Sélectionnez une commande" }), $("<p>", { text: "Ses produits et ses actions apparaîtront ici." }));
        return;
      }
      panel.append($("<span>", { class: "pending-detail-kind", text: order.ref_number ? "Vente en attente" : "Commande client" }));
      panel.append($("<h2>", { text: order.ref_number || `Commande #${order.order || order._id}` }));
      panel.append($("<p>", { text: `${pendingCustomerName(order)} · ${moment(order.date).isValid() ? moment(order.date).format("DD/MM/YYYY HH:mm") : "Date inconnue"}` }));
      const list = $("<div>", { class: "pending-detail-lines" });
      (Array.isArray(order.items) ? order.items : []).forEach(item => list.append($("<div>").append(
        $("<span>", { text: validator.unescape(String(item.product_name || "Produit")) }),
        $("<strong>", { text: `× ${item.quantity || 0}` }),
      )));
      panel.append(list, $("<div>", { class: "pending-detail-total" }).append($("<span>", { text: "Total" }), $("<strong>", { text: pendingMoney(order.total) })));
      panel.append($("<div>", { class: "pending-detail-actions" }).append(
        $("<button>", { type: "button", class: "pending-resume" }).append($("<i>", { class: "fa fa-shopping-cart" }), " Reprendre").on("click", () => openPendingOrder(order, false)),
        $("<button>", { type: "button", class: "pending-charge" }).append($("<i>", { class: "fa fa-money" }), " Encaisser").on("click", () => openPendingOrder(order, true)),
        $("<button>", { type: "button", class: "pending-delete" }).append($("<i>", { class: "fa fa-trash" }), " Supprimer").on("click", () => {
          notiflix.Confirm.show("Supprimer la commande ?", "Cette commande en attente sera supprimée.", "Supprimer", "Annuler", () => {
            $.ajax({ url: api + "delete", type: "POST", contentType: "application/json", data: JSON.stringify({ orderId: order._id }) })
              .done(() => { selectedPendingId = null; loadPendingPage(pendingPage); })
              .fail(() => $("#pendingMessage").text("Suppression impossible."));
          });
        }),
      ));
    }
    function loadPendingPage(page = pendingPage) {
      const token = ++pendingRequestToken;
      $("#pendingMessage").text("Chargement des commandes…");
      return $.get(api + "pending-orders/page", { page, pageSize: 25, type: pendingType, q: $("#pendingSearch").val() || "" }, function (result) {
        if (token !== pendingRequestToken) return;
        pendingPage = result.page;
        pendingPageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
        pendingItems = result.items;
        holdOrderList = pendingItems.filter(order => Boolean(order.ref_number));
        customerOrderList = pendingItems.filter(order => !order.ref_number);
        const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
        const last = first ? first + result.items.length - 1 : 0;
        $("#pendingPageInfo").text(`${first}–${last} sur ${result.total} commandes`);
        $("#pendingPrevious").prop("disabled", result.page <= 1);
        $("#pendingNext").prop("disabled", result.page >= pendingPageCount);
        const rows = $("#pendingRows").empty();
        if (!result.items.length) rows.append($("<tr>").append($("<td>", { colspan: 6, class: "pending-empty", text: "Aucune commande trouvée." })));
        result.items.forEach(order => rows.append($("<tr>", { class: String(order._id) === selectedPendingId ? "selected" : "" }).append(
          $("<td>").append($("<strong>", { text: order.ref_number || `#${order.order || order._id}` }), $("<small>", { text: order.ref_number ? "Vente en attente" : "Commande client" })),
          $("<td>", { text: pendingCustomerName(order) }),
          $("<td>", { text: moment(order.date).isValid() ? moment(order.date).format("DD/MM/YYYY HH:mm") : "—" }),
          $("<td>", { text: Array.isArray(order.items) ? order.items.length : 0 }),
          $("<td>", { class: "pending-amount", text: pendingMoney(order.total) }),
          $("<td>").append($("<button>", { type: "button", class: "pending-view", text: "Voir →" }).on("click", function () {
            selectedPendingId = String(order._id);
            rows.find("tr").removeClass("selected");
            $(this).closest("tr").addClass("selected");
            renderPendingDetails(order);
          })),
        )));
        renderPendingDetails(result.items.find(order => String(order._id) === selectedPendingId));
        $("#pendingMessage").text("");
      }).fail((_, status) => {
        if (status !== "abort" && token === pendingRequestToken) $("#pendingMessage").text("Impossible de charger les commandes.");
      });
    }
    let pendingSearchTimer;
    $("#pendingSearch").on("input", function () {
      clearTimeout(pendingSearchTimer);
      pendingSearchTimer = setTimeout(() => loadPendingPage(1), 250);
    });
    $(".pending-tabs button").on("click", function () {
      pendingType = $(this).data("type");
      selectedPendingId = null;
      $(".pending-tabs button").removeClass("active");
      $(this).addClass("active");
      loadPendingPage(1);
    });
    $("#pendingPrevious").on("click", () => loadPendingPage(pendingPage - 1));
    $("#pendingNext").on("click", () => loadPendingPage(pendingPage + 1));
    $("#pendingRefresh").on("click", () => loadPendingPage(pendingPage));
    function showPendingPage(type) {
      showAppPage("orders");
      pendingType = type;
      selectedPendingId = null;
      $(".pending-tabs button").removeClass("active").filter(`[data-type="${type}"]`).addClass("active");
      loadPendingPage(1);
    }
    navigation.on("click", "#viewCustomerOrders", () => showPendingPage("all"));

    let allSuppliers = [];
    let suppliersPageNumber = 1;
    let selectedSupplierName = "";
    let supplierEditorTarget = "";
    const supplierKey = value => String(value || "").trim().toLocaleLowerCase();

    function renderSupplierDetails(supplier) {
      const panel = $("#supplierDetails").empty().append($("<h2>", { text: "Fiche fournisseur" }));
      if (!supplier) {
        panel.append($("<p>", { text: "Sélectionnez un fournisseur pour consulter ses coordonnées." }));
        return;
      }
      panel.append($("<div>", { class: "supplier-details-name", text: supplier.name }));
      const facts = $("<dl>");
      for (const [label, value] of [
        ["Téléphone", supplier.phone], ["E-mail", supplier.email], ["Adresse", supplier.address],
      ]) {
        facts.append($("<div>").append($("<dt>", { text: label }), $("<dd>", { text: value || "—" })));
      }
      panel.append(facts);
      const summary = $("<div>", { class: "supplier-details-note" }).append(
        $("<strong>", { text: `${supplier.productCount || 0} produit(s) · ${supplier.receiptCount || 0} réception(s)` }),
        $("<p>", { text: "Le nom reste fixe quand des produits ou des réceptions l'utilisent." }),
      );
      if (supplier.note) summary.append($("<p>", { text: supplier.note }));
      panel.append(summary, $("<button>", { type: "button", class: "supplier-details-edit", text: "Modifier la fiche" })
        .on("click", () => openSupplierEditor(supplier, "directory")));
    }

    function renderSuppliers() {
      const query = supplierKey($("#suppliersSearch").val());
      const matching = allSuppliers.filter(supplier =>
        [supplier.name, supplier.phone, supplier.email].some(value => supplierKey(value).includes(query)));
      const pageSize = 12;
      const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
      suppliersPageNumber = Math.min(Math.max(1, suppliersPageNumber), pageCount);
      const visible = matching.slice((suppliersPageNumber - 1) * pageSize, suppliersPageNumber * pageSize);
      if (!visible.some(supplier => supplierKey(supplier.name) === selectedSupplierName)) {
        selectedSupplierName = visible.length ? supplierKey(visible[0].name) : "";
      }
      const rows = $("#suppliersRows").empty();
      for (const supplier of visible) {
        const selected = supplierKey(supplier.name) === selectedSupplierName;
        const actions = $("<div>", { class: "suppliers-row-actions" }).append(
          $("<button>", { type: "button", text: "Modifier" }).on("click", event => {
            event.stopPropagation();
            openSupplierEditor(supplier, "directory");
          }),
          $("<button>", {
            type: "button", title: "Supprimer", "aria-label": `Supprimer ${supplier.name}`,
            disabled: !supplier._id || supplier.productCount > 0 || supplier.receiptCount > 0,
          }).append($("<i>", { class: "fa fa-trash" })).on("click", event => {
            event.stopPropagation();
            deleteSupplier(supplier);
          }),
        );
        const row = $("<tr>", { tabindex: 0, class: selected ? "selected" : "" }).append(
          $("<td>").append($("<strong>", { text: supplier.name })),
          $("<td>", { text: supplier.phone || "—" }),
          $("<td>", { text: `${supplier.productCount || 0} produit(s)` }),
          $("<td>").append(actions),
        );
        row.on("click keydown", event => {
          if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
          selectedSupplierName = supplierKey(supplier.name);
          renderSuppliers();
        });
        rows.append(row);
      }
      if (!visible.length) rows.append($("<tr>").append($("<td>", {
        colspan: 4, text: "Aucun fournisseur trouvé.",
      })));
      $("#suppliersPageInfo").text(matching.length
        ? `${(suppliersPageNumber - 1) * pageSize + 1}–${Math.min(suppliersPageNumber * pageSize, matching.length)} sur ${matching.length} fournisseurs`
        : "0 fournisseur");
      $("#suppliersPrevious").prop("disabled", suppliersPageNumber <= 1);
      $("#suppliersNext").prop("disabled", suppliersPageNumber >= pageCount);
      renderSupplierDetails(matching.find(supplier => supplierKey(supplier.name) === selectedSupplierName));
    }

    function loadSuppliers() {
      return $.get(api + "suppliers/all").done(function (suppliers) {
        allSuppliers = suppliers;
        const options = $("#supplierSuggestions").empty();
        suppliers.forEach(supplier => options.append($("<option>", { value: supplier.name })));
        $("#suppliersMessage").text("");
        renderSuppliers();
      }).fail(() => $("#suppliersMessage").text("Impossible de charger les fournisseurs."));
    }

    function openSupplierEditor(supplier, target) {
      supplierEditorTarget = target;
      $("#supplierEditorForm").get(0).reset();
      $("#supplierEditorError").text("");
      $("#supplierEditorId").val(supplier?._id || "");
      for (const field of ["Name", "Phone", "Email", "Address", "Note"]) {
        $("#supplierEditor" + field).val(supplier?.[field.toLowerCase()] || "");
      }
      $("#supplierEditorName").prop("readOnly", Boolean(supplier?.productCount || supplier?.receiptCount));
      $("#supplierEditorTitle").text(supplier?._id ? "Modifier le fournisseur" : "Nouveau fournisseur");
      $("#supplierEditor").modal("show");
    }

    function deleteSupplier(supplier) {
      notiflix.Confirm.show("Supprimer le fournisseur", `Supprimer ${supplier.name} du répertoire ?`,
        "Supprimer", "Annuler", () => {
          $.ajax({ url: api + "suppliers/supplier/" + supplier._id, type: "DELETE" })
            .done(() => {
              selectedSupplierName = "";
              loadSuppliers();
              notiflix.Notify.success("Fournisseur supprimé.");
            })
            .fail(response => notiflix.Report.failure("Suppression impossible",
              response.responseJSON?.error || "Réessayez.", "OK"));
        });
    }

    navigation.on("click", "#suppliersPage", function () { showAppPage("suppliers"); loadSuppliers(); });
    $("#suppliersAddButton").on("click", () => openSupplierEditor(null, "directory"));
    $("#suppliersSearch").on("input", function () { suppliersPageNumber = 1; renderSuppliers(); });
    $("#suppliersPrevious").on("click", function () { suppliersPageNumber--; renderSuppliers(); });
    $("#suppliersNext").on("click", function () { suppliersPageNumber++; renderSuppliers(); });
    $("#productSupplierFocus,#receivingAddSupplier").on("click", function () {
      const target = this.id === "productSupplierFocus" ? "product" : "receiving";
      const name = $(target === "product" ? "#supplier" : "#receivingSupplier").val().trim();
      openSupplierEditor(allSuppliers.find(item => supplierKey(item.name) === supplierKey(name)) || (name ? { name } : null), target);
    });
    $("#supplierEditorForm").on("submit", function (event) {
      event.preventDefault();
      const id = $("#supplierEditorId").val();
      const values = {};
      for (const field of ["Name", "Phone", "Email", "Address", "Note"]) {
        values[field.toLowerCase()] = $("#supplierEditor" + field).val().trim();
      }
      const button = $("#supplierEditorSave").prop("disabled", true);
      $.ajax({
        url: api + "suppliers/supplier" + (id ? "/" + encodeURIComponent(id) : ""),
        type: id ? "PUT" : "POST", contentType: "application/json", data: JSON.stringify(values),
      }).done(function () {
        if (supplierEditorTarget === "product") $("#supplier").val(values.name);
        if (supplierEditorTarget === "receiving") $("#receivingSupplier").val(values.name);
        selectedSupplierName = supplierKey(values.name);
        $("#supplierEditor").modal("hide");
        loadSuppliers();
        notiflix.Notify.success("Fournisseur enregistré.");
      }).fail(response => $("#supplierEditorError").text(response.responseJSON?.error || "Enregistrement impossible. Réessayez."))
        .always(() => button.prop("disabled", false));
    });
    loadSuppliers();

    let productPreviewUrl = null;

    function resetProductEditor() {
      $("#saveProduct").get(0).reset();
      $("#product_id,#img,#remove_img").val("");
      $("#quantity").val(100);
      $("#minStock").val(5);
      $("#current_img").empty().show();
      $("#productImagePreview").prop("hidden", true).removeAttr("src");
      $("#rmv_img").prop("hidden", true);
      $("#imagename").val("");
      if (productPreviewUrl) URL.revokeObjectURL(productPreviewUrl);
      productPreviewUrl = null;
      $("#newProductTitle").text("Ajouter un produit");
      $("#productEditorBack span").text("Catalogue / Nouveau produit");
      $("#productDraftBadge").text("Brouillon");
      $("#createAndContinue").prop("hidden", false);
      $("#category").val("0");
      $("#category").get(0).setCustomValidity("");
      $("#productStockPreview").text("100");
      $("#productStockNote").prop("hidden", false);
    }

    function openNewProductEditor() {
      resetProductEditor();
      showAppPage("productEditor");
      $("#productName").trigger("focus");
    }

    $("#newProductModal,#catalogueAddProduct").on("click", openNewProductEditor);
    $("#productEditorBack,#productEditorCancel").on("click", () => showAppPage("catalogue"));
    $("#quantity").on("input", function () { $("#productStockPreview").text($(this).val() || "0"); });
    $("#stock").on("change", function () { $("#productStockNote").prop("hidden", this.checked); });
    $("#category").on("change", function () { this.setCustomValidity(""); });
    $("#productChooseImage").on("click", () => $("#imagename").trigger("click"));
    $("#imagename").on("change", function () {
      if (productPreviewUrl) URL.revokeObjectURL(productPreviewUrl);
      productPreviewUrl = this.files && this.files[0] ? URL.createObjectURL(this.files[0]) : null;
      $("#productImagePreview").attr("src", productPreviewUrl || "").prop("hidden", !productPreviewUrl);
      if (productPreviewUrl) {
        $("#current_img").empty();
        $("#remove_img").val("");
      }
      $("#rmv_img").prop("hidden", !productPreviewUrl && !$("#img").val());
    });
    $("#productPhotoDrop").on("dragenter dragover", function (event) {
      event.preventDefault();
      $(this).addClass("dragging");
    }).on("dragleave drop", function (event) {
      event.preventDefault();
      $(this).removeClass("dragging");
      if (event.type === "drop" && event.originalEvent.dataTransfer.files.length) {
        const file = event.originalEvent.dataTransfer.files[0];
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        $("#imagename").get(0).files = transfer.files;
        $("#imagename").trigger("change");
      }
    });
    $("#saveProduct").submit(function (e) {
      e.preventDefault();
      if ($("#category").val() === "0") {
        const category = $("#category").get(0);
        category.setCustomValidity("Choisir une catégorie.");
        category.reportValidity();
        return;
      }
      const isEdit = Boolean($("#product_id").val());
      const keepEditing = !isEdit && e.originalEvent?.submitter?.id === "createAndContinue";
      const buttons = $("#submitProduct,#createAndContinue").prop("disabled", true);
      $(this).attr("action", api + "inventory/product");
      $(this).attr("method", "POST");
      $(this).ajaxSubmit({
        contentType: "application/json",
        success: function () {
          loadProducts();
          loadProductList();
          loadSuppliers();
          notiflix.Notify.success(isEdit ? "Produit modifié." : "Produit enregistré.");
          if (keepEditing) {
            resetProductEditor();
            $("#productName").trigger("focus");
          } else {
            showAppPage("catalogue");
          }
        },
        error: function (jqXHR) {
          const details = jqXHR.responseJSON || {};
          notiflix.Report.failure("Enregistrement impossible", details.message || details.error || "Réessayez.", "Ok");
        },
        complete: function () { buttons.prop("disabled", false); },
      });
    });
    $("#importCatalogForm").submit(function (e) {
      e.preventDefault();
      const button = $("#importCatalogButton");
      const status = $("#importCatalogStatus");
      button.prop("disabled", true);
      status.text("Importing catalogue and images...");
      $.ajax({
        url: api + "inventory/import-package",
        type: "POST",
        data: new FormData(this),
        processData: false,
        contentType: false,
        success: function (result) {
          status.text(`Imported ${result.added} products; skipped ${result.skipped} already imported.`);
          loadCategories().then(() => {
            loadProducts(1);
            loadProductList(1);
          });
        },
        error: function (response) {
          const details = response.responseJSON || {};
          status.text(`Import failed: ${details.error || response.statusText}`);
        },
        complete: function () {
          button.prop("disabled", false);
        },
      });
    });

    $("#saveCategory").submit(function (e) {
      e.preventDefault();
      const name = $("#categoryName").val().trim();
      if (!name) {
        $("#categoryEditorError").text("Saisissez un nom de catégorie.");
        $("#categoryName").trigger("focus");
        return;
      }
      $("#categoryName").val(name);
      $("#categoryEditorError").text("");
      const categoryMethod = $("#category_id").val() ? "PUT" : "POST";
      const button = $("#submitCategory").prop("disabled", true);
      $.ajax({
        type: categoryMethod,
        url: api + "categories/category",
        data: $(this).serialize(),
        success: function () {
          $("#saveCategory").get(0).reset();
          $("#category_id").val("");
          $("#newCategory").modal("hide");
          loadCategories();
          loadProducts();
          $("#categoriesMessage").text("Catégorie enregistrée.");
        },
        error: (response) => $("#categoryEditorError").text(response.responseJSON?.message || "Enregistrement de la catégorie impossible. Réessayez."),
        complete: () => button.prop("disabled", false),
      });
    });

    $.fn.editProduct = function (index) {
      resetProductEditor();
      const product = listedProducts[index];
      $("#category").val(product.category || "0");
      $("#productName").val(product.name);
      $("#product_price").val(product.price);
      $("#quantity").val(product.quantity);
      $("#productStockPreview").text(product.quantity ?? 0);
      $("#supplier").val(product.supplier || "");
      $("#barcode").val(product.barcode || product._id);
      $("#expirationDate").val(product.expirationDate);
      $("#minStock").val(product.minStock || 1);
      $("#product_id").val(product._id);
      $("#img").val(product.img || "");
      $("#stock").prop("checked", product.stock == 0).trigger("change");
      if (product.img) {
        $("#current_img").html($("<img>", { src: img_path + product.img, alt: product.name }));
        $("#rmv_img").prop("hidden", false);
      }
      $("#newProductTitle").text("Modifier le produit");
      $("#productEditorBack span").text("Catalogue / Modifier le produit");
      $("#productDraftBadge").text("Modification");
      $("#createAndContinue").prop("hidden", true);
      showAppPage("productEditor");
    };
    $("#userModal").on("hide.bs.modal", function () {
      $(".perms").hide();
      ownUserEdit = false;
      $("#userEditorMessage").text("");
    });

    $.fn.editUser = function (index) {
      user_index = index;
      ownUserEdit = String(allUsers[index]._id) === String(user._id);


      $(".perms").show();
      $("#saveUser").get(0).reset();
      $("#user_id").val(allUsers[index]._id);
      $("#fullname").val(validator.unescape(String(allUsers[index].fullname || "")));
      $("#username").val(validator.unescape(String(allUsers[index].username || "")));
      $("#password").prop("required", false).attr("placeholder", "Laisser vide pour conserver le mot de passe");
      $("#userPasswordHint").text("(facultatif)");
      $("#userEditorTitle").text("Modifier le compte");
    

      for (perm of permissions) {
        var el = "#" + perm;
        if (allUsers[index][perm] == 1) {
          $(el).prop("checked", true);
        } else {
          $(el).prop("checked", false);
        }
      }

      $("#userModal").modal("show");
    };

    $.fn.editCategory = function (index) {
      $("#categoryName").val(validator.unescape(String(allCategories[index].name)));
      $("#category_id").val(allCategories[index]._id);
      $("#categoryEditorError").text("");
      $("#newCategoryTitle").text("Modifier la catégorie");
      $("#newCategory").modal("show");
    };

    $.fn.deleteProduct = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this product.",
        okButtonText: "Yes, delete it!",
        cancelButtonText: "Cancel",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "inventory/product/" + id,
            type: "DELETE",
            success: function (result) {
              selectedBarcodeProducts.delete(String(id));
              updateBarcodeSelection();
              loadProducts();
              loadProductList();
              notiflix.Report.success("Done!", "Product deleted", "Ok");
            },
          });
        },
      );
    };

    $.fn.deleteUser = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this user.",
        cancelButtonColor: "#d33",
        okButtonText: "Yes, delete!",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "users/user/" + id,
            type: "DELETE",
            success: function (result) {
              loadUserList();
              notiflix.Report.success("Done!", "User deleted", "Ok");
            },
          });
        },
      );
    };

    $.fn.deleteCategory = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this category.",
        okButtonText: "Yes, delete it!",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "categories/category/" + id,
            type: "DELETE",
            success: function (result) {
              loadCategories();
              notiflix.Report.success("Done!", "Category deleted", "Ok");
            },
          });
        },
      );
    };

    navigation.on("click", "#productModal", function () {
      showAppPage("catalogue");
      loadProductList();
    });

    function loadUserList() {
      return $.get(api + "users/all", function (users) {
        allUsers = users;
        renderUsersPage();
        $("#usersMessage").text("");
      }).fail(() => $("#usersMessage").text("Impossible de charger les utilisateurs."));
    }

    function renderUsersPage() {
      const query = String($("#usersSearch").val() || "").trim().toLocaleLowerCase();
      const rows = $("#usersRows").empty();
      const admins = allUsers.filter(account => Number(account.perm_settings) === 1).length;
      const online = allUsers.filter(account => String(account.status || "").startsWith("Logged In_")).length;
      $("#usersTotal").text(allUsers.length);
      $("#usersAdmins").text(admins);
      $("#usersOnline").text(online);
      const matching = allUsers.map((account, index) => ({ account, index })).filter(({ account }) =>
        `${validator.unescape(String(account.fullname || ""))} ${validator.unescape(String(account.username || ""))}`.toLocaleLowerCase().includes(query));
      if (!matching.length) rows.append($("<tr>").append($("<td>", { colspan: 5, class: "users-empty", text: query ? "Aucun compte trouvé." : "Aucun compte enregistré." })));
      matching.forEach(({ account, index }) => {
        const isAdmin = Number(account.perm_settings) === 1;
        const isOnline = String(account.status || "").startsWith("Logged In_");
        const isProtected = Number(account._id) === 1 || String(account._id) === String(user._id);
        const actions = $("<div>", { class: "users-row-actions" }).append(
          $("<button>", { type: "button", "aria-label": `Modifier ${validator.unescape(String(account.fullname || account.username))}` })
            .append($("<i>", { class: "fa fa-pencil" }), " Modifier")
            .on("click", function () { $(this).editUser(index); }),
          $("<button>", { type: "button", class: "users-delete", title: isProtected ? "Compte protégé" : "Supprimer", "aria-label": `Supprimer ${validator.unescape(String(account.fullname || account.username))}`, disabled: isProtected })
            .append($("<i>", { class: "fa fa-trash" }))
            .on("click", function () { $(this).deleteUser(account._id); }),
        );
        rows.append($("<tr>").append(
          $("<td>").append($("<span>", { class: "users-avatar", text: validator.unescape(String(account.fullname || account.username || "U")).charAt(0).toLocaleUpperCase() }), $("<strong>", { text: validator.unescape(String(account.fullname || "—")) })),
          $("<td>", { text: validator.unescape(String(account.username || "—")) }),
          $("<td>").append($("<span>", { class: isAdmin ? "users-role admin" : "users-role", text: isAdmin ? "Administrateur" : "Équipe" })),
          $("<td>").append($("<span>", { class: isOnline ? "users-status online" : "users-status", text: isOnline ? "Session ouverte" : "Déconnecté" })),
          $("<td>").append(actions),
        ));
      });
    }
    $("#usersSearch").on("input", renderUsersPage);
    $("#usersAddButton").on("click", openNewUserEditor);

    function updateBarcodeSelection() {
      const total = selectedBarcodeProducts.size;
      $("#productListSelectionCount").text(`${total} sélectionné${total === 1 ? "" : "s"}`);
      $("#exportSelectedBarcodes").prop("disabled", total === 0);
      const selectedOnPage = listedProducts.filter(product => selectedBarcodeProducts.has(String(product._id))).length;
      const pageCheckbox = $("#productListSelectPage");
      pageCheckbox.prop("checked", listedProducts.length > 0 && selectedOnPage === listedProducts.length);
      pageCheckbox.prop("indeterminate", selectedOnPage > 0 && selectedOnPage < listedProducts.length);
    }

    $("#product_list").on("change", ".product-select", function () {
      const product = listedProducts.find(item => String(item._id) === String(this.value));
      if (!product) return;
      if (this.checked) selectedBarcodeProducts.set(String(product._id), product);
      else selectedBarcodeProducts.delete(String(product._id));
      updateBarcodeSelection();
    });

    $("#productListSelectPage").on("change", function () {
      listedProducts.forEach(product => {
        if (this.checked) selectedBarcodeProducts.set(String(product._id), product);
        else selectedBarcodeProducts.delete(String(product._id));
      });
      $("#product_list .product-select").prop("checked", this.checked);
      updateBarcodeSelection();
    });

    $("#productListClearSelection").on("click", function () {
      selectedBarcodeProducts.clear();
      $("#product_list .product-select").prop("checked", false);
      updateBarcodeSelection();
    });

    $("#exportSelectedBarcodes").on("click", async function () {
      $(this).prop("disabled", true);
      try {
        const products = Array.from(selectedBarcodeProducts.values()).map(product => ({
          ...product,
          name: validator.unescape(String(product.name || "")),
          barcode: validator.unescape(String(product.barcode || "")),
        }));
        const { data } = createBarcodeSheet(products, { jsPDFClass: jsPDF.jsPDF || jsPDF, JsBarcode, document });
        const { canceled, filePath } = await remote.dialog.showSaveDialog(remote.getCurrentWindow(), {
          title: "Exporter les codes-barres PDF",
          defaultPath: path.join(app.getPath("downloads"), "codes-barres-produits.pdf"),
          buttonLabel: "Enregistrer",
          filters: [{ name: "Document PDF", extensions: ["pdf"] }],
        });
        if (canceled || !filePath) return;
        await fs.promises.writeFile(filePath, Buffer.from(data));
        notiflix.Report.success("Codes-barres exportés", `PDF enregistré : ${$("<div>").text(filePath).html()}`, "OK");
      } catch (error) {
        console.error("Barcode PDF export failed:", error);
        notiflix.Report.failure("Export impossible", error.message || "Impossible d'exporter les codes-barres.", "OK");
      } finally {
        updateBarcodeSelection();
      }
    });

    let detailProductId = null;
    $("#product_list").on("click", ".product-fiche-button", function () {
      const product = listedProducts.find(item => String(item._id) === String(this.dataset.productId));
      if (!product) return;
      detailProductId = String(product._id);
      const category = allCategories.find(item => String(item._id) === String(product.category));
      const imagePath = product.img && checkFileExists(img_path + product.img)
        ? img_path + product.img : default_item_img;
      $("#productDetailsName").text(validator.unescape(String(product.name || "")));
      $("#productDetailsPhotoName").text(validator.unescape(String(product.name || "")));
      $("#productDetailsSubtitle").text(validator.unescape(String(product.description || product.reference || "")));
      $("#productDetailsCategory,#productDetailsCategoryFact").text(category ? validator.unescape(String(category.name)) : "Sans catégorie");
      $("#productDetailsSupplier").text(product.supplier ? validator.unescape(String(product.supplier)) : "Fournisseur non renseigné");
      $("#productDetailsReference").text(validator.unescape(String(product.reference || product.barcode || product._id)));
      $("#productDetailsImage").attr("src", imagePath);
      $("#productDetailsPrice").text(`${moneyFormat(Number(product.price || 0).toFixed(2))} ${settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD"}`);
      $("#productDetailsPriceBasis").prop("hidden", product.priceBasis !== "sample");
      $("#productDetailsStock").text(product.stock == 1 ? `${product.quantity} unités` : "Non suivi");
      $("#productDetailsStockSummary").text(product.stock == 1 ? `${product.quantity} unités disponibles` : "Stock non suivi");
      $("#productDetailsMinimum").text(product.minStock || "-");
      $("#productDetailsStockMinimum").text(product.minStock || "-");
      $("#productDetailsExpiry").text(product.expirationDate || "-");
      try {
        const code = barcodeValue({ ...product, barcode: validator.unescape(String(product.barcode || "")) });
        $("#productDetailsCode").text(code);
        $("#productDetailsBarcode").empty();
        JsBarcode(document.getElementById("productDetailsBarcode"), code, {
          format: "CODE128", displayValue: false, width: 2, height: 70, margin: 2,
        });
      } catch (error) {
        $("#productDetailsBarcode").empty();
        $("#productDetailsCode").text("Code-barres indisponible");
      }
      showAppPage("product");
    });

    $("#productDetailsBack").on("click", () => showAppPage("catalogue"));
    $("#productDetailsEdit").on("click", function () {
      const index = listedProducts.findIndex(product => String(product._id) === detailProductId);
      if (index >= 0) $(this).editProduct(index);
      else $("#productDetailsBack").trigger("click");
    });

    function loadProductList(page = listPage) {
      if (loadProductList.request) loadProductList.request.abort();
      const tableHeight = $(".catalogue-table-wrap").innerHeight();
      if (tableHeight > 100) listPageSize = Math.max(5, Math.min(20, Math.floor((tableHeight - 44) / 48)));
      const pageSize = listPageSize;
      loadProductList.request = $.get(api + "inventory/products/page", {
        page,
        pageSize,
        q: $("#productListSearch").val() || "",
        category: $("#productListCategory").val() || "0",
      }, function (result) {
      const products = result.items;
      listedProducts = products;
      listPage = result.page;
      listTotal = result.total;
      const pageCount = Math.max(1, Math.ceil(listTotal / pageSize));
      const first = listTotal ? (listPage - 1) * pageSize + 1 : 0;
      const last = first ? first + products.length - 1 : 0;
      $("#productListPageInfo").text(`${first}–${last} sur ${listTotal} produits · page ${listPage} / ${pageCount}`);
      $("#productListPrevious").prop("disabled", listPage <= 1);
      $("#productListNext").prop("disabled", listPage >= pageCount);
      updateBarcodeSelection();
      let product_list = "";
      $("#product_list").empty();

      products.forEach((product, index) => {

        let category = allCategories.filter(function (category) {
          return category._id == product.category;
        });

        product.stockAlert = "";
        const todayDate = moment();
        const expiryDate = moment(product.expirationDate, DATE_FORMAT);

        //show stock status indicator
        const stockStatus = getStockStatus(product.quantity,product.minStock);
          if(stockStatus<=0)
          {
          if (stockStatus === 0) {
            product.stockStatus = "No Stock";
            icon = "fa fa-exclamation-triangle";
          }
          if (stockStatus === -1) {
            product.stockStatus = "Low Stock";
            icon = "fa fa-caret-down";
          }

          product.stockAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.stockStatus}</small></p>`;
        }
        //calculate days to expiry
        product.expiryAlert = "";
        if (!isExpired(expiryDate)) {
          const diffDays = daysToExpire(expiryDate);

          if (diffDays > 0 && diffDays <= 30) {
            var days_noun = diffDays > 1 ? "days" : "day";
            icon = "fa fa-clock-o";
            product.expiryStatus = `${diffDays} ${days_noun} left`;
            product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
          }
        } else {
          icon = "fa fa-exclamation-triangle";
          product.expiryStatus = "Expired";
          product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
        }

        if(product.img==="")
        {
          product_img=default_item_img;
        }
        else
        {
          product_img = img_path + product.img;
          product_img = checkFileExists(product_img)
          ? product_img
          : default_item_img;
        }
        
        // Render the compact catalogue row shown in the shared Figma layout.
        const safeName = $("<div>").text(validator.unescape(String(product.name || ""))).html();
        const safeCategory = category.length > 0 ? $("<div>").text(validator.unescape(String(category[0].name))).html() : "Sans catégorie";
        const safeCode = $("<div>").text(validator.unescape(String(product.barcode || product._id))).html();
        const safeReference = $("<div>").text(validator.unescape(String(product.reference || product.supplier || ""))).html();
        const checked = selectedBarcodeProducts.has(String(product._id)) ? "checked" : "";
        const samplePriceLabel = product.priceBasis === "sample" ? '<small class="sample-price-label">Prix d’exemple</small>' : "";
        product_list +=
          `<tr>
            <td><input type="checkbox" class="product-select" value="${product._id}" aria-label="Sélectionner ${safeName}" ${checked}></td>
            <td><div class="catalogue-product-cell"><img src="${product_img}" alt=""><span><strong>${safeName}</strong><small>${safeReference}</small></span></div></td>
            <td>${safeCategory}</td>
            <td>${safeCode}</td>
            <td>${moneyFormat(Number(product.price || 0).toFixed(2))} ${settings && settings.symbol ? validator.unescape(settings.symbol) : "MAD"}${samplePriceLabel}</td>
            <td class="catalogue-stock-cell">${product.stock == 1 ? product.quantity : "Non suivi"}${product.stockAlert}</td>
            <td class="nobr"><span class="btn-group"><button type="button" class="btn btn-default btn-sm product-fiche-button" data-product-id="${product._id}">Fiche</button><button type="button" onClick="$(this).editProduct(${index})" class="btn btn-warning btn-sm" aria-label="Modifier ${safeName}"><i class="fa fa-edit"></i></button><button type="button" onClick="$(this).deleteProduct(${product._id})" class="btn btn-danger btn-sm" aria-label="Supprimer ${safeName}"><i class="fa fa-trash"></i></button></span></td></tr>`;

      });
      $("#product_list").html(product_list);
      });
      return loadProductList.request;
    }

    let listSearchTimer;
    $("#productListSearch").on("input", function () {
      clearTimeout(listSearchTimer);
      listSearchTimer = setTimeout(() => loadProductList(1), 250);
    });
    $("#productListCategory").on("change", () => loadProductList(1));
    $("#catalogueImportDetails").on("toggle", () => {
      if (activePage === "catalogue") loadProductList(1);
    });
    let catalogueResizeTimer;
    $(window).on("resize", function () {
      if (activePage !== "catalogue") return;
      clearTimeout(catalogueResizeTimer);
      catalogueResizeTimer = setTimeout(() => {
        const tableHeight = $(".catalogue-table-wrap").innerHeight();
        const nextSize = Math.max(5, Math.min(20, Math.floor((tableHeight - 44) / 48)));
        if (tableHeight > 100 && nextSize !== listPageSize) loadProductList(1);
      }, 180);
    });
    $("#productListPrevious").on("click", () => loadProductList(listPage - 1));
    $("#productListNext").on("click", () => loadProductList(listPage + 1));

    $("#log-out").on("click", function () {
      const diagOptions = {
        title: "Are you sure?",
        text: "You are about to log out.",
        cancelButtonColor: "#3085d6",
        okButtonText: "Logout",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.get(api + "users/logout/" + user._id, function (data) {
            storage.delete("auth");
            storage.delete("user");
            ipcRenderer.send("app-reload", "");
          });
        },
      );
    });

    $("#settings_form").on("submit", function (event) {
      event.preventDefault();
      const data = new FormData(this);
      const appChoice = $("#app").val();
      const percentage = Number(data.get("percentage"));
      const error = $("#storeSettingsError").text("");
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        error.text("Saisissez un taux de TVA entre 0 et 100.");
        return;
      }
      data.set("app", appChoice);
      const button = $("#saveStoreSettings").prop("disabled", true);
      macaddress.one((macError, mac) => {
        $.ajax({
          url: api + "settings/post", type: "POST", data,
          processData: false, contentType: false,
          success: function () {
            storage.set("settings", { app: appChoice, mac: macError ? "" : (mac || ""), till: 1, port });
            ipcRenderer.send("app-reload", "");
          },
          error: response => error.text(response.responseJSON?.message || "Enregistrement impossible. Réessayez."),
          complete: () => button.prop("disabled", false),
        });
      });
    });

    $("#net_settings_form").on("submit", function (event) {
      event.preventDefault();
      const ip = $("#ip").val().trim();
      const till = Number($("#till").val());
      const error = $("#networkSettingsError").text("");
      if (!ip) return error.text("Saisissez l’adresse IP du serveur.");
      if (!Number.isSafeInteger(till) || till < 2) return error.text("Le numéro de caisse doit être un entier supérieur à 1.");
      storage.set("settings", { app: $("#app").val(), ip, till, mac: $("#mac").val(), port });
      ipcRenderer.send("app-reload", "");
    });

    function updateAdvancedMode() {
      const terminal = $("#app").val() === "Network Point of Sale Terminal";
      $("#settingsModal").toggleClass("network-mode", terminal);
      $("#net_settings_form").toggle(terminal);
      $("#settings_form").toggle(!terminal);
      $("#settingsModalTitle").text(terminal ? "Configuration réseau" : settings ? "Configuration avancée" : "Configurer la boutique");
      $("#settingsModalSubtitle").text(terminal
        ? "Choisissez le mode de fonctionnement de cette caisse."
        : settings ? "Modifiez les paramètres de la boutique." : "Renseignez les informations nécessaires à votre première vente.");
    }
    $("#app").on("change", function () {
      updateAdvancedMode();
      if (this.value === "Network Point of Sale Terminal") {
        macaddress.one((error, mac) => { if (!error) $("#mac").val(mac); });
      }
    });
    $("#settingsModal").on("show.bs.modal", updateAdvancedMode);

    $("#saveUser").on("submit", function (e) {
      e.preventDefault();
      let formData = $(this).serializeObject();
      const message = $("#userEditorMessage").text("");
      if (formData.password !== formData.pass) return message.text("Les mots de passe ne correspondent pas.");
      if (!formData.id && !formData.password) return message.text("Saisissez un mot de passe pour le nouveau compte.");
      permissions.forEach(perm => { formData[perm] = $("#" + perm).prop("checked") ? 1 : 0; });
      const button = $("#saveUserButton").prop("disabled", true);
      $.ajax({
        url: api + "users/post",
        type: "POST",
        data: JSON.stringify(formData),
        contentType: "application/json; charset=utf-8",
        success: function () {
          if (ownUserEdit) {
            ipcRenderer.send("app-reload", "");
          } else {
            $("#userModal").modal("hide");
            loadUserList().done(() => $("#usersMessage").text("Compte enregistré."));
          }
        },
        error: jqXHR => message.text((jqXHR.responseJSON || {}).message || "Enregistrement impossible."),
        complete: () => button.prop("disabled", false),
      });
    });

    $("#cashier").on("click", function () {
      ownUserEdit = true;
      $(".perms").hide();
      $("#saveUser").get(0).reset();
      $("#userModal").modal("show");

      $("#user_id").val(user._id);
      $("#fullname").val(validator.unescape(String(user.fullname || "")));
      $("#username").val(validator.unescape(String(user.username || "")));
      $("#password").prop("required", false).attr("placeholder", "Laisser vide pour conserver le mot de passe");
      $("#userPasswordHint").text("(facultatif)");
      $("#userEditorTitle").text("Mon compte");

      for (perm of permissions) {
        var el = "#" + perm;
        if (user[perm] == 1) {
          $(el).prop("checked", true);
        } else {
          $(el).prop("checked", false);
        }
      }
    });

    function openNewUserEditor() {
      ownUserEdit = false;
      if (!platform || platform.app != "Network Point of Sale Terminal") {
        $(".perms").show();
      }

      $("#saveUser").get(0).reset();
      $("#user_id").val("");
      $("#password").prop("required", true).attr("placeholder", "Mot de passe");
      $("#userPasswordHint").text("*");
      $("#userEditorTitle").text("Nouveau compte");
      $("#userModal").modal("show");
    }

    navigation.on("click", "#settings", function () {
      $("#app").val((platform && platform.app) || (settings && validator.unescape(String(settings.app))) || "Standalone Point of Sale");
      $("#networkSettingsError,#storeSettingsError").text("");
      if (platform) {
        $("#ip").val(platform.ip || "");
        $("#till").val(platform.till || 2);
        if (platform.port) port = platform.port;
      }
      macaddress.one((error, mac) => { if (!error) $("#mac").val(mac); });
      if (settings) {
        $("#settings_id").val("1");
        for (const field of ["store", "address_one", "address_two", "contact", "tax", "symbol", "percentage", "footer"]) {
          $("#" + field).val(validator.unescape(String(settings[field] || "")));
        }
        $("#logo_img").val(validator.unescape(String(settings.img || "")));
        $("#charge_tax").prop("checked", Boolean(settings.charge_tax));
        $("#quick_billing").prop("checked", Boolean(settings.quick_billing));
        const hasLogo = Boolean(settings.img);
        $("#logoname").toggle(!hasLogo);
        $("#rmv_logo").toggle(hasLogo);
        $("#current_logo").empty();
        if (hasLogo) $("#current_logo").append($("<img>", { src: path.join(img_path, validator.unescape(String(settings.img))), alt: "Logo actuel" }));
      }
      updateAdvancedMode();
    });
 });

  $("#rmv_logo").on("click", function () {
    $("#remove_logo").val("1");
    // $("#logo_img").val('');
    $("#current_logo").hide(500);
    $(this).hide(500);
    $("#logoname").show(500);
  });

  $("#rmv_img").on("click", function () {
    $("#remove_img").val($("#img").val() ? "1" : "");
    $("#imagename").val("");
    $("#current_img").empty();
    $("#productImagePreview").prop("hidden", true).removeAttr("src");
    $(this).prop("hidden", true);
  });
}

$.fn.print = function () {
  printJS({ printable: receipt, type: "raw-html" });
};

function loadTransactions() {
  let tills = [];
  let users = [];
  let transaction_list = "";
  let query = `by-date?start=${start_date}&end=${end_date}&user=${by_user}&status=${by_status}&till=${by_till}`;
  const symbol = validator.unescape(String(settings && settings.symbol || "MAD"));
  const safeText = value => $("<div>").text(validator.unescape(String(value ?? ""))).html();
  const amount = value => `${safeText(moneyFormat(Number(value || 0).toFixed(2)))} ${safeText(symbol)}`;

  $.get(api + query, function (transactions) {
    if ($.fn.DataTable.isDataTable("#transactionList")) $("#transactionList").DataTable().destroy();
    $("#transaction_list").empty();
    allTransactions = [...transactions];
    if (transactions.length > 0) {
      transactions.forEach((trans, index) => {
        if (!tills.includes(trans.till)) {
          tills.push(trans.till);
        }

        if (!users.includes(trans.user_id)) {
          users.push(trans.user_id);
        }

        transaction_list += `<tr>
                                <td>${safeText(trans.order)}</td>
                                <td class="nobr">${moment(trans.date).format(
                                  "DD/MM/YYYY HH:mm",
                                )}</td>
                                <td>${amount(trans.total)}</td>
                                <td>${
                                  trans.paid == ""
                                    ? ""
                                    : amount(trans.paid)
                                }</td>
                                <td>${
                                  trans.change
                                    ? amount(Math.abs(trans.change))
                                    : ""
                                }</td>
                                <td>${
                                  trans.paid == ""
                                    ? ""
                                    : safeText(String(trans.payment_type).toLowerCase() === "cash" ? "Espèces" : trans.payment_type)
                                }</td>
                                <td>${safeText(trans.till)}</td>
                                <td>${safeText(trans.user)}</td>
                                <td>${
                                  trans.paid == ""
                                    ? '<button type="button" class="sales-view-button" disabled title="Vente en attente" aria-label="Détails indisponibles pour cette vente"><i class="fa fa-search-plus" aria-hidden="true"></i></button>'
                                    : '<button onClick="$(this).viewTransaction(' +
                                      index +
                                      ')" type="button" class="sales-view-button" title="Voir la vente" aria-label="Voir la vente"><i class="fa fa-search-plus" aria-hidden="true"></i></button></td>'
                                }</tr>
                    `;

      });
    }
    if (by_user == 0 && by_till == 0 && transactions.length) {
      userFilter(users);
      tillFilter(tills);
    }
    if (!$("#users option").length) userFilter([]);
    if (!$("#tills option").length) tillFilter([]);
    $("#transaction_list").html(transaction_list);
    $("#transactionList").DataTable({
      order: [[1, "desc"]],
      autoWidth: false,
      info: true,
      ordering: true,
      paging: true,
      pageLength: 10,
      scrollX: true,
      dom: '<"sales-history-tools"Bf>rt<"sales-history-footer"ip>',
      buttons: [
        { extend: "csv", text: '<i class="fa fa-file-text-o" aria-hidden="true"></i> CSV', className: "sales-export-button", exportOptions: { columns: [0, 1, 2, 3, 4, 5, 6, 7] } },
        { extend: "pdf", text: '<i class="fa fa-file-pdf-o" aria-hidden="true"></i> PDF', className: "sales-export-button", exportOptions: { columns: [0, 1, 2, 3, 4, 5, 6, 7] } },
      ],
      language: {
        emptyTable: "Aucune vente pour ces filtres.",
        search: "",
        searchPlaceholder: "Rechercher une vente",
        info: "Affichage de _START_ à _END_ sur _TOTAL_ ventes",
        infoEmpty: "Aucune vente",
        infoFiltered: "(filtrées parmi _MAX_ ventes)",
        zeroRecords: "Aucune vente ne correspond à cette recherche.",
        lengthMenu: "Afficher _MENU_ ventes",
        paginate: { previous: "Précédent", next: "Suivant" },
      },
    });
    $("#transactionList_filter input").attr("aria-label", "Rechercher une vente");
  }).fail(() => $("#salesDashboardMessage").text("Impossible de charger l'historique des ventes."));
}

function userFilter(users) {
  $("#users").empty();
  $("#users").append($("<option>", { value: "0", text: "Tous" }));

  users.forEach((userId) => {
    const account = allUsers.find(account => String(account._id) === String(userId));
    $("#users").append($("<option>", { value: userId, text: account ? validator.unescape(String(account.fullname)) : `#${userId}` }));
  });
}

function tillFilter(tills) {
  $("#tills").empty();
  $("#tills").append($("<option>", { value: "0", text: "Toutes" }));
  tills.forEach((till) => {
    $("#tills").append($("<option>", { value: till, text: till }));
  });
}

$.fn.viewTransaction = function (index) {
  transaction_index = index;

  let discount = allTransactions[index].discount;
  let customer =
    allTransactions[index].customer == 0
      ? "Walk in Customer"
      : allTransactions[index].customer.username;
  let refNumber =
    allTransactions[index].ref_number != ""
      ? allTransactions[index].ref_number
      : allTransactions[index].order;
  let orderNumber = allTransactions[index].order;
  let paymentMethod = "";
  let tax_row = "";
  let items = "";
  let products = allTransactions[index].items;

  products.forEach((item) => {
    items += `<tr><td>${item.product_name}</td><td>${
      item.quantity
    } </td><td class="text-right"> ${validator.unescape(settings.symbol)} ${moneyFormat(
      Math.abs(item.price).toFixed(2),
    )} </td></tr>`;
  });

  paymentMethod = allTransactions[index].payment_type;
 

  if (allTransactions[index].paid != "") {
    payment = `<tr>
                    <td>Paid</td>
                    <td>:</td>
                    <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                      Math.abs(allTransactions[index].paid).toFixed(2),
                    )}</td>
                </tr>
                <tr>
                    <td>Change</td>
                    <td>:</td>
                    <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                      Math.abs(allTransactions[index].change).toFixed(2),
                    )}</td>
                </tr>
                <tr>
                    <td>Method</td>
                    <td>:</td>
                    <td class="text-right">${paymentMethod}</td>
                </tr>`;
  }

  if (settings.charge_tax) {
    tax_row = `<tr>
                <td>Vat(${validator.unescape(settings.percentage)})% </td>
                <td>:</td>
                <td class="text-right">${validator.unescape(settings.symbol)}${parseFloat(
                  allTransactions[index].tax,
                ).toFixed(2)}</td>
            </tr>`;
  }

    logo = path.join(img_path, validator.unescape(settings.img));
      
      receipt = `<div style="font-size: 10px">                            
        <p style="text-align: center;">
        ${
          checkFileExists(logo)
            ? `<img style='max-width: 50px' src='${logo}' /><br>`
            : ``
        }
            <span style="font-size: 22px;">${validator.unescape(settings.store)}</span> <br>
            ${validator.unescape(settings.address_one)} <br>
            ${validator.unescape(settings.address_two)} <br>
            ${
              validator.unescape(settings.contact) != "" ? "Tel: " + validator.unescape(settings.contact) + "<br>" : ""
            } 
            ${validator.unescape(settings.tax) != "" ? "Vat No: " + validator.unescape(settings.tax) + "<br>" : ""} 
    </p>
    <hr>
    <left>
        <p>
        Invoice : ${orderNumber} <br>
        Ref No : ${refNumber} <br>
        Customer : ${
          allTransactions[index].customer == 0
            ? "Walk in Customer"
            : allTransactions[index].customer.name
        } <br>
        Cashier : ${allTransactions[index].user} <br>
        Date : ${moment(allTransactions[index].date).format(
          "DD MMM YYYY HH:mm:ss",
        )}<br>
        </p>

    </left>
    <hr>
    <table width="90%">
        <thead>
        <tr>
            <th>Item</th>
            <th>Qty</th>
            <th class="text-right">Price</th>
        </tr>
        </thead>
        <tbody>
        ${items}                
        <tr><td colspan="3"><hr></td></tr>
        <tr>                        
            <td><b>Subtotal</b></td>
            <td>:</td>
            <td class="text-right"><b>${validator.unescape(settings.symbol)}${moneyFormat(
              allTransactions[index].subtotal,
            )}</b></td>
        </tr>
        <tr>
            <td>Discount</td>
            <td>:</td>
            <td class="text-right">${
              discount > 0
                ? validator.unescape(settings.symbol) +
                  moneyFormat(
                    parseFloat(allTransactions[index].discount).toFixed(2),
                  )
                : ""
            }</td>
        </tr>
        
        ${tax_row}
    
        <tr>
            <td><h5>Total</h5></td>
            <td><h5>:</h5></td>
            <td class="text-right">
                <h5>${validator.unescape(settings.symbol)}${moneyFormat(
                  allTransactions[index].total,
                )}</h5>
            </td>
        </tr>
        ${payment == 0 ? "" : payment}
        </tbody>
        </table>
        <br>
        <hr>
        <br>
        <p style="text-align: center;">
         ${validator.unescape(settings.footer)}
         </p>
        </div>`;

        //prevent DOM XSS; allow windows paths in img src
        receipt = DOMPurify.sanitize(receipt,{ ALLOW_UNKNOWN_PROTOCOLS: true });

  $("#viewTransaction").html("");
  $("#viewTransaction").html(receipt);

  $("#orderModal").modal("show");
};

$("#status").on("change", function () {
  by_status = $(this).find("option:selected").val();
  loadTransactions();
});

$("#tills").on("change", function () {
  by_till = $(this).find("option:selected").val();
  loadTransactions();
});

$("#users").on("change", function () {
  by_user = $(this).find("option:selected").val();
  loadTransactions();
});

$("#reportrange").on("apply.daterangepicker", function (ev, picker) {
  start = picker.startDate.format("DD MMM YYYY hh:mm A");
  end = picker.endDate.format("DD MMM YYYY hh:mm A");

  start_date = picker.startDate.toDate().toJSON();
  end_date = picker.endDate.toDate().toJSON();

  loadTransactions();
});

$("#reportrange").on("keydown", function (event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $(this).trigger("click");
  }
});

function authenticate() {
  $(".loading").hide();
  $("body").attr("class", "login-page");
  $("#login").css("display", "flex");
}

$("body").on("submit", "#account", function (e) {
  e.preventDefault();
  let formData = $(this).serializeObject();
  const loginMessage = $("#loginMessage");
  const loginButton = $("#account .login-submit");
  loginMessage.text("");

  if (formData.username == "" || formData.password == "") {
    loginMessage.text("Saisissez votre identifiant et votre mot de passe.");
  } else {
    loginButton.prop("disabled", true).text("Connexion en cours…");
    $.ajax({
      url: api + "users/login",
      type: "POST",
      data: JSON.stringify(formData),
      contentType: "application/json; charset=utf-8",
      cache: false,
      processData: false,
      success: function (data) {
        if (data.auth === true) {
          storage.set("auth", { auth: true });
          storage.set("user", data);
          ipcRenderer.send("app-reload", "");
          $("#login").hide();
        } else {
          loginMessage.text("Identifiant ou mot de passe incorrect.");
        }
      },
      error: function (data) {
        console.log(data);
        loginMessage.text("Connexion impossible. Vérifiez que le serveur est démarré.");
      },
      complete: function () {
        loginButton.prop("disabled", false).text("Se connecter");
      },
    });
  }
});

$("#quit").on("click", function () {
  const diagOptions = {
    title: "Are you sure?",
    text: "You are about to close the application.",
    icon: "warning",
    okButtonText: "Close Application",
    cancelButtonText: "Cancel"
  };

  notiflix.Confirm.show(
    diagOptions.title,
    diagOptions.text,
    diagOptions.okButtonText,
    diagOptions.cancelButtonText,
    () => {
      ipcRenderer.send("app-quit", "");
    },
  );
});

ipcRenderer.on("click-element", (event, elementId) => {
  document.getElementById(elementId).click();
});
