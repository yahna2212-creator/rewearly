const ADMIN_EMAIL = "yahna2212@gmail.com";
const BUFFER_DAYS = 3;
const LOCK_MINUTES = 30;
const CART_STORAGE_KEY = "rewearly_cart_v1";
const STORAGE_BUCKET = "products";

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
  configErrorShown: false,
  sessionSyncPromise: Promise.resolve(),
  sessionSyncTimer: null
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
    "authStatus", "sellerAccessStatus",
    "heroBrowseBtn", "heroUploadBtn", "refreshBtn", "clearFiltersBtn", "reloadAdminBtn",
    "searchInput", "categoryFilter", "priceFilter",
    "productsGrid", "catalogSummary", "catalogEmpty", "metricProducts",
    "sellerStats", "sellerProductsTable", "adminStats", "ordersTable", "adminProductsTable",
    "cartDrawer", "closeCartBtn", "cartItems", "cartTotal", "checkoutBtn",
    "authModal", "authForm", "authSubmitBtn", "authName", "authEmail", "authPassword", "authPhone", "authAddress", "authHelperText",
    "uploadModal", "uploadForm", "uploadTitle", "uploadCategory", "uploadDescription", "uploadPrice",
    "uploadCondition", "uploadImages", "openUploadBtn",
    "uploadFeedback",
    "rentalModal", "rentalForm", "rentalModalTitle", "rentalImage", "rentalProductTitle", "rentalProductMeta",
    "rentalDays", "rentalRate", "rentalLineTotal",
    "productEditModal", "productEditForm", "editProductId", "editTitle", "editCategory", "editDescription",
    "editFinalPrice", "editSellerPayout", "editCondition",
    "editApproved", "editActive", "editRejectionReason", "editImages", "toastStack", "adminDashboardSection",
    "rejectModal", "rejectForm", "rejectProductId", "rejectReason"
  ];
  ids.forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

function bindEvents() {
  on(dom.authBtn, "click", handleAuthButton);
  on(dom.logoutBtn, "click", logout);
  on(dom.catalogBtn, "click", () => navigateToRoute("browse_products.html"));
  on(dom.sellerDashboardBtn, "click", () => navigateToRoute("seller_portal.html"));
  on(dom.adminBtn, "click", handleAdminButton);
  on(dom.cartBtn, "click", () => toggleCart(true));
  on(dom.closeCartBtn, "click", () => toggleCart(false));
  on(dom.heroBrowseBtn, "click", () => navigateToRoute("browse_products.html"));
  on(dom.heroUploadBtn, "click", () => navigateToRoute("seller_portal.html"));
  on(dom.openUploadBtn, "click", () => openUploadModal());
  on(dom.refreshBtn, "click", refreshAllData);
  on(dom.clearFiltersBtn, "click", clearFilters);
  on(dom.reloadAdminBtn, "click", loadAdminDashboard);
  on(dom.checkoutBtn, "click", checkout);

  ["searchInput", "categoryFilter", "priceFilter"].forEach((key) => {
    on(dom[key], "input", applyFilters);
    on(dom[key], "change", applyFilters);
  });

  on(dom.productsGrid, "click", handleProductGridClick);
  on(dom.cartItems, "click", handleCartClick);
  on(dom.ordersTable, "click", handleOrdersClick);
  on(dom.adminProductsTable, "click", handleAdminProductsClick);

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

  on(dom.authForm, "submit", handleAuthSubmit);
  on(dom.uploadForm, "submit", handleUploadSubmit);
  on(dom.uploadForm, "invalid", handleUploadInvalid, true);
  on(dom.rentalForm, "submit", handleRentalSubmit);
  on(dom.productEditForm, "submit", handleProductEditSubmit);
  on(dom.rejectForm, "submit", handleRejectSubmit);
}

function setupSupabase() {
  const config = window.REWEARLY_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || config.supabaseUrl.includes("YOUR_")) {
    state.supabase = null;
    return;
  }

  state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  state.supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      scheduleSessionSync(null);
      return;
    }

    if (session?.user) {
      scheduleSessionSync(session.user);
    }
  });
}

function scheduleSessionSync(user) {
  if (state.sessionSyncTimer) {
    clearTimeout(state.sessionSyncTimer);
  }

  state.sessionSyncTimer = setTimeout(() => {
    state.sessionSyncTimer = null;
    void syncSessionState(user);
  }, 0);
}

async function bootstrap() {
  if (!ensureSupabase()) {
    applyFilters();
    return;
  }

  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    notify(error.message, "error");
  }
  await syncSessionState(data?.session?.user || null);
}

async function syncSessionState(user) {
  state.sessionSyncPromise = state.sessionSyncPromise
    .catch(() => {})
    .then(async () => {
      state.currentUser = user;
      await loadProfile();
      renderUserState();
      await refreshAllData();
    });

  return state.sessionSyncPromise;
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
    state.profile = buildProfileFallback(state.currentUser);
    return;
  }
  state.profile = data || buildProfileFallback(state.currentUser);
}

function buildProfileFallback(user) {
  const metadata = user?.user_metadata || {};
  return user ? {
    id: user.id,
    name: metadata.name || user.email?.split("@")[0] || "Rewearly User",
    email: user.email || "",
    phone: metadata.phone || "Pending",
    address: metadata.address || "Pending"
  } : null;
}

async function ensureProfileRecord(user, options = {}) {
  if (!user || !ensureSupabase(true)) {
    return null;
  }

  const payload = buildProfileFallback(user);
  const quiet = Boolean(options.quiet);

  try {
    const profilePromise = state.supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Profile sync timed out. Check profiles table policies in Supabase.")), 12000);
    });
    const result = await Promise.race([profilePromise, timeoutPromise]);
    if (result?.error) {
      if (!quiet) {
        notify(result.error.message, "error");
      }
      return null;
    }
    return payload;
  } catch (error) {
    if (!quiet) {
      notify(error instanceof Error ? error.message : "Profile sync failed.", "error");
    }
    return null;
  }
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
    .gt("final_price", 0)
    .order("created_at", { ascending: false });

  if (error) {
    notify(error.message, "error");
    return;
  }

  state.products = (data || []).map(normalizeProduct);
  renderCategories();
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

  const userIds = [...new Set([
    ...state.adminOrders.map((order) => order.user_id).filter(Boolean),
    ...state.adminProducts.map((product) => product.seller_id).filter(Boolean)
  ])];
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
  state.adminProducts = state.adminProducts.map((product) => ({ ...product, seller_profile: profilesMap.get(product.seller_id) || null }));
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
  if (!dom.productsGrid || !dom.catalogSummary || !dom.catalogEmpty) {
    return;
  }
  dom.productsGrid.innerHTML = "";
  if (dom.metricProducts) {
    dom.metricProducts.textContent = String(list.length);
  }
  dom.catalogSummary.textContent = list.length ? `${list.length} curated products available now.` : "No approved products are available right now.";
  dom.catalogEmpty.classList.toggle("hidden", list.length > 0);

  list.forEach((product) => {
    const image = product.images[0] || "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80";
    dom.productsGrid.insertAdjacentHTML("beforeend", `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-image">
          <div class="badge-row">
            <span class="badge">${escapeHtml(product.category || "Curated")}</span>
          </div>
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">
        </div>
        <div class="product-copy">
          <div class="product-meta">
            <span class="status ${product.active ? "active" : "disabled"}">${product.active ? "Active" : "Inactive"}</span>
            <span class="status ${product.approved ? "approved" : "pending"}">${product.approved ? "Approved" : "Pending"}</span>
          </div>
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.description || "Premium fashion piece.")}</p>
          <p class="muted">Condition: ${formatText(product.condition)}</p>
          <p class="muted">Platform price: ${formatCurrency(product.final_price)}</p>
          <div class="price-line">
            <div><div class="price">${formatCurrency(product.final_price)}</div><div class="muted">selling price</div></div>
            <button class="primary-btn" data-action="rent" data-product-id="${product.id}" type="button">View Product</button>
          </div>
        </div>
      </article>
    `);
  });
}

function renderCategories() {
  if (!dom.categoryFilter) {
    return;
  }
  const current = dom.categoryFilter.value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();
  dom.categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  dom.categoryFilter.value = categories.includes(current) ? current : "";
}

function applyFilters() {
  if (!dom.searchInput || !dom.categoryFilter || !dom.priceFilter) {
    return;
  }
  const query = dom.searchInput.value.trim().toLowerCase();
  const category = dom.categoryFilter.value;
  const maxPrice = Number(dom.priceFilter.value || 0);

  state.filteredProducts = state.products.filter((product) => {
    const haystack = `${product.title} ${product.description} ${product.category}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!category || product.category === category)
      && (!maxPrice || product.final_price <= maxPrice);
  });
  renderProducts(state.filteredProducts);
}

function clearFilters() {
  if (!dom.searchInput || !dom.categoryFilter || !dom.priceFilter) {
    return;
  }
  dom.searchInput.value = "";
  dom.categoryFilter.value = "";
  dom.priceFilter.value = "";
  applyFilters();
}

function renderSellerDashboard() {
  if (!dom.sellerStats || !dom.sellerProductsTable) {
    return;
  }
  if (!state.currentUser) {
    if (dom.sellerAccessStatus) {
      dom.sellerAccessStatus.textContent = "Login required for seller tools.";
    }
    dom.sellerStats.innerHTML = createPlaceholderStats("Login to upload outfits, view approvals, and track rental income.");
    dom.sellerProductsTable.innerHTML = `<tr><td colspan="4" class="muted">Your seller dashboard will appear after login.</td></tr>`;
    return;
  }

  if (dom.sellerAccessStatus) {
    dom.sellerAccessStatus.textContent = `Seller access active for ${state.profile?.email || state.currentUser.email || "your account"}.`;
  }

  const totalEarnings = sumBy(state.sellerEarnings, "amount");
  const payouts = sumFiltered(state.sellerEarnings, (row) => row.type === "seller_payout");
  const pending = state.sellerProducts.filter((product) => !product.approved).length;

  dom.sellerStats.innerHTML = [
    statCard("Uploaded pieces", String(state.sellerProducts.length)),
    statCard("Pending review", String(pending)),
    statCard("Total earnings", formatCurrency(totalEarnings)),
    statCard("Rewearly payout", formatCurrency(payouts))
  ].join("");

  if (!state.sellerProducts.length) {
    dom.sellerProductsTable.innerHTML = `<tr><td colspan="4" class="muted">No uploads yet. Use the upload flow to submit your first outfit.</td></tr>`;
    return;
  }

  const earningsByProduct = new Map();
  state.sellerEarnings.forEach((earning) => {
    earningsByProduct.set(earning.product_id, Number(earningsByProduct.get(earning.product_id) || 0) + Number(earning.amount || 0));
  });

  dom.sellerProductsTable.innerHTML = state.sellerProducts.map((product) => {
    const status = product.approved ? (product.active ? "Approved" : "Inactive") : "Pending";
    const pricingNote = getSellerPricingUpdateNote(product);
    return `
      <tr>
        <td><strong>${escapeHtml(product.title)}</strong><br><span class="muted">${escapeHtml(product.category || "Uncategorized")}</span></td>
        <td><span class="status ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
        <td>Asked: ${formatCurrency(product.requested_price)}<br><span class="muted">Rewearly buy price: ${formatCurrency(product.seller_payout)}</span>${pricingNote ? `<br><span class="muted">${escapeHtml(pricingNote)}</span>` : ""}${product.rejection_reason ? `<br><span class="muted">Reason: ${escapeHtml(product.rejection_reason)}</span>` : ""}</td>
        <td>${formatCurrency(earningsByProduct.get(product.id) || 0)}</td>
      </tr>
    `;
  }).join("");
}

function renderAdminDashboard() {
  if (!dom.adminDashboardSection || !dom.adminStats || !dom.ordersTable || !dom.adminProductsTable) {
    return;
  }
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
  const payouts = sumFiltered(state.adminEarnings, (row) => row.type === "seller_payout");
  const profit = revenue - payouts;

  dom.adminStats.innerHTML = [
    statCard("Total revenue", formatCurrency(revenue)),
    statCard("Total profit", formatCurrency(profit)),
    statCard("Payouts", formatCurrency(payouts)),
    statCard("Managed products", String(state.adminProducts.length)),
  ].join("");

  dom.ordersTable.innerHTML = state.adminOrders.length ? state.adminOrders.map((order) => `
    <tr>
      <td><strong>#${String(order.id).slice(0, 8)}</strong><br><span class="muted">${formatDateTime(order.created_at)}</span></td>
      <td>${escapeHtml(order.profile?.name || "Guest")}<br><span class="muted">${escapeHtml(order.profile?.email || "")}</span><br><span class="muted">${escapeHtml(order.profile?.address || "No address")}</span></td>
      <td><span class="status ${order.status}">${escapeHtml(formatText(order.status))}</span></td>
      <td>
        <div class="inline-actions">
          <select data-role="order-status" data-order-id="${order.id}" class="mini-btn">
            ${["pending", "paid", "dispatched", "delivered", "completed"].map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${formatText(status)}</option>`).join("")}
          </select>
          <button class="mini-btn" data-action="save-order-status" data-order-id="${order.id}" type="button">Save</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="muted">No orders yet.</td></tr>`;

  dom.adminProductsTable.innerHTML = state.adminProducts.length ? state.adminProducts.map((product) => {
    const hasSitePrice = Number(product.final_price || 0) > 0;
    const stateLabel = product.approved
      ? (product.active ? "Live" : "Disabled")
      : (hasSitePrice ? "Awaiting review" : "Set site price");
    return `
      <tr>
        <td><strong>${escapeHtml(product.title)}</strong><br><span class="muted">${escapeHtml(product.category || "")}</span><br><span class="muted">${escapeHtml(product.seller_profile?.email || "No seller email")}</span><br><span class="muted">${escapeHtml(product.seller_profile?.address || "No seller address")}</span></td>
        <td><span class="status ${stateLabel.toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(stateLabel)}</span></td>
        <td><strong>Site price: ${hasSitePrice ? formatCurrency(product.final_price) : "Not set"}</strong><br><span class="muted">Buy from seller: ${formatCurrency(product.seller_payout)}</span><br><span class="muted">Seller asked: ${formatCurrency(product.requested_price)}</span></td>
        <td>
          <div class="inline-actions">
            <button class="mini-btn" data-action="approve-product" data-product-id="${product.id}" type="button">Approve</button>
            <button class="mini-btn" data-action="reject-product" data-product-id="${product.id}" type="button">Reject</button>
            <button class="mini-btn" data-action="edit-product" data-product-id="${product.id}" type="button">Edit</button>
            <button class="mini-btn" data-action="delete-product" data-product-id="${product.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="4" class="muted">No products loaded.</td></tr>`;
}

function renderCart() {
  if (!dom.cartItems || !dom.cartTotal || !dom.cartCount) {
    return;
  }
  cleanupExpiredCart();
  dom.cartCount.textContent = String(state.cart.length);
  if (!state.cart.length) {
    dom.cartItems.innerHTML = `<div class="empty-state"><h3>Your cart is empty.</h3><p>Add one or more products to continue.</p></div>`;
    dom.cartTotal.textContent = formatCurrency(0);
    return;
  }

  dom.cartItems.innerHTML = state.cart.map((item) => `
    <article class="cart-item">
      <h3>${escapeHtml(item.title)}</h3>
      <p>Direct purchase</p>
      <p class="muted">${formatCurrency(item.dailyRate)} selling price</p>
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
  if (dom.authBtn) {
    dom.authBtn.textContent = loggedIn ? (state.profile?.name || state.currentUser.email || "Account") : "Login / Sign up";
  }
  if (dom.logoutBtn) {
    dom.logoutBtn.classList.toggle("hidden", !loggedIn);
  }
  if (dom.adminBtn) {
    dom.adminBtn.classList.toggle("hidden", !isAdmin());
  }
  if (dom.authStatus) {
    dom.authStatus.textContent = loggedIn
      ? `Signed in as ${state.profile?.email || state.currentUser.email || "your account"}.`
      : "Not logged in.";
  }
  if (loggedIn && dom.sellerStats?.textContent?.includes("Login to upload outfits")) {
    renderSellerDashboard();
  }
}

function renderAuthMode() {
  const signup = state.authMode === "signup";
  document.querySelectorAll(".signup-only").forEach((element) => element.classList.toggle("hidden", !signup));
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === state.authMode));
  if (dom.authSubmitBtn) {
    dom.authSubmitBtn.textContent = signup ? "Create account" : "Login";
  }
  if (dom.authHelperText) {
    dom.authHelperText.textContent = signup
      ? "Create your account once. If Supabase email confirmation is enabled, confirm the email before logging in."
      : "Use the same email and password you created during sign up.";
  }
}

function handleAuthButton() {
  if (state.currentUser) {
    renderSellerDashboard();
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
  navigateToRoute("admin.html");
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
  let sessionUser = null;

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
    sessionUser = session?.user || null;

    if (!authError && user) {
      await ensureProfileRecord({
        ...user,
        email,
        user_metadata: payload
      }, { quiet: true });
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
    sessionUser = data?.session?.user || null;
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

  if (!user && sessionUser) {
    user = sessionUser;
  }

  if (!user) {
    const { data } = await state.supabase.auth.getSession();
    user = data?.session?.user || null;
  }

  if (!user) {
    const { data } = await state.supabase.auth.getUser();
    user = data?.user || null;
  }

  if (!user) {
    notify("Login completed but no user session was found. Refresh once and try again.", "error");
    return;
  }

  state.currentUser = user;
  state.profile = buildProfileFallback(user);
  renderUserState();
  await loadSellerDashboard();
  renderSellerDashboard();
  dom.authForm.reset();
  hideModal("authModal");
  notify(state.authMode === "signup" ? "Account created." : "Logged in successfully.", "success");
  void syncSessionState(user);
}

function openUploadModal() {
  if (!window.location.pathname.toLowerCase().includes("upload_outfit")) {
    if (window.location.pathname.toLowerCase().includes("seller_portal")) {
      navigateToRoute("upload_outfit.html");
      return;
    }
    navigateToRoute("seller_portal.html");
    return;
  }
  if (!state.currentUser) {
    showModal("authModal");
    notify("Login is required before you can upload an outfit.", "info");
    return;
  }
  dom.uploadForm.reset();
  setUploadFeedback("");
  dom.uploadForm.querySelector("button[type='submit']").disabled = false;
  showModal("uploadModal");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) {
    showModal("authModal");
    setUploadFeedback("Login is required before submitting an outfit.", "error");
    return;
  }
  if (!ensureSupabase()) {
    setUploadFeedback("Supabase is not configured yet.", "error");
    return;
  }

  const title = dom.uploadTitle.value.trim();
  const category = dom.uploadCategory.value.trim();
  const description = dom.uploadDescription.value.trim();
  const requestedPrice = Number(dom.uploadPrice.value || 0);
  const files = [...dom.uploadImages.files];

  if (!title || !category || !description || requestedPrice <= 0) {
    setUploadFeedback("Complete all product fields before submitting.", "error");
    return;
  }
  if (files.length < 1 || files.length > 5) {
    setUploadFeedback("Upload between 1 and 5 images.", "error");
    return;
  }

  dom.uploadForm.querySelector("button[type='submit']").disabled = true;

  try {
    setUploadFeedback(`Preparing images... 0/${files.length}`, "info");
    let completed = 0;
    const processedImages = await Promise.all(files.map(async (file) => {
      const blob = await fileToOptimizedBlob(file);
      completed += 1;
      setUploadFeedback(`Preparing images... ${completed}/${files.length}`, "info");
      return { file, blob };
    }));

    const totalImageBytes = processedImages.reduce((sum, entry) => sum + entry.blob.size, 0);
    if (totalImageBytes > 2_400_000) {
      throw new Error(`Images are still too large after compression (${Math.ceil(totalImageBytes / 1024)} KB). Use smaller photos.`);
    }

    setUploadFeedback(`Uploading images... 0/${processedImages.length}`, "info");
    const imageUrls = [];
    for (let index = 0; index < processedImages.length; index += 1) {
      const { file, blob } = processedImages[index];
      const publicUrl = await uploadProductImage(file, blob);
      imageUrls.push(publicUrl);
      setUploadFeedback(`Uploading images... ${index + 1}/${processedImages.length}`, "info");
    }

    setUploadFeedback("Saving product for admin approval...", "info");
    const payload = {
      title,
      description,
      category,
      images: imageUrls,
      requested_price: requestedPrice,
      final_price: 0,
      seller_payout: requestedPrice,
      royalty_percent: 0,
      ownership_type: "marketplace",
      approved: false,
      active: true,
      condition: dom.uploadCondition.value,
      seller_id: state.currentUser.id,
      total_rentals: 0,
      max_rentals: 12,
      damage_state: "active"
    };

    const insertPromise = state.supabase.from("products").insert(payload);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Product save timed out. This usually means the payload is too large or the products policy is still blocking the insert.")), 15000);
    });
    const result = await Promise.race([insertPromise, timeoutPromise]);
    const error = result?.error;
    if (error) {
      throw new Error(`Product save failed: ${error.message}`);
    }

    dom.uploadForm.reset();
    setUploadFeedback("Submitted for admin approval.", "success");
    await refreshAllData();
    if (window.location.pathname.toLowerCase().includes("upload_outfit")) {
      window.location.href = "seller_portal.html";
      return;
    }
    hideModal("uploadModal");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    setUploadFeedback(message, "error");
    notify(message, "error");
  } finally {
    dom.uploadForm.querySelector("button[type='submit']").disabled = false;
  }
}

function handleUploadInvalid(event) {
  const field = event.target;
  if (!(field instanceof HTMLElement)) {
    return;
  }

  let label = "this field";
  const wrapper = field.closest(".field");
  const labelElement = wrapper?.querySelector("span");
  if (labelElement?.textContent) {
    label = labelElement.textContent.trim().toLowerCase();
  }

  setUploadFeedback(`Complete ${label} before submitting.`, "error");
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
  dom.rentalModalTitle.textContent = `Buy ${product.title}`;
  dom.rentalImage.src = product.images[0] || "";
  dom.rentalImage.alt = product.title;
  dom.rentalProductTitle.textContent = product.title;
  dom.rentalProductMeta.textContent = `${product.category || "Curated"} | ${formatCurrency(product.final_price)} | ${formatText(product.condition)}`;
  updateRentalQuote();
  showModal("rentalModal");
}

function updateRentalQuote() {
  const product = state.selectedProduct;
  const dailyRate = Number(product?.final_price || 0);
  const total = dailyRate;
  dom.rentalDays.textContent = "Direct purchase";
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
  state.cart.push({
    productId: product.id,
    lockId: `${product.id}-${Date.now()}`,
    bookingId: null,
    title: product.title,
    startDate: null,
    endDate: null,
    days: 1,
    dailyRate: product.final_price,
    lineTotal: product.final_price,
    blockedUntil: null
  });
  persistCart();
  renderCart();
  applyFilters();
  hideModal("rentalModal");
  notify("Product added to cart.", "success");
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

  if (item?.bookingId && ensureSupabase(true)) {
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

  const purchaseDate = new Date().toISOString().slice(0, 10);
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
    start_date: item.startDate || purchaseDate,
    end_date: item.endDate || purchaseDate,
    daily_rate: item.dailyRate,
    rental_days: item.days,
    line_total: item.lineTotal
  })));

  if (itemsRes.error) {
    notify(itemsRes.error.message, "error");
    return;
  }

  const bookingIds = state.cart.map((item) => item.bookingId).filter(Boolean);
  if (bookingIds.length) {
    const bookingRes = await state.supabase.from("bookings").update({ order_id: orderRes.data.id }).in("id", bookingIds);
    if (bookingRes.error) {
      notify(bookingRes.error.message, "error");
      return;
    }
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
        const amount = Number(product.seller_payout || 0);
        const type = "seller_payout";
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
          active: false
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
    if (Number(product.final_price || 0) <= 0) {
      notify("Set a site selling price before approving this product.", "error");
      openProductEditor(product);
      return;
    }
    await updateProduct(product.id, { approved: true, active: true, rejection_reason: null });
  }
  if (button.dataset.action === "reject-product") {
    openRejectModal(product);
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
  dom.editCondition.value = product.condition || "excellent";
  dom.editApproved.value = String(Boolean(product.approved));
  dom.editActive.value = String(Boolean(product.active));
  dom.editRejectionReason.value = product.rejection_reason || "";
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
    royalty_percent: 0,
    ownership_type: "marketplace",
    condition: dom.editCondition.value,
    approved: dom.editApproved.value === "true",
    active: dom.editActive.value === "true",
    rejection_reason: dom.editRejectionReason.value.trim() || null,
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

function openRejectModal(product) {
  dom.rejectProductId.value = product.id;
  dom.rejectReason.value = product.rejection_reason || "";
  showModal("rejectModal");
}

async function handleRejectSubmit(event) {
  event.preventDefault();
  const reason = dom.rejectReason.value.trim();
  if (!reason) {
    notify("Add a rejection reason for the seller.", "error");
    return;
  }
  await updateProduct(dom.rejectProductId.value, {
    approved: false,
    active: false,
    rejection_reason: reason
  });
  hideModal("rejectModal");
}

function toggleCart(show) {
  if (!dom.cartDrawer) {
    return;
  }
  dom.cartDrawer.classList.toggle("hidden", !show);
}

function showModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function hideModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function navigateToRoute(route) {
  window.location.href = route;
}

function cleanupExpiredCart() {
  const before = state.cart.length;
  state.cart = state.cart.filter((item) => !item.blockedUntil || new Date(item.blockedUntil) > new Date());
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

function setUploadFeedback(message, type = "info") {
  if (!dom.uploadFeedback) {
    return;
  }
  dom.uploadFeedback.textContent = message || "";
  dom.uploadFeedback.style.color = type === "error"
    ? "#ff9898"
    : type === "success"
      ? "#d4a94a"
      : "rgba(244, 220, 141, 0.82)";
}

function on(element, eventName, handler, options) {
  element?.addEventListener(eventName, handler, options);
}

async function fileToOptimizedBlob(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  const isScreenshot = /screenshot/i.test(file.name) || file.type === "image/png";
  const bitmap = await createImageBitmap(file);
  const maxDimension = isScreenshot ? 1280 : 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image processing is not supported in this browser.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, isScreenshot ? 0.82 : 0.88);

  if (!blob) {
    throw new Error("Could not compress image.");
  }

  if (blob.size > 1_800_000) {
    blob = await canvasToBlob(canvas, isScreenshot ? 0.72 : 0.8);
  }

  if (blob.size > 1_200_000) {
    blob = await canvasToBlob(canvas, isScreenshot ? 0.64 : 0.72);
  }

  if (blob.size > (isScreenshot ? 950_000 : 1_200_000)) {
    throw new Error(`One image is still too large after compression (${Math.ceil(blob.size / 1024)} KB). Use a smaller image.`);
  }

  return blob;
}

async function canvasToBlob(canvas, quality) {
  return await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function uploadProductImage(file, blob) {
  if (!state.currentUser) {
    throw new Error("You are no longer logged in. Log in again before uploading images.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.[^.]+$/, "") || "image";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const path = `${state.currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}.jpg`;
    const uploadPromise = state.supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Image upload timed out for ${file.name}. Check the products bucket, storage policies, and your current login session.`)), 90000);
    });

    try {
      const result = await Promise.race([uploadPromise, timeoutPromise]);
      if (result?.error) {
        throw new Error(`Image upload failed: ${result.error.message}`);
      }

      const { data } = state.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) {
        throw new Error("Could not generate a public image URL.");
      }

      return data.publicUrl;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
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

function getSellerPricingUpdateNote(product) {
  const requested = Number(product.requested_price || 0);
  const finalPrice = Number(product.final_price || 0);
  const payout = Number(product.seller_payout || 0);

  if (!requested) {
    return "";
  }

  if (finalPrice !== requested || payout !== requested) {
    return `Rewearly updated your payout offer to ${formatCurrency(payout)}.`;
  }

  return "";
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
