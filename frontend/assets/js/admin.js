import { initApp, api, qs, html, raw, mount, $, $$, money, icon, fmtDate, plural, statusBadge, STATUS, PAYMENT_METHODS, PAYMENT_STATUS,
  toast, setBusy, showFieldErrors, confirmDialog, debounce } from './app.js';

await initApp({ active: '', requireAdmin: true });
const root = $('#admin-root');
const TABS = ['overview', 'orders', 'products'];
const FLOW = ['placed', 'processing', 'shipped', 'delivered'];
const cats = (await api('/categories')).items;

let tab = 'overview';
function showTab(name) {
  tab = TABS.includes(name) ? name : 'overview';
  $$('[data-tab]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    b.setAttribute('aria-controls', 'admin-root');
  });
  ({ overview, orders, products })[tab]();
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

const loading = () => mount(root, html`<div class="skeleton sk-card"></div>`);
const fail = (err) => mount(root, html`<div class="empty">${icon('alert')}<h3>Something went wrong</h3><p>${err.message}</p></div>`);

/* one reusable dialog for order details and the product form */
const dlg = document.body.appendChild(document.createElement('dialog'));
dlg.className = 'dialog-wide dialog-scroll';
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close-dialog]')) dlg.close(); });
const openDialog = (tpl) => { mount(dlg, tpl); dlg.showModal(); };

/* ================================================================ overview */
async function overview() {
  loading();
  try {
    const s = await api('/admin/stats');
    mount(root, html`<div class="stack">
      <div class="stat-grid">
        <div class="card stat"><span class="label">Revenue</span><span class="value">${money(s.revenue)}</span></div>
        <div class="card stat"><span class="label">Orders</span><span class="value">${s.orders}</span></div>
        <div class="card stat"><span class="label">Customers</span><span class="value">${s.customers}</span></div>
        <div class="card stat"><span class="label">Active products</span><span class="value">${s.products}</span></div>
      </div>
      <div class="admin-grid">
        <section class="card"><h2 class="card-title">Recent orders</h2>
          ${s.recent_orders.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
            ${s.recent_orders.map((o) => html`<tr><td><button class="link" data-order="${o.id}">${o.order_number}</button></td><td>${o.user?.name ?? ''}</td><td class="num">${money(o.total)}</td><td>${statusBadge(o.status)}</td></tr>`)}
          </tbody></table></div>` : html`<p class="muted">No orders yet.</p>`}</section>
        <section class="card"><h2 class="card-title">Orders by status</h2>
          <div class="stack">${Object.keys(STATUS).map((k) => html`<div class="summary-row"><span>${STATUS[k].label}</span><strong class="num">${s.orders_by_status[k] ?? 0}</strong></div>`)}</div>
          <h2 class="card-title mt">Low stock</h2>
          ${s.low_stock.length ? html`<div class="stack">${s.low_stock.map((p) => html`<div class="summary-row"><span>${p.name}</span><span class="badge ${p.stock === 0 ? 'badge-danger' : 'badge-warn'}">${p.stock === 0 ? 'Sold out' : p.stock + ' left'}</span></div>`)}</div>`
            : html`<p class="muted">Everything is well stocked.</p>`}</section>
      </div></div>`);
  } catch (err) { fail(err); }
}

/* ================================================================== orders */
const ordersState = { status: '', q: '', page: 1 };
async function orders() {
  loading();
  try {
    const data = await api('/admin/orders' + qs(ordersState));
    mount(root, html`<div class="stack">
      <div class="row row-wrap">
        <select class="select inline-select" id="f-status" aria-label="Filter by status"><option value="">All statuses</option>${Object.keys(STATUS).map((k) => html`<option value="${k}" ${raw(ordersState.status === k ? 'selected' : '')}>${STATUS[k].label}</option>`)}</select>
        <input class="input" id="f-q" type="search" placeholder="Search order number, name or email" value="${ordersState.q}">
        <span class="muted">${plural(data.total, 'order')}</span></div>
      ${data.items.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Payment</th><th class="right">Total</th><th>Status</th></tr></thead><tbody>
        ${data.items.map((o) => html`<tr>
          <td><button class="link" data-order="${o.id}">${o.order_number}</button></td>
          <td>${o.shipping.name}<br><span class="muted">${o.user?.email ?? o.shipping.email}</span></td>
          <td>${fmtDate(o.created_at)}</td>
          <td>${PAYMENT_METHODS[o.payment_method]}<br><span class="muted">${PAYMENT_STATUS[o.payment_status]}</span></td>
          <td class="right num">${money(o.total)}</td>
          <td>${statusSelect(o)}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty"><h3>No orders found</h3></div>`}
      ${data.pages > 1 ? html`<nav class="pagination">${Array.from({ length: data.pages }, (_, i) => html`<button type="button" data-opage="${i + 1}" ${raw(data.page === i + 1 ? 'aria-current="page"' : '')}>${i + 1}</button>`)}</nav>` : ''}
    </div>`);
  } catch (err) { fail(err); }
}
function statusSelect(o) {
  if (o.status === 'delivered' || o.status === 'cancelled') return statusBadge(o.status);
  const idx = FLOW.indexOf(o.status);
  const options = [...FLOW.slice(idx), 'cancelled'];
  return html`<select class="select inline-select" data-set-status="${o.id}" aria-label="Status for ${o.order_number}">${options.map((k) => html`<option value="${k}" ${raw(k === o.status ? 'selected' : '')}>${STATUS[k].label}</option>`)}</select>`;
}
async function showOrder(id) {
  try {
    const o = (await api('/orders/' + id)).order;
    const s = o.shipping;
    openDialog(html`<div class="dialog-body">
      <div class="row"><h3>${o.order_number}</h3><span class="spacer"></span>${statusBadge(o.status)}</div>
      <p class="muted">Placed ${fmtDate(o.created_at, true)} · ${PAYMENT_METHODS[o.payment_method]} (${PAYMENT_STATUS[o.payment_status]})</p>
      <div>${o.items.map((i) => html`<div class="order-line"><div class="stage"><img src="${i.image}" alt=""></div><div><strong>${i.name}</strong><p class="muted">${money(i.unit_price)} × ${i.quantity}</p></div><span class="num">${money(i.line_total)}</span></div>`)}</div>
      <div class="summary-row"><span>Delivery</span><span class="num">${o.shipping_fee ? money(o.shipping_fee) : 'Free'}</span></div>
      <div class="summary-row total"><span>Total</span><span class="num">${money(o.total)}</span></div>
      <address><strong>${s.name}</strong><br>${s.address}<br>${s.city}, ${s.state} ${s.pincode}<br>${s.phone} · ${s.email}</address>
      <div class="dialog-actions"><button class="btn btn-secondary" data-close-dialog>Close</button></div></div>`);
  } catch (err) { toast(err.message, { type: 'error' }); }
}

/* ================================================================ products */
const prodState = { q: '', page: 1 };
let knownImages = [];
async function products() {
  loading();
  try {
    const data = await api('/admin/products' + qs({ ...prodState, per_page: 15 }));
    knownImages = [...new Set([...knownImages, ...data.items.map((p) => p.image)])];
    mount(root, html`<div class="stack">
      <div class="row row-wrap"><input class="input" id="p-q" type="search" placeholder="Search products" value="${prodState.q}">
        <span class="muted">${plural(data.total, 'product')}</span><span class="spacer"></span>
        <button class="btn btn-primary" data-new-product>${icon('plus')}Add product</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Product</th><th>Type</th><th class="right">Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
        ${data.items.map((p) => html`<tr>
          <td><img class="thumb" src="${p.image}" alt=""></td>
          <td><strong>${p.name}</strong><br><span class="muted">${p.brand}</span></td>
          <td>${p.subcategory}</td><td class="right num">${money(p.price)}</td>
          <td><input class="input stock-input" type="number" min="0" value="${p.stock}" data-stock="${p.id}" aria-label="Stock for ${p.name}"></td>
          <td>${p.active ? html`<span class="badge badge-ok">Visible</span>` : html`<span class="badge">Archived</span>`}</td>
          <td class="right"><button class="btn btn-ghost btn-sm" data-edit="${p.id}" aria-label="Edit ${p.name}">${icon('edit', 'icon-sm')}</button>
            <button class="btn btn-ghost btn-sm" data-toggle-active="${p.id}" data-active="${p.active ? 1 : 0}">${p.active ? 'Archive' : 'Restore'}</button></td></tr>`)}
      </tbody></table></div>
      ${data.pages > 1 ? html`<nav class="pagination">${Array.from({ length: data.pages }, (_, i) => html`<button type="button" data-ppage="${i + 1}" ${raw(data.page === i + 1 ? 'aria-current="page"' : '')}>${i + 1}</button>`)}</nav>` : ''}
    </div>`);
    root._products = Object.fromEntries(data.items.map((p) => [p.id, p]));
  } catch (err) { fail(err); }
}

function specRow(k = '', v = '') {
  return html`<div class="row" data-spec-row><input class="input" placeholder="Name (e.g. RAM)" value="${k}" aria-label="Spec name"><input class="input" placeholder="Value (e.g. 16GB DDR4)" value="${v}" aria-label="Spec value"><button class="btn btn-ghost btn-sm" type="button" data-remove-spec aria-label="Remove spec">${icon('x', 'icon-sm')}</button></div>`;
}
function productForm(p = null) {
  const cur = p || { category: 'laptops', subcategory: 'gaming', specs: {}, active: true, is_new: false, is_featured: false, stock: 10, price: '', image: '/assets/img/products/' };
  const subs = (cat) => cats.filter((c) => c.category === cat);
  openDialog(html`<form class="dialog-body" id="product-form" novalidate>
    <h3>${p ? 'Edit product' : 'Add product'}</h3>
    <div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" name="name" value="${cur.name || ''}"><p class="field-error" data-error-for="name"></p></div>
    <div class="field-row"><div class="field"><label for="pf-brand">Brand</label><input class="input" id="pf-brand" name="brand" value="${cur.brand || ''}"></div>
      <div class="field"><label for="pf-category">Category</label><select class="select" id="pf-category" name="category"><option value="laptops" ${raw(cur.category === 'laptops' ? 'selected' : '')}>Laptops</option><option value="accessories" ${raw(cur.category === 'accessories' ? 'selected' : '')}>Accessories</option></select></div>
      <div class="field"><label for="pf-sub">Type</label><select class="select" id="pf-sub" name="subcategory">${subs(cur.category).map((c) => html`<option value="${c.subcategory}" ${raw(cur.subcategory === c.subcategory ? 'selected' : '')}>${c.short}</option>`)}</select><p class="field-error" data-error-for="subcategory"></p></div></div>
    <div class="field-row"><div class="field"><label for="pf-price">Price (₹)</label><input class="input" id="pf-price" name="price" type="number" min="0" value="${cur.price}"><p class="field-error" data-error-for="price"></p></div>
      <div class="field"><label for="pf-stock">Stock</label><input class="input" id="pf-stock" name="stock" type="number" min="0" value="${cur.stock}"><p class="field-error" data-error-for="stock"></p></div></div>
    <div class="field"><label for="pf-image">Image path</label><input class="input" id="pf-image" name="image" list="images" value="${cur.image}"><datalist id="images">${knownImages.map((i) => html`<option value="${i}">`)}</datalist>
      <p class="field-hint">Copy the image into frontend/assets/img/products/ first, then enter its path.</p><p class="field-error" data-error-for="image"></p></div>
    <div class="field"><label for="pf-desc">Description</label><textarea class="textarea" id="pf-desc" name="description">${cur.description || ''}</textarea></div>
    <div class="field"><span class="label">Specifications</span><div class="specs-editor" id="specs-editor">${Object.entries(cur.specs).map(([k, v]) => specRow(k, v))}</div>
      <div><button class="btn btn-secondary btn-sm" type="button" data-add-spec>${icon('plus', 'icon-sm')}Add spec</button></div></div>
    <div class="row row-wrap"><label class="check"><input type="checkbox" name="active" ${raw(cur.active ? 'checked' : '')}>Visible in store</label>
      <label class="check"><input type="checkbox" name="is_new" ${raw(cur.is_new ? 'checked' : '')}>New arrival</label>
      <label class="check"><input type="checkbox" name="is_featured" ${raw(cur.is_featured ? 'checked' : '')}>Featured</label></div>
    <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-primary" type="submit">${p ? 'Save changes' : 'Add product'}</button></div>
  </form>`);
  const form = $('#product-form');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'category') mount($('#pf-sub'), html`${subs(e.target.value).map((c) => html`<option value="${c.subcategory}">${c.short}</option>`)}`);
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-spec]')) $('#specs-editor').insertAdjacentHTML('beforeend', specRow().s);
    const rm = e.target.closest('[data-remove-spec]');
    if (rm) rm.closest('[data-spec-row]').remove();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const specs = {};
    $$('[data-spec-row]', form).forEach((r) => { const [k, v] = $$('input', r); if (k.value.trim() && v.value.trim()) specs[k.value.trim()] = v.value.trim(); });
    const body = { name: f.name.value, brand: f.brand.value, category: f.category.value, subcategory: f.subcategory.value, price: f.price.value,
      stock: f.stock.value, image: f.image.value, description: f.description.value, specs, active: f.active.checked, is_new: f.is_new.checked, is_featured: f.is_featured.checked };
    const btn = $('[type=submit]', form);
    setBusy(btn, true);
    try {
      await api(p ? `/admin/products/${p.id}` : '/admin/products', { method: p ? 'PUT' : 'POST', body });
      dlg.close(); toast(p ? 'Product saved' : 'Product added'); products();
    } catch (err) { setBusy(btn, false); if (!showFieldErrors(form, err)) toast(err.message, { type: 'error' }); }
  });
}

/* ================================================================== events */
root.addEventListener('click', async (e) => {
  const order = e.target.closest('[data-order]');
  if (order) return showOrder(order.dataset.order);
  const op = e.target.closest('[data-opage]');
  if (op) { ordersState.page = Number(op.dataset.opage); return orders(); }
  const pp = e.target.closest('[data-ppage]');
  if (pp) { prodState.page = Number(pp.dataset.ppage); return products(); }
  if (e.target.closest('[data-new-product]')) return productForm();
  const edit = e.target.closest('[data-edit]');
  if (edit) return productForm(root._products[edit.dataset.edit]);
  const tog = e.target.closest('[data-toggle-active]');
  if (tog) {
    const p = root._products[tog.dataset.toggleActive];
    const archiving = tog.dataset.active === '1';
    if (archiving && !(await confirmDialog({ title: `Archive ${p.name}?`, message: 'It disappears from the store and from customers\' carts. Past orders are kept, and you can restore it later.', confirmLabel: 'Archive', danger: true, cancelLabel: 'Cancel' }))) return;
    try { await api(`/admin/products/${p.id}`, archiving ? { method: 'DELETE' } : { method: 'PUT', body: { active: true } }); toast(archiving ? 'Product archived' : 'Product restored'); products(); }
    catch (err) { toast(err.message, { type: 'error' }); }
  }
});
root.addEventListener('change', async (e) => {
  if (e.target.id === 'f-status') { ordersState.status = e.target.value; ordersState.page = 1; return orders(); }
  const st = e.target.closest('[data-set-status]');
  if (st) {
    if (e.target.value === 'cancelled' && !(await confirmDialog({ title: 'Cancel this order?', message: 'Stock is returned and any online payment is marked as refunded.', confirmLabel: 'Cancel order', danger: true, cancelLabel: 'Keep order' }))) return orders();
    try { await api('/admin/orders/' + st.dataset.setStatus, { method: 'PATCH', body: { status: e.target.value } }); toast('Order updated'); }
    catch (err) { toast(err.message, { type: 'error' }); }
    return orders();
  }
  const stock = e.target.closest('[data-stock]');
  if (stock) {
    try { await api('/admin/products/' + stock.dataset.stock, { method: 'PUT', body: { stock: stock.value } }); toast('Stock updated'); }
    catch (err) { toast(err.message, { type: 'error' }); products(); }
  }
});
root.addEventListener('input', debounce((e) => {
  if (e.target.id === 'f-q') { ordersState.q = e.target.value; ordersState.page = 1; orders().then(() => $('#f-q')?.focus()); }
  if (e.target.id === 'p-q') { prodState.q = e.target.value; prodState.page = 1; products().then(() => { const i = $('#p-q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }); }
}, 350));

showTab(location.hash.slice(1));
