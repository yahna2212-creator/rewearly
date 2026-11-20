  }
}
async function loadSellerDashboard() {
  state.sellerProducts = [];
  state.sellerEarnings = [];
  state.sellerOrderItems = [];
  if (state.currentUser) {
    try {
      const data = await api("/seller");
      state.sellerProducts = data.products.map(normalizeProduct);
      state.sellerEarnings = data.earnings;
      state.sellerOrderItems = data.items;
    } catch (error) { notify(error.message, "error"); }
  }
  renderSellerDashboard();
}
async function loadAdminDashboard() {
  state.adminProducts = [];
  state.adminOrders = [];
  state.adminEarnings = [];
  if (isAdmin()) {
    try {
      const data = await api("/admin");
      state.adminProducts = data.products.map(normalizeProduct);
      state.adminOrders = data.orders;
      state.adminEarnings = data.earnings;
    } catch (error) { notify(error.message, "error"); }
  }
  renderAdminDashboard();
}

function normalizeProduct(product) {
  return {
    ...product,
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    final_price: Number(product.final_price || product.requested_price || 0),
    requested_price: Number(product.requested_price || 0),
    seller_payout: Number(product.seller_payout || 0),
    seller_confirmed: Boolean(product.seller_confirmed),
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
