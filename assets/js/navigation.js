const sections = [
  { title: "Vente", items: [
    { key: "pos", id: "pointofsale", label: "Caisse", icon: "shopping-cart" },
    { key: "sales", id: "transactions", label: "Ventes", icon: "credit-card", permission: "perm_transactions" },
    { key: "orders", id: "viewCustomerOrders", label: "Commandes", icon: "shopping-basket" },
    { key: "clients", id: "clientsPage", label: "Clients", icon: "address-book" },
  ] },
  { title: "Catalogue & stock", items: [
    { key: "catalogue", id: "productModal", label: "Catalogue", icon: "th-large", permission: "perm_products" },
    { key: "stock", id: "stockPage", label: "Stock", icon: "cubes", permission: "perm_products" },
    { key: "receiving", id: "receivingPage", label: "Achats", icon: "truck", permission: "perm_products" },
    { key: "categories", id: "categoryModal", label: "Catégories", icon: "tags", permission: "perm_categories" },
  ] },
  { title: "Administration", items: [
    { key: "users", id: "usersModal", label: "Utilisateurs", icon: "users", permission: "perm_users" },
    { key: "settings", id: "settings", label: "Paramètres", icon: "cog", permission: "perm_settings" },
  ] },
];

function allowed(item, user) {
  return !item.permission || Number(user && user[item.permission]) !== 0;
}

function pageLabel(page) {
  return sections.flatMap(section => section.items).find(item => item.key === page)?.label || "Caisse";
}

function renderNavigation(host, user) {
  host.replaceChildren();
  for (const section of sections) {
    const items = section.items.filter(item => allowed(item, user));
    if (!items.length) continue;
    const group = document.createElement("div");
    group.className = "app-navigation-group";
    const heading = document.createElement("div");
    heading.className = "app-navigation-heading";
    heading.textContent = section.title;
    group.appendChild(heading);
    for (const item of items) {
      const button = document.createElement("button");
      button.id = item.id;
      button.type = "button";
      button.dataset.page = item.key;
      if (item.modal) {
        button.dataset.toggle = "modal";
        button.dataset.target = item.modal;
      }
      const icon = document.createElement("i");
      icon.className = `fa fa-${item.icon}`;
      icon.setAttribute("aria-hidden", "true");
      button.append(icon, document.createTextNode(item.label));
      group.appendChild(button);
    }
    host.appendChild(group);
  }
}

function setActiveNavigation(host, page) {
  for (const button of host.querySelectorAll("button[data-page]")) {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

module.exports = { sections, allowed, pageLabel, renderNavigation, setActiveNavigation };
