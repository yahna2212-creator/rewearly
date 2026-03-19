const ADMIN_EMAIL = "yahna2212@gmail.com";
const STORAGE_BUCKET = "products";
const BUFFER_DAYS = 3;
const LOCK_MINUTES = 30;
const CART_STORAGE_KEY = "rewearly_cart_v1";

const state = {
  supabase: null,
  currentUser: null,
  profile: null,
  authMode: "login",
  products: [],
  filteredProducts: [],
  bookings: [],
  bookingsByProduct: new Map(),
  cart: [],
  sellerProducts: [],
  sellerEarnings: [],
  sellerOrderItems: [],
  adminProducts: [],
  adminOrders: [],
  adminEarnings: [],
  selectedProduct: null,
  configErrorShown: false
};

const dom = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  bindEvents();
  restoreCart();
  renderAuthMode();
  renderUserState();
  renderCart();
  renderSellerDashboard();
  renderAdminDashboard();
  setupSupabase();
  await bootstrap();
}

function cacheDom() {
  const ids = [
    "authBtn", "logoutBtn", "catalogBtn", "sellerDashboardBtn", "adminBtn", "cartBtn", "cartCount",
    "heroBrowseBtn", "heroUploadBtn", "refreshBtn", "clearFiltersBtn", "reloadAdminBtn",
    "searchInput", "categoryFilter", "priceFilter", "availabilityStart", "availabilityEnd",
    "productsGrid", "catalogSummary", "catalogEmpty", "metricProducts",
    "sellerStats", "sellerProductsTable", "adminStats", "ordersTable", "adminProductsTable",
    "cartDrawer", "closeCartBtn", "cartItems", "cartTotal", "checkoutBtn",
    "authModal", "authForm", "authSubmitBtn", "authName", "authEmail", "authPassword", "authPhone", "authAddress", "authHelperText",
    "uploadModal", "uploadForm", "uploadTitle", "uploadCategory", "uploadDescription", "uploadPrice",
    "uploadCondition", "uploadOwnership", "uploadRoyaltyPercent", "uploadImages", "openUploadBtn",
    "rentalModal", "rentalForm", "rentalModalTitle", "rentalImage", "rentalProductTitle", "rentalProductMeta",
    "rentalStartDate", "rentalEndDate", "availabilityPanel", "rentalDays", "rentalRate", "rentalLineTotal",
    "productEditModal", "productEditForm", "editProductId", "editTitle", "editCategory", "editDescription",
    "editFinalPrice", "editSellerPayout", "editRoyaltyPercent", "editOwnershipType", "editCondition",
    "editApproved", "editActive", "editDamageState", "editImages", "toastStack", "adminDashboardSection"
  ];
  ids.forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

function bindEvents() {
  dom.authBtn.addEventListener("click", handleAuthButton);
  dom.logoutBtn.addEventListener("click", logout);
  dom.catalogBtn.addEventListener("click", () => scrollToElement(dom.productsGrid));
  dom.sellerDashboardBtn.addEventListener("click", () => scrollToElement(dom.sellerStats));
  dom.adminBtn.addEventListener("click", handleAdminButton);
  dom.cartBtn.addEventListener("click", () => toggleCart(true));
  dom.closeCartBtn.addEventListener("click", () => toggleCart(false));
  dom.heroBrowseBtn.addEventListener("click", () => scrollToElement(dom.productsGrid));
  dom.heroUploadBtn.addEventListener("click", () => openUploadModal());
  dom.openUploadBtn.addEventListener("click", () => openUploadModal());
  dom.refreshBtn.addEventListener("click", refreshAllData);
  dom.clearFiltersBtn.addEventListener("click", clearFilters);
  dom.reloadAdminBtn.addEventListener("click", loadAdminDashboard);
  dom.checkoutBtn.addEventListener("click", checkout);

  ["searchInput", "categoryFilter", "priceFilter", "availabilityStart", "availabilityEnd"].forEach((key) => {
    dom[key].addEventListener("input", applyFilters);
    dom[key].addEventListener("change", applyFilters);
  });

  dom.productsGrid.addEventListener("click", handleProductGridClick);
  dom.cartItems.addEventListener("click", handleCartClick);
  dom.ordersTable.addEventListener("click", handleOrdersClick);
  dom.adminProductsTable.addEventListener("click", handleAdminProductsClick);

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      renderAuthMode();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => hideModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        hideModal(modal.id);
      }
    });
  });

  dom.authForm.addEventListener("submit", handleAuthSubmit);
  dom.uploadForm.addEventListener("submit", handleUploadSubmit);
  dom.rentalForm.addEventListener("submit", handleRentalSubmit);
  dom.productEditForm.addEventListener("submit", handleProductEditSubmit);
  dom.rentalStartDate.addEventListener("change", updateRentalQuote);
  dom.rentalEndDate.addEventListener("change", updateRentalQuote);
}

function setupSupabase() {
  const config = window.REWEARLY_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || config.supabaseUrl.includes("YOUR_")) {
    state.supabase = null;
    return;
  }

  state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.currentUser = session?.user || null;
    if (state.currentUser) {
      await ensureProfileRecord(state.currentUser);
    }
    await loadProfile();
    renderUserState();
    await refreshAllData();
  });
}

async function bootstrap() {
  if (!ensureSupabase()) {
    applyFilters();
    return;
  }

  const { data, error } = await state.supabase.auth.getUser();
  if (error) {
    notify(error.message, "error");
  }
  state.currentUser = data?.user || null;
  if (state.currentUser) {
    await ensureProfileRecord(state.currentUser);
  }
  await loadProfile();
  renderUserState();
  await refreshAllData();
}

async function refreshAllData() {
  await Promise.all([loadProducts(), loadSellerDashboard(), loadAdminDashboard()]);
  cleanupExpiredCart();
  applyFilters();
  renderUserState();
  renderCart();
}

function ensureSupabase(quiet = false) {
  if (state.supabase) {
    return true;
  }
  if (!quiet && !state.configErrorShown) {
    notify("Set your Supabase URL and anon key in window.REWEARLY_CONFIG before using live features.", "info");
    state.configErrorShown = true;
  }
  return false;
}

async function loadProfile() {
  state.profile = null;
  if (!state.currentUser || !ensureSupabase(true)) {
    return;
  }

  const { data, error } = await state.supabase.from("profiles").select("*").eq("id", state.currentUser.id).maybeSingle();
  if (error) {
    notify(error.message, "error");
    return;
  }
  state.profile = data || null;
  if (!state.profile) {
    state.profile = await ensureProfileRecord(state.currentUser);
  }
}

async function ensureProfileRecord(user) {
  if (!user || !ensureSupabase(true)) {
    return null;
  }

  const metadata = user.user_metadata || {};
  const payload = {
    id: user.id,
    name: metadata.name || user.email?.split("@")[0] || "Rewearly User",
    email: user.email || "",
    phone: metadata.phone || "Pending",
    address: metadata.address || "Pending"
  };

  const { data, error } = await state.supabase.from("profiles").upsert(payload).select().maybeSingle();
  if (error) {
    notify(error.message, "error");
    return null;
  }
  return data || payload;
}

async function loadProducts() {
  if (!ensureSupabase(true)) {
    state.products = [];
    state.filteredProducts = [];
    renderProducts([]);
    return;
  }

  const { data, error } = await state.supabase
    .from("products")
    .select("*")
    .eq("approved", true)
    .eq("active", true)
    .neq("damage_state", "damaged")
    .order("created_at", { ascending: false });

  if (error) {
    notify(error.message, "error");
    return;
  }

  state.products = (data || []).map(normalizeProduct);
  await loadBookings(state.products.map((product) => product.id));
  renderCategories();
}

async function loadBookings(productIds) {
  state.bookings = [];
  state.bookingsByProduct = new Map();
  if (!productIds.length || !ensureSupabase(true)) {
    return;
  }

  const { data, error } = await state.supabase
    .from("bookings")
    .select("*")
    .in("product_id", productIds)
    .gte("end_date", toISODate(new Date()))
    .order("start_date", { ascending: true });

  if (error) {
    notify(error.message, "error");
    return;
  }

  state.bookings = data || [];
  state.bookingsByProduct = groupBy(state.bookings, "product_id");
}

async function loadSellerDashboard() {
  if (!state.currentUser || !ensureSupabase(true)) {
    state.sellerProducts = [];
    state.sellerEarnings = [];
    state.sellerOrderItems = [];
    renderSellerDashboard();
    return;
  }

  const [productsRes, earningsRes] = await Promise.all([
    state.supabase.from("products").select("*").eq("seller_id", state.currentUser.id).order("created_at", { ascending: false }),
    state.supabase.from("earnings").select("*").eq("seller_id", state.currentUser.id).order("created_at", { ascending: false })
  ]);

  if (productsRes.error) {
    notify(productsRes.error.message, "error");
  }
  if (earningsRes.error) {
    notify(earningsRes.error.message, "error");
  }

  state.sellerProducts = (productsRes.data || []).map(normalizeProduct);
  state.sellerEarnings = earningsRes.data || [];
  state.sellerOrderItems = [];

  const productIds = state.sellerProducts.map((product) => product.id);
  if (productIds.length) {
    const itemsRes = await state.supabase
      .from("order_items")
      .select("id, order_id, product_id, start_date, end_date, line_total")
      .in("product_id", productIds)
      .order("created_at", { ascending: false });

    if (itemsRes.error) {
      notify(itemsRes.error.message, "error");
    } else {
      state.sellerOrderItems = itemsRes.data || [];
    }
  }

  renderSellerDashboard();
}

async function loadAdminDashboard() {
  if (!isAdmin() || !ensureSupabase(true)) {
    state.adminProducts = [];
    state.adminOrders = [];
    state.adminEarnings = [];
    renderAdminDashboard();
    return;
  }

  const [productsRes, ordersRes, earningsRes] = await Promise.all([
    state.supabase.from("products").select("*").order("created_at", { ascending: false }),
    state.supabase.from("orders").select("id, user_id, total, status, created_at").order("created_at", { ascending: false }),
    state.supabase.from("earnings").select("*").order("created_at", { ascending: false })
  ]);

  if (productsRes.error) {
    notify(productsRes.error.message, "error");
  }
  if (ordersRes.error) {
    notify(ordersRes.error.message, "error");
  }
  if (earningsRes.error) {
    notify(earningsRes.error.message, "error");
  }

  state.adminProducts = (productsRes.data || []).map(normalizeProduct);
  state.adminOrders = ordersRes.data || [];
  state.adminEarnings = earningsRes.data || [];

  const userIds = [...new Set(state.adminOrders.map((order) => order.user_id).filter(Boolean))];
  const profilesMap = new Map();
  if (userIds.length) {
    const profilesRes = await state.supabase.from("profiles").select("*").in("id", userIds);
    if (profilesRes.error) {
      notify(profilesRes.error.message, "error");
    } else {
      (profilesRes.data || []).forEach((profile) => profilesMap.set(profile.id, profile));
    }
  }

  state.adminOrders = state.adminOrders.map((order) => ({ ...order, profile: profilesMap.get(order.user_id) || null }));
  renderAdminDashboard();
}

function normalizeProduct(product) {
  return {
    ...product,
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    final_price: Number(product.final_price || product.requested_price || 0),
    requested_price: Number(product.requested_price || 0),
    seller_payout: Number(product.seller_payout || 0),
    royalty_percent: Number(product.royalty_percent || 0),
    total_rentals: Number(product.total_rentals || 0),
    max_rentals: Number(product.max_rentals || 12)
  };
}

function renderProducts(list = state.filteredProducts) {
  dom.productsGrid.innerHTML = "";
  dom.metricProducts.textContent = String(list.length);
  dom.catalogSummary.textContent = list.length ? `${list.length} premium rentals available now.` : "No approved rentals are available right now.";
  dom.catalogEmpty.classList.toggle("hidden", list.length > 0);

  list.forEach((product) => {
    const image = product.images[0] || "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80";
    const blockedWindows = getBlockingBookings(product.id).slice(0, 2).map((booking) => {
      return `${formatDate(booking.start_date)} to ${formatDate(addDays(booking.end_date, BUFFER_DAYS))}`;
    });
    dom.productsGrid.insertAdjacentHTML("beforeend", `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-image">
          <div class="badge-row">
            <span class="badge">${escapeHtml(product.category || "Curated")}</span>
            <span class="badge">${product.ownership_type === "owned" ? "Owned by Rewearly" : "Marketplace"}</span>
          </div>
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">
        </div>
        <div class="product-copy">
          <div class="product-meta">
            <span class="status ${product.active ? "active" : "disabled"}">${product.active ? "Active" : "Inactive"}</span>
            <span class="status ${product.approved ? "approved" : "pending"}">${product.approved ? "Approved" : "Pending"}</span>
          </div>
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.description || "Premium rental piece.")}</p>
          <p class="muted">Condition: ${formatText(product.condition)} • Rentals: ${product.total_rentals}/${product.max_rentals}</p>
          <p class="muted">${blockedWindows.length ? `Next blocked windows: ${escapeHtml(blockedWindows.join(" | "))}` : "Open for booking"}</p>
          <div class="price-line">
            <div><div class="price">${formatCurrency(product.final_price)}</div><div class="muted">per day</div></div>
            <button class="primary-btn" data-action="rent" data-product-id="${product.id}" type="button">Rent now</button>
          </div>
        </div>
      </article>
    `);
  });
}

function renderCategories() {
  const current = dom.categoryFilter.value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();
  dom.categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  dom.categoryFilter.value = categories.includes(current) ? current : "";
}

function applyFilters() {
  const query = dom.searchInput.value.trim().toLowerCase();
  const category = dom.categoryFilter.value;
  const maxPrice = Number(dom.priceFilter.value || 0);
  const start = dom.availabilityStart.value;
  const end = dom.availabilityEnd.value;

  state.filteredProducts = state.products.filter((product) => {
    const haystack = `${product.title} ${product.description} ${product.category}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!category || product.category === category)
      && (!maxPrice || product.final_price <= maxPrice)
      && (!(start && end) || isProductAvailable(product.id, start, end));
  });
  renderProducts(state.filteredProducts);
}

function clearFilters() {
  dom.searchInput.value = "";
  dom.categoryFilter.value = "";
  dom.priceFilter.value = "";
  dom.availabilityStart.value = "";
  dom.availabilityEnd.value = "";
  applyFilters();
}

function renderSellerDashboard() {
  if (!state.currentUser) {
    dom.sellerStats.innerHTML = createPlaceholderStats("Login to upload outfits, view approvals, and track rental income.");
    dom.sellerProductsTable.innerHTML = `<tr><td colspan="5" class="muted">Your seller dashboard will appear after login.</td></tr>`;
    return;
  }

  const totalEarnings = sumBy(state.sellerEarnings, "amount");
  const royalty = sumFiltered(state.sellerEarnings, (row) => row.type === "royalty");
  const payouts = sumFiltered(state.sellerEarnings, (row) => row.type === "seller_payout");
  const pending = state.sellerProducts.filter((product) => !product.approved).length;

  dom.sellerStats.innerHTML = [
    statCard("Uploaded pieces", String(state.sellerProducts.length)),
    statCard("Pending review", String(pending)),
    statCard("Total earnings", formatCurrency(totalEarnings)),
    statCard("Royalty earnings", formatCurrency(royalty)),
    statCard("Seller payouts", formatCurrency(payouts))
  ].join("");

  if (!state.sellerProducts.length) {
    dom.sellerProductsTable.innerHTML = `<tr><td colspan="5" class="muted">No uploads yet. Use the upload flow to submit your first outfit.</td></tr>`;
    return;
  }

  const historyCount = countBy(state.sellerOrderItems, "product_id");
  const earningsByProduct = new Map();
  state.sellerEarnings.forEach((earning) => {
    earningsByProduct.set(earning.product_id, Number(earningsByProduct.get(earning.product_id) || 0) + Number(earning.amount || 0));
  });

  dom.sellerProductsTable.innerHTML = state.sellerProducts.map((product) => {
    const status = product.damage_state === "damaged" ? "Damaged" : product.approved ? (product.active ? "Approved" : "Inactive") : "Pending";
    return `
      <tr>
        <td><strong>${escapeHtml(product.title)}</strong><br><span class="muted">${escapeHtml(product.category || "Uncategorized")}</span></td>
        <td><span class="status ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
        <td>${product.ownership_type === "owned" ? "Owned • Royalty" : "Marketplace • Payout"}</td>
        <td>${formatCurrency(earningsByProduct.get(product.id) || 0)}</td>
        <td>${historyCount.get(product.id) || 0} rentals</td>
      </tr>
    `;
  }).join("");
}

function renderAdminDashboard() {
  const showAdmin = isAdmin();
  dom.adminDashboardSection.classList.toggle("hidden", !showAdmin);
  if (!showAdmin) {
    dom.adminStats.innerHTML = "";
    dom.ordersTable.innerHTML = "";
    dom.adminProductsTable.innerHTML = "";
    return;
  }

  const paidStatuses = new Set(["paid", "dispatched", "delivered", "completed"]);
  const revenue = state.adminOrders.filter((order) => paidStatuses.has(order.status)).reduce((total, order) => total + Number(order.total || 0), 0);
  const ownedCount = state.adminProducts.filter((product) => product.ownership_type === "owned").length;
  const marketplaceCount = state.adminProducts.filter((product) => product.ownership_type === "marketplace").length;
  const payouts = sumFiltered(state.adminEarnings, (row) => row.type === "seller_payout");
  const royalties = sumFiltered(state.adminEarnings, (row) => row.type === "royalty");
  const profit = revenue - payouts - royalties;

  dom.adminStats.innerHTML = [
    statCard("Total revenue", formatCurrency(revenue)),
    statCard("Total profit", formatCurrency(profit)),
    statCard("Payouts", formatCurrency(payouts)),
    statCard("Royalty distribution", formatCurrency(royalties)),
    statCard("Product mix", `${ownedCount} owned / ${marketplaceCount} marketplace`),
  ].join("");

  dom.ordersTable.innerHTML = state.adminOrders.length ? state.adminOrders.map((order) => `
    <tr>
      <td><strong>#${String(order.id).slice(0, 8)}</strong><br><span class="muted">${formatDateTime(order.created_at)}</span></td>
      <td>${escapeHtml(order.profile?.name || "Guest")}<br><span class="muted">${escapeHtml(order.profile?.email || "")}</span></td>
      <td><span class="status ${order.status}">${escapeHtml(formatText(order.status))}</span></td>
      <td>${formatCurrency(order.total)}</td>
      <td>
        <div class="inline-actions">
          <select data-role="order-status" data-order-id="${order.id}" class="mini-btn">
            ${["pending", "paid", "dispatched", "delivered", "completed"].map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${formatText(status)}</option>`).join("")}
          </select>
          <button class="mini-btn" data-action="save-order-status" data-order-id="${order.id}" type="button">Save</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`;

  dom.adminProductsTable.innerHTML = state.adminProducts.length ? state.adminProducts.map((product) => {
    const stateLabel = product.damage_state === "damaged" ? "Damaged" : product.approved ? (product.active ? "Live" : "Disabled") : "Awaiting review";
    return `
      <tr>
        <td><strong>${escapeHtml(product.title)}</strong><br><span class="muted">${escapeHtml(product.category || "")}</span></td>
        <td><span class="status ${stateLabel.toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(stateLabel)}</span></td>
        <td>${formatCurrency(product.final_price)}</td>
        <td><span class="status ${product.damage_state}">${escapeHtml(formatText(product.damage_state || "active"))}</span></td>
        <td>
          <div class="inline-actions">
            <button class="mini-btn" data-action="approve-product" data-product-id="${product.id}" type="button">Approve</button>
            <button class="mini-btn" data-action="reject-product" data-product-id="${product.id}" type="button">Reject</button>
            <button class="mini-btn" data-action="edit-product" data-product-id="${product.id}" type="button">Edit</button>
            <button class="mini-btn" data-action="toggle-damage" data-product-id="${product.id}" type="button">${product.damage_state === "damaged" ? "Restore" : "Damage"}</button>
            <button class="mini-btn" data-action="delete-product" data-product-id="${product.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="5" class="muted">No products loaded.</td></tr>`;
}

function renderCart() {
  cleanupExpiredCart();
  dom.cartCount.textContent = String(state.cart.length);
  if (!state.cart.length) {
    dom.cartItems.innerHTML = `<div class="empty-state"><h3>Your cart is empty.</h3><p>Add one or more rentals with exact dates to continue.</p></div>`;
    dom.cartTotal.textContent = formatCurrency(0);
    return;
  }

  dom.cartItems.innerHTML = state.cart.map((item) => `
    <article class="cart-item">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${formatDate(item.startDate)} to ${formatDate(item.endDate)} • ${item.days} day${item.days > 1 ? "s" : ""}</p>
      <p class="muted">Lock expires ${formatDateTime(item.blockedUntil)} • ${formatCurrency(item.dailyRate)}/day</p>
      <div class="price-line">
        <strong>${formatCurrency(item.lineTotal)}</strong>
        <button class="mini-btn" data-action="remove-cart-item" data-lock-id="${item.lockId}" type="button">Remove</button>
      </div>
    </article>
  `).join("");
  dom.cartTotal.textContent = formatCurrency(state.cart.reduce((sum, item) => sum + item.lineTotal, 0));
}

function renderUserState() {
  const loggedIn = Boolean(state.currentUser);
  dom.authBtn.textContent = loggedIn ? (state.profile?.name || state.currentUser.email || "Account") : "Login / Sign up";
  dom.logoutBtn.classList.toggle("hidden", !loggedIn);
}

function renderAuthMode() {
  const signup = state.authMode === "signup";
  document.querySelectorAll(".signup-only").forEach((element) => element.classList.toggle("hidden", !signup));
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === state.authMode));
  dom.authSubmitBtn.textContent = signup ? "Create account" : "Login";
  if (dom.authHelperText) {
    dom.authHelperText.textContent = signup
      ? "Create your account once. If Supabase email confirmation is enabled, confirm the email before logging in."
      : "Use the same email and password you created during sign up.";
  }
}

function handleAuthButton() {
  if (state.currentUser) {
    notify(`Signed in as ${state.profile?.name || state.currentUser.email}.`, "info");
    scrollToElement(dom.sellerStats);
    return;
  }
  showModal("authModal");
}

function handleAdminButton() {
  if (!isAdmin()) {
    notify("Admin access is restricted to the configured admin email.", "error");
    return;
  }
  scrollToElement(dom.adminDashboardSection);
}

async function logout() {
  if (!ensureSupabase()) {
    return;
  }
  const { error } = await state.supabase.auth.signOut();
  if (error) {
    notify(error.message, "error");
    return;
  }
  state.currentUser = null;
  state.profile = null;
  notify("Logged out.", "info");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!ensureSupabase()) {
    return;
  }

  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value;
  if (!email || !password) {
    notify("Email and password are required.", "error");
    return;
  }

  let authError = null;
  let user = null;

  if (state.authMode === "signup") {
    const payload = { name: dom.authName.value.trim(), phone: dom.authPhone.value.trim(), address: dom.authAddress.value.trim() };
    if (!payload.name || !payload.phone || !payload.address) {
      notify("Name, phone, and address are required for sign up.", "error");
      return;
    }

    const { data, error } = await state.supabase.auth.signUp({ email, password, options: { data: payload } });
    authError = error;
    user = data?.user || null;
    const session = data?.session || null;

    if (!authError && user) {
      const upsertRes = await state.supabase.from("profiles").upsert({ id: user.id, name: payload.name, email, phone: payload.phone, address: payload.address });
      if (upsertRes.error) {
        notify(upsertRes.error.message, "error");
      }
    }

    if (!authError && !session) {
      dom.authForm.reset();
      hideModal("authModal");
      notify("Account created. Check your email and confirm the account before logging in.", "info");
      return;
    }
  } else {
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    authError = error;
    user = data?.user || null;
  }

  if (authError) {
    const message = String(authError.message || "");
    if (message.toLowerCase().includes("invalid login credentials")) {
      notify("Incorrect email or password. If this is your first time, create the account from Sign up first.", "error");
      return;
    }
    if (message.toLowerCase().includes("email not confirmed")) {
      notify("Your account exists, but the email is not confirmed yet. Verify it in your inbox or disable email confirmation in Supabase Auth settings.", "error");
      return;
    }
    notify(message, "error");
    return;
  }

  state.currentUser = user;
  await ensureProfileRecord(user);
  await loadProfile();
  renderUserState();
  dom.authForm.reset();
  hideModal("authModal");
  notify(state.authMode === "signup" ? "Account created." : "Logged in successfully.", "success");
  await refreshAllData();
}

function openUploadModal() {
  if (!state.currentUser) {
    showModal("authModal");
    notify("Login is required before you can upload an outfit.", "info");
    return;
  }
  showModal("uploadModal");
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) {
    showModal("authModal");
    return;
  }
  if (!ensureSupabase()) {
    return;
  }

  const files = [...dom.uploadImages.files];
  if (files.length < 1 || files.length > 5) {
    notify("Upload between 1 and 5 images.", "error");
    return;
  }

  const ownershipType = dom.uploadOwnership.value;
  const royaltyPercent = Number(dom.uploadRoyaltyPercent.value || 0);
  const imageUrls = [];

  for (const file of files) {
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const uploadRes = await state.supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (uploadRes.error) {
      notify(uploadRes.error.message, "error");
      return;
    }
    const { data } = state.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    imageUrls.push(data.publicUrl);
  }

  const requestedPrice = Number(dom.uploadPrice.value || 0);
  const payload = {
    title: dom.uploadTitle.value.trim(),
    description: dom.uploadDescription.value.trim(),
    category: dom.uploadCategory.value.trim(),
    images: imageUrls,
    requested_price: requestedPrice,
    final_price: requestedPrice,
    seller_payout: ownershipType === "marketplace" ? requestedPrice : 0,
    royalty_percent: ownershipType === "owned" ? (royaltyPercent || 10) : 0,
    ownership_type: ownershipType,
    approved: false,
    active: true,
    condition: dom.uploadCondition.value,
    seller_id: state.currentUser.id,
    total_rentals: 0,
    max_rentals: 12,
    damage_state: "active"
  };

  const { error } = await state.supabase.from("products").insert(payload);
  if (error) {
    notify(error.message, "error");
    return;
  }

  dom.uploadForm.reset();
  hideModal("uploadModal");
  notify("Submitted for admin approval.", "success");
  await refreshAllData();
}

function handleProductGridClick(event) {
  const button = event.target.closest("[data-action='rent']");
  if (!button) {
    return;
  }
  const product = state.products.find((entry) => String(entry.id) === String(button.dataset.productId));
  if (product) {
    openRentalModal(product);
  }
}

function openRentalModal(product) {
  state.selectedProduct = product;
  dom.rentalModalTitle.textContent = `Reserve ${product.title}`;
  dom.rentalImage.src = product.images[0] || "";
  dom.rentalImage.alt = product.title;
  dom.rentalProductTitle.textContent = product.title;
  dom.rentalProductMeta.textContent = `${product.category || "Curated"} • ${formatCurrency(product.final_price)}/day • ${formatText(product.condition)}`;
  dom.rentalStartDate.value = "";
  dom.rentalEndDate.value = "";
  dom.rentalStartDate.min = toISODate(new Date());
  dom.rentalEndDate.min = toISODate(new Date());
  renderAvailabilityPanel(product.id);
  updateRentalQuote();
  showModal("rentalModal");
}

function renderAvailabilityPanel(productId) {
  const bookings = getBlockingBookings(productId);
  if (!bookings.length) {
    dom.availabilityPanel.innerHTML = `<strong>Open availability</strong><p class="muted">No blocked dates right now. A 3-day post-rental cleaning buffer is always applied.</p>`;
    return;
  }

  dom.availabilityPanel.innerHTML = `<strong>Blocked windows</strong><ul>${bookings.slice(0, 6).map((booking) => `<li>${formatDate(booking.start_date)} to ${formatDate(addDays(booking.end_date, BUFFER_DAYS))}</li>`).join("")}</ul>`;
}

function updateRentalQuote() {
  const product = state.selectedProduct;
  const start = dom.rentalStartDate.value;
  const end = dom.rentalEndDate.value;
  const dailyRate = Number(product?.final_price || 0);
  let days = 0;
  let total = 0;

  if (product && start && end && new Date(start) <= new Date(end)) {
    days = daysInclusive(start, end);
    total = days * dailyRate;
  }

  dom.rentalDays.textContent = String(days);
  dom.rentalRate.textContent = formatCurrency(dailyRate);
  dom.rentalLineTotal.textContent = formatCurrency(total);
}

async function handleRentalSubmit(event) {
  event.preventDefault();
  const product = state.selectedProduct;
  if (!product) {
    return;
  }
  if (!state.currentUser) {
    showModal("authModal");
    notify("Login is required before reserving rental dates.", "info");
    return;
  }
  if (!ensureSupabase()) {
    return;
  }

  const startDate = dom.rentalStartDate.value;
  const endDate = dom.rentalEndDate.value;
  if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) {
    notify("Choose a valid start and end date.", "error");
    return;
  }
  if (!isProductAvailable(product.id, startDate, endDate)) {
    notify("Those dates overlap with another booking or cleaning buffer.", "error");
    renderAvailabilityPanel(product.id);
    return;
  }

  const blockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await state.supabase.from("bookings").insert({
    product_id: product.id,
    user_id: state.currentUser.id,
    start_date: startDate,
    end_date: endDate,
    blocked_until: blockedUntil,
    booking_status: "locked"
  }).select().single();

  if (error) {
    notify(error.message, "error");
    return;
  }

  const days = daysInclusive(startDate, endDate);
  state.cart.push({
    productId: product.id,
    lockId: data.id,
    bookingId: data.id,
    title: product.title,
    startDate,
    endDate,
    days,
    dailyRate: product.final_price,
    lineTotal: days * product.final_price,
    blockedUntil
  });
  state.bookings.push(data);
  state.bookingsByProduct = groupBy(state.bookings, "product_id");
  persistCart();
  renderCart();
  applyFilters();
  hideModal("rentalModal");
  notify("Rental added to cart and locked for 30 minutes.", "success");
}

function handleCartClick(event) {
  const button = event.target.closest("[data-action='remove-cart-item']");
  if (button) {
    removeCartItem(button.dataset.lockId);
  }
}

async function removeCartItem(lockId) {
  const item = state.cart.find((entry) => String(entry.lockId) === String(lockId));
  state.cart = state.cart.filter((entry) => String(entry.lockId) !== String(lockId));
  persistCart();

  if (item && ensureSupabase(true)) {
    await state.supabase.from("bookings").update({
      booking_status: "released",
      blocked_until: new Date().toISOString()
    }).eq("id", item.bookingId);
  }

  await refreshAllData();
}

async function checkout() {
  if (!state.currentUser) {
    showModal("authModal");
    notify("Login is required before checkout.", "info");
    return;
  }
  if (!ensureSupabase()) {
    return;
  }
  cleanupExpiredCart();
  if (!state.cart.length) {
    notify("Your cart is empty.", "error");
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderRes = await state.supabase.from("orders").insert({
    user_id: state.currentUser.id,
    total,
    status: "pending"
  }).select().single();

  if (orderRes.error) {
    notify(orderRes.error.message, "error");
    return;
  }

  const itemsRes = await state.supabase.from("order_items").insert(state.cart.map((item) => ({
    order_id: orderRes.data.id,
    product_id: item.productId,
    booking_id: item.bookingId,
    start_date: item.startDate,
    end_date: item.endDate,
    daily_rate: item.dailyRate,
    rental_days: item.days,
    line_total: item.lineTotal
  })));

  if (itemsRes.error) {
    notify(itemsRes.error.message, "error");
    return;
  }

  const bookingRes = await state.supabase.from("bookings").update({ order_id: orderRes.data.id }).in("id", state.cart.map((item) => item.bookingId));
  if (bookingRes.error) {
    notify(bookingRes.error.message, "error");
    return;
  }

  state.cart = [];
  persistCart();
  renderCart();
  toggleCart(false);
  notify("Order created. Complete payment in your UPI app and wait for admin confirmation.", "success");
  await refreshAllData();
  window.location.href = `upi://pay?pa=8368081255@ybl&pn=Rewearly&am=${encodeURIComponent(total)}`;
}

async function handleOrdersClick(event) {
  const button = event.target.closest("[data-action='save-order-status']");
  if (!button) {
    return;
  }
  const orderId = button.dataset.orderId;
  const select = dom.ordersTable.querySelector(`[data-role="order-status"][data-order-id="${orderId}"]`);
  if (select?.value) {
    await updateOrderStatus(orderId, select.value);
  }
}

async function updateOrderStatus(orderId, nextStatus) {
  const { error } = await state.supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
  if (error) {
    notify(error.message, "error");
    return;
  }
  await syncOrderSideEffects(orderId, nextStatus);
  notify(`Order updated to ${formatText(nextStatus)}.`, "success");
  await refreshAllData();
}

async function syncOrderSideEffects(orderId, status) {
  const { data: items, error } = await state.supabase.from("order_items").select("*, products(*)").eq("order_id", orderId);
  if (error) {
    notify(error.message, "error");
    return;
  }

  const bookingStatus = status === "completed" ? "completed" : status === "pending" ? "locked" : "confirmed";

  for (const item of items || []) {
    if (item.booking_id) {
      await state.supabase.from("bookings").update({
        booking_status: bookingStatus,
        blocked_until: status === "pending" ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null
      }).eq("id", item.booking_id);
    }

    if (["paid", "dispatched", "delivered", "completed"].includes(status)) {
      if (!item.earnings_generated) {
        const product = normalizeProduct(item.products || {});
        const amount = product.ownership_type === "owned" ? (item.line_total * (product.royalty_percent || 10)) / 100 : Number(product.seller_payout || 0);
        const type = product.ownership_type === "owned" ? "royalty" : "seller_payout";
        if (amount > 0 && product.seller_id) {
          await state.supabase.from("earnings").insert({
            seller_id: product.seller_id,
            product_id: product.id,
            order_id: orderId,
            order_item_id: item.id,
            amount,
            type
          });
        }
        await state.supabase.from("order_items").update({ earnings_generated: true }).eq("id", item.id);
      }

      if (!item.rental_counted) {
        const product = normalizeProduct(item.products || {});
        const nextRentals = Number(product.total_rentals || 0) + 1;
        await state.supabase.from("products").update({
          total_rentals: nextRentals,
          active: nextRentals >= Number(product.max_rentals || 12) ? false : Boolean(product.active)
        }).eq("id", product.id);
        await state.supabase.from("order_items").update({ rental_counted: true }).eq("id", item.id);
      }
    }
  }
}

async function handleAdminProductsClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const product = state.adminProducts.find((entry) => String(entry.id) === String(button.dataset.productId));
  if (!product) {
    return;
  }

  if (button.dataset.action === "approve-product") {
    await updateProduct(product.id, { approved: true, active: true });
  }
  if (button.dataset.action === "reject-product") {
    await updateProduct(product.id, { approved: false, active: false });
  }
  if (button.dataset.action === "toggle-damage") {
    const damaged = product.damage_state !== "damaged";
    await updateProduct(product.id, { damage_state: damaged ? "damaged" : "active", active: !damaged });
  }
  if (button.dataset.action === "delete-product") {
    const { error } = await state.supabase.from("products").delete().eq("id", product.id);
    if (error) {
      notify(error.message, "error");
      return;
    }
    notify("Product deleted.", "success");
    await refreshAllData();
  }
  if (button.dataset.action === "edit-product") {
    openProductEditor(product);
  }
}

async function updateProduct(productId, changes) {
  const { error } = await state.supabase.from("products").update(changes).eq("id", productId);
  if (error) {
    notify(error.message, "error");
    return;
  }
  notify("Product updated.", "success");
  await refreshAllData();
}

function openProductEditor(product) {
  dom.editProductId.value = product.id;
  dom.editTitle.value = product.title || "";
  dom.editCategory.value = product.category || "";
  dom.editDescription.value = product.description || "";
  dom.editFinalPrice.value = product.final_price || 0;
  dom.editSellerPayout.value = product.seller_payout || 0;
  dom.editRoyaltyPercent.value = product.royalty_percent || 0;
  dom.editOwnershipType.value = product.ownership_type || "marketplace";
  dom.editCondition.value = product.condition || "excellent";
  dom.editApproved.value = String(Boolean(product.approved));
  dom.editActive.value = String(Boolean(product.active));
  dom.editDamageState.value = product.damage_state || "active";
  dom.editImages.value = (product.images || []).join(", ");
  showModal("productEditModal");
}

async function handleProductEditSubmit(event) {
  event.preventDefault();
  const payload = {
    title: dom.editTitle.value.trim(),
    category: dom.editCategory.value.trim(),
    description: dom.editDescription.value.trim(),
    final_price: Number(dom.editFinalPrice.value || 0),
    seller_payout: Number(dom.editSellerPayout.value || 0),
    royalty_percent: Number(dom.editRoyaltyPercent.value || 0),
    ownership_type: dom.editOwnershipType.value,
    condition: dom.editCondition.value,
    approved: dom.editApproved.value === "true",
    active: dom.editActive.value === "true",
    damage_state: dom.editDamageState.value,
    images: dom.editImages.value.split(",").map((value) => value.trim()).filter(Boolean)
  };

  const { error } = await state.supabase.from("products").update(payload).eq("id", dom.editProductId.value);
  if (error) {
    notify(error.message, "error");
    return;
  }
  hideModal("productEditModal");
  notify("Product changes saved.", "success");
  await refreshAllData();
}

function toggleCart(show) {
  dom.cartDrawer.classList.toggle("hidden", !show);
}

function showModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function hideModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function getBlockingBookings(productId) {
  return (state.bookingsByProduct.get(productId) || []).filter(isBlockingBooking);
}

function isBlockingBooking(booking) {
  if (booking.booking_status === "cancelled" || booking.booking_status === "released") {
    return false;
  }
  if (booking.booking_status === "locked" && booking.blocked_until && new Date(booking.blocked_until) < new Date()) {
    return false;
  }
  return true;
}

function isProductAvailable(productId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return !getBlockingBookings(productId).some((booking) => {
    return rangesOverlap(start, end, new Date(booking.start_date), new Date(addDays(booking.end_date, BUFFER_DAYS)));
  });
}

function cleanupExpiredCart() {
  const before = state.cart.length;
  state.cart = state.cart.filter((item) => new Date(item.blockedUntil) > new Date());
  if (before !== state.cart.length) {
    persistCart();
  }
}

function persistCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
}

function restoreCart() {
  try {
    state.cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
  } catch (_error) {
    state.cart = [];
  }
  cleanupExpiredCart();
}

function notify(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${escapeHtml(formatText(type))}</strong><div>${escapeHtml(message)}</div>`;
  dom.toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function isAdmin() {
  return state.currentUser?.email === ADMIN_EMAIL;
}

function scrollToElement(element) {
  element?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statCard(label, value) {
  return `<div class="stats-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function createPlaceholderStats(text) {
  return `<div class="stats-card"><strong>Locked</strong><span>${escapeHtml(text)}</span></div>`;
}

function groupBy(items, key) {
  const map = new Map();
  items.forEach((item) => {
    if (!map.has(item[key])) {
      map.set(item[key], []);
    }
    map.get(item[key]).push(item);
  });
  return map;
}

function countBy(items, key) {
  const map = new Map();
  items.forEach((item) => map.set(item[key], Number(map.get(item[key]) || 0) + 1));
  return map;
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function sumFiltered(items, predicate) {
  return items.filter(predicate).reduce((total, item) => total + Number(item.amount || 0), 0);
}

function daysInclusive(startDate, endDate) {
  return Math.floor((new Date(endDate).setHours(0, 0, 0, 0) - new Date(startDate).setHours(0, 0, 0, 0)) / 86400000) + 1;
}

function addDays(dateInput, days) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "-";
}

function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "-";
}

function toISODate(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function formatText(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
