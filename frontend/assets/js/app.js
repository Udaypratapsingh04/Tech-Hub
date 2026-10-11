/* TECH HUB - shared client core: API, auth, cart, compare, layout chrome, UI helpers. */

/* ============================================================ templating */
// `html` escapes every interpolated value unless it was produced by html`` itself
// (or wrapped in raw()), so user-supplied text can never inject markup.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const render = (v) => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : (v == null || v === false) ? '' : esc(v);
export const html = (strings, ...vals) => new Raw(strings.reduce((out, str, i) => out + str + (i < vals.length ? render(vals[i]) : ''), ''));

/** Put a template into an element. CSP forbids inline style="", so widths are set via data-w here. */
export function mount(el, tpl) {
  el.innerHTML = tpl instanceof Raw ? tpl.s : esc(tpl);
  el.querySelectorAll('[data-w]').forEach((n) => { n.style.width = n.dataset.w + '%'; });
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ================================================================== API */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
    this.details = body?.error?.details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { error: { message: "Can't reach the server. Check your connection and try again." } });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? '1' : v); });
  const s = p.toString();
  return s ? '?' + s : '';
};

/* ============================================================ formatting */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n) => inr.format(n ?? 0);
export const fmtDate = (iso, withTime = false) => new Date(iso).toLocaleString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
});
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const productUrl = (p) => '/product?slug=' + encodeURIComponent(p.slug);
export const shopUrl = (params) => '/shop' + qs(params);

export const STATUS = {
  placed: { label: 'Order placed', cls: 'badge-accent' },
  processing: { label: 'Processing', cls: 'badge-accent' },
  shipped: { label: 'Shipped', cls: 'badge-warn' },
  delivered: { label: 'Delivered', cls: 'badge-ok' },
  cancelled: { label: 'Cancelled', cls: 'badge-danger' },
};
export const statusBadge = (s) => html`<span class="badge ${STATUS[s]?.cls}">${STATUS[s]?.label ?? s}</span>`;
export const PAYMENT_METHODS = { card: 'Credit / debit card', upi: 'UPI', netbanking: 'Net banking', cod: 'Cash on delivery' };
export const PAYMENT_STATUS = { paid: 'Paid', pending: 'Payable on delivery', refunded: 'Refunded', void: 'Not charged' };

/* ================================================================== icons */
const ICONS = {
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.8l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L20.5 7H6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  columns: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  truck: '<path d="M2 6.5h11v9H2zM13 9.5h4.2l3.3 3.3v2.7H13"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  package: '<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9L12 3ZM3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.7C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'log-out': '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M16 8l4 4-4 4M20 12H9"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3ZM14 7l3 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.5h.01"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9ZM3 7.5 12 12l9-4.5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
};
const STAR = 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z';
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" class="visually-hidden" aria-hidden="true"><defs><clipPath id="half-clip"><rect x="0" y="0" width="12" height="24"/></clipPath></defs>
${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}
<symbol id="i-star-full" viewBox="0 0 24 24"><path fill="currentColor" d="${STAR}"/></symbol>
<symbol id="i-star-empty" viewBox="0 0 24 24"><path d="${STAR}"/></symbol>
<symbol id="i-star-half" viewBox="0 0 24 24"><path d="${STAR}"/><path fill="currentColor" clip-path="url(#half-clip)" d="${STAR}"/></symbol></svg>`;

export const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`);

export function stars(avg, large = false) {
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<svg class="icon" aria-hidden="true"><use href="#i-star-${avg >= i - 0.25 ? 'full' : avg >= i - 0.75 ? 'half' : 'empty'}"/></svg>`;
  return raw(`<span class="stars ${large ? 'stars-lg' : ''}" role="img" aria-label="${Number(avg).toFixed(1)} out of 5 stars">${out}</span>`);
}

/* ============================================================ UI helpers */
let toastBox;
export function toast(message, { type = 'info', href, action, timeout = 3800 } = {}) {
  toastBox ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts', role: 'status', ariaLive: 'polite' }));
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  mount(el, html`${icon(type === 'error' ? 'alert' : 'check-circle')}<span>${message}</span>${href ? html`<a href="${href}">${action}</a>` : ''}`);
  toastBox.append(el);
  setTimeout(() => el.remove(), timeout);
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Keep it' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    mount(dlg, html`<form method="dialog" class="dialog-body"><h3>${title}</h3><p class="muted">${message}</p>
      <div class="dialog-actions"><button class="btn btn-secondary" value="no">${cancelLabel}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="yes">${confirmLabel}</button></div></form>`);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Show server-side field errors next to their inputs. Returns true if any were shown. */
export function showFieldErrors(form, err, prefix = '') {
  $$('.field-error', form).forEach((n) => { n.textContent = ''; });
  $$('[aria-invalid]', form).forEach((n) => n.removeAttribute('aria-invalid'));
  let first = null;
  for (const [key, msg] of Object.entries(err.fields || {})) {
    const name = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
    const input = form.elements[name];
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    if (slot) slot.textContent = msg;
    if (input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
  }
  first?.focus();
  return Boolean(first);
}

export function setBusy(btn, busy, label) {
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; mount(btn, html`<span class="spinner"></span>${label || ''}`); }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/');

/* =================================================================== store */
export const store = { freeShippingThreshold: 5000, shippingFee: 99, maxQty: 10 };

/* ==================================================================== auth */
export const auth = {
  user: null,
  async load() { this.user = (await api('/auth/me')).user; return this.user; },
  async login(email, password) {
    this.user = (await api('/auth/login', { method: 'POST', body: { email, password } })).user;
    await cart.onLogin();
    return this.user;
  },
  async register(body) {
    this.user = (await api('/auth/register', { method: 'POST', body })).user;
    await cart.onLogin();
    return this.user;
  },
  async logout() {
    await api('/auth/logout', { method: 'POST' });
    this.user = null;
    cart._set(cart.localCount());
  },
  /** Redirect to login (returning here afterwards) if nobody is signed in. */
  require() {
    if (this.user) return true;
    location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
    return false;
  },
};

/* ==================================================================== cart */
const CART_KEY = 'th-cart';
const emptyQuote = () => ({ lines: [], unavailable: [], item_count: 0, subtotal: 0, shipping_fee: 0, total: 0,
  free_shipping_threshold: store.freeShippingThreshold, amount_to_free_shipping: store.freeShippingThreshold });
const readLocal = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
const writeLocal = (items) => localStorage.setItem(CART_KEY, JSON.stringify(items));

export const cart = {
  count: 0,
  localCount() { return readLocal().reduce((n, i) => n + i.quantity, 0); },
  _set(n) {
    this.count = n;
    window.dispatchEvent(new CustomEvent('cart:change', { detail: n }));
  },
  async get() {
    let q;
    if (auth.user) q = await api('/cart');
    else {
      const items = readLocal();
      q = items.length ? await api('/cart/quote', { method: 'POST', body: { items } }) : emptyQuote();
      if (q.unavailable?.length) writeLocal(items.filter((i) => !q.unavailable.includes(i.product_id)));
    }
    this._set(q.item_count);
    return q;
  },
  async add(productId, qty = 1) {
    if (auth.user) {
      const q = await api('/cart/items', { method: 'POST', body: { product_id: productId, quantity: qty } });
      this._set(q.item_count);
      return;
    }
    const items = readLocal();
    const found = items.find((i) => i.product_id === productId);
    if (found) found.quantity = Math.min(found.quantity + qty, store.maxQty);
    else items.push({ product_id: productId, quantity: Math.min(qty, store.maxQty) });
    writeLocal(items);
    this._set(this.localCount());
  },
  async setQty(productId, qty) {
    if (auth.user) {
      const q = await api(`/cart/items/${productId}`, { method: 'PUT', body: { quantity: qty } });
      this._set(q.item_count);
      return q;
    }
    writeLocal(readLocal().map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0));
    return this.get();
  },
  remove(productId) { return this.setQty(productId, 0); },
  async clear() {
    if (auth.user) await api('/cart', { method: 'DELETE' });
    writeLocal([]);
    this._set(0);
  },
  /** After login: fold the guest cart into the account cart. */
  async onLogin() {
    const items = readLocal();
    if (items.length) { await api('/cart/merge', { method: 'POST', body: { items } }).catch(() => {}); writeLocal([]); }
    const q = await api('/cart').catch(() => null);
    if (q) this._set(q.item_count);
  },
};

/* ================================================================= compare */
const CMP_KEY = 'th-compare';
export const compare = {
  max: 4,
  ids() { try { return JSON.parse(localStorage.getItem(CMP_KEY)) || []; } catch { return []; } },
  has(id) { return this.ids().includes(id); },
  _save(ids) { localStorage.setItem(CMP_KEY, JSON.stringify(ids)); window.dispatchEvent(new CustomEvent('compare:change')); },
  toggle(id) {
    const ids = this.ids();
    if (ids.includes(id)) { this._save(ids.filter((i) => i !== id)); return true; }
    if (ids.length >= this.max) { toast(`You can compare up to ${this.max} products at a time.`, { type: 'error' }); return false; }
    this._save([...ids, id]);
    return true;
  },
  remove(id) { this._save(this.ids().filter((i) => i !== id)); },
  clear() { this._save([]); },
};

/* ================================================================ products */
const KEY_SPECS = ['Processor', 'RAM', 'Storage'];
export function productCard(p) {
  const specs = p.category === 'laptops'
    ? KEY_SPECS.filter((k) => p.specs[k]).map((k) => [k, p.specs[k]])
    : Object.entries(p.specs).slice(0, 3);
  const canBuy = p.in_stock;
  return html`<article class="product-card">
    <a class="stage" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">
      <img src="${p.image}" alt="" loading="lazy" decoding="async">
      <span class="badges">${p.is_new ? html`<span class="badge badge-accent">New</span>` : ''}${!p.in_stock ? html`<span class="badge badge-danger">Sold out</span>` : p.low_stock ? html`<span class="badge badge-warn">Only ${p.stock} left</span>` : ''}</span>
    </a>
    <div class="pc-body">
      <p class="pc-brand">${p.brand || p.subcategory}</p>
      <h3 class="pc-name"><a href="${productUrl(p)}">${p.name}</a></h3>
      <div class="rating-line">${p.rating?.count ? html`${stars(p.rating.average)}<span>${p.rating.average} (${p.rating.count})</span>` : ''}</div>
      ${specs.length ? html`<dl class="spec-list">${specs.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
      <div class="pc-foot">
        <span class="price">${money(p.price)}</span>
        <button class="btn btn-primary btn-sm" data-add="${p.id}" ${canBuy ? '' : 'disabled'}>${canBuy ? 'Add to cart' : 'Sold out'}</button>
      </div>
      ${p.category === 'laptops' ? html`<label class="compare-toggle"><input type="checkbox" data-compare="${p.id}" ${compare.has(p.id) ? 'checked' : ''}> Add to compare</label>` : ''}
    </div>
  </article>`;
}
export const skeletons = (n = 8) => raw(Array.from({ length: n }, () => '<div class="skeleton sk-card"></div>').join(''));

/* ============================================================ page chrome */
const NAV = [
  ['Gaming', shopUrl({ category: 'laptops', subcategory: 'gaming' }), 'gaming'],
  ['Students', shopUrl({ category: 'laptops', subcategory: 'students' }), 'students'],
  ['Creators', shopUrl({ category: 'laptops', subcategory: 'creators' }), 'creators'],
  ['Chromebooks', shopUrl({ category: 'laptops', subcategory: 'chromebooks' }), 'chromebooks'],
  ['Accessories', shopUrl({ category: 'accessories' }), 'accessories'],
  ['New arrivals', shopUrl({ is_new: 1 }), 'new'],
  ['Compare', '/compare', 'compare'],
];

function headerHTML(active) {
  return html`<a class="skip-link" href="#main">Skip to content</a>
  <div class="announce"><div class="container">Free delivery on orders over ${money(store.freeShippingThreshold)}</div></div>
  <header class="site-header">
    <div class="container header-main">
      <a class="brand" href="/" aria-label="TECH HUB home"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9"/><path d="M9 11h14M16 11v11"/></svg>TECH HUB</a>
      <form class="search" role="search" action="/shop" autocomplete="off">
        ${icon('search')}
        <input type="search" name="q" placeholder="Search products" aria-label="Search products" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list">
        <div class="search-results" id="search-results" role="listbox" hidden></div>
      </form>
      <div class="header-actions">
        <button class="icon-btn theme-btn" type="button" aria-label="Toggle dark mode" data-theme-toggle>${icon('sun', 'i-sun')}${icon('moon', 'i-moon')}</button>
        <a class="icon-btn" href="/compare" aria-label="Compare products">${icon('columns')}<span class="count-badge" data-compare-count hidden>0</span></a>
        <div class="menu-wrap" data-account></div>
        <a class="icon-btn" href="/cart" aria-label="Cart">${icon('cart')}<span class="count-badge" data-cart-count hidden>0</span></a>
      </div>
    </div>
    <nav class="nav-bar" aria-label="Main"><div class="container nav-scroll">
      ${NAV.map(([label, href, key]) => html`<a class="nav-link" href="${href}" ${active === key ? raw('aria-current="page"') : ''}>${label}</a>`)}
    </div></nav>
  </header>`;
}

function footerHTML() {
  return html`<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div><a class="brand" href="/"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9"/><path d="M9 11h14M16 11v11"/></svg>TECH HUB</a>
        <p>Laptops and accessories, compared honestly. Find the machine that fits how you work.</p></div>
      <div><h4>Shop</h4><ul>
        <li><a href="${shopUrl({ category: 'laptops' })}">All laptops</a></li>
        <li><a href="${shopUrl({ category: 'accessories' })}">Accessories</a></li>
        <li><a href="${shopUrl({ is_new: 1 })}">New arrivals</a></li>
        <li><a href="/compare">Compare laptops</a></li></ul></div>
      <div><h4>Account</h4><ul>
        <li><a href="/account">My orders</a></li><li><a href="/account#profile">Profile</a></li>
        <li><a href="/cart">Cart</a></li></ul></div>
      <div><h4>Contact</h4><ul><li>info@techhub.com</li><li>+91 98765 43210</li></ul></div>
    </div>
    <div class="footer-base"><span>&copy; ${new Date().getFullYear()} TECH HUB</span><span>Demo store: no real payments are taken.</span></div>
  </div></footer>`;
}

function renderAccount() {
  const slot = $('[data-account]');
  if (!slot) return;
  const u = auth.user;
  if (!u) {
    mount(slot, html`<a class="icon-btn has-label" href="${'/login?next=' + encodeURIComponent(location.pathname + location.search)}">${icon('user')}<span class="label">Log in</span></a>`);
    return;
  }
  mount(slot, html`<button class="icon-btn has-label" type="button" aria-haspopup="true" aria-expanded="false" data-menu-btn>${icon('user')}<span class="label">${u.name.split(' ')[0]}</span></button>
    <div class="menu" role="menu" hidden>
      <div class="menu-head"><strong>${u.name}</strong><span>${u.email}</span></div>
      <a href="/account" role="menuitem">${icon('package')}My orders</a>
      <a href="/account#profile" role="menuitem">${icon('user')}Profile</a>
      ${u.is_admin ? html`<a href="/admin" role="menuitem">${icon('dashboard')}Admin dashboard</a>` : ''}
      <button type="button" role="menuitem" data-logout>${icon('log-out')}Log out</button>
    </div>`);
}

function wireSearch() {
  const form = $('.search');
  const input = $('input', form);
  const box = $('.search-results', form);
  let items = [], active = -1;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = () => $$('.search-item', box).forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    try {
      const data = await api('/products' + qs({ q, per_page: 5 }));
      items = data.items;
      mount(box, items.length
        ? html`${items.map((p) => html`<a class="search-item" role="option" href="${productUrl(p)}"><img src="${p.image}" alt=""><span class="name">${p.name}</span><span class="price">${money(p.price)}</span></a>`)}
            <a class="search-all" href="${shopUrl({ q })}">See all ${data.total} results</a>`
        : html`<p class="search-empty">No products match "${q}".</p>`);
      box.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
    } catch { close(); }
  });
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = productUrl(items[active]); }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
  form.addEventListener('submit', (e) => { if (!input.value.trim()) e.preventDefault(); });
}

let trayEl, trayProducts = new Map();
async function renderTray() {
  if (['compare', 'checkout', 'admin', 'login', 'signup'].includes(document.body.dataset.page)) return;
  const ids = compare.ids();
  trayEl ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'compare-tray', hidden: true }));
  if (!ids.length) { trayEl.hidden = true; return; }
  const missing = ids.filter((id) => !trayProducts.has(id));
  if (missing.length) {
    try { (await api('/compare?ids=' + ids.join(','))).items.forEach((p) => trayProducts.set(p.id, p)); } catch { return; }
  }
  const items = ids.map((id) => trayProducts.get(id)).filter(Boolean);
  mount(trayEl, html`<div class="thumbs">${items.map((p) => html`<img src="${p.image}" alt="${p.name}">`)}</div>
    <span>${plural(items.length, 'laptop')} selected</span>
    <a class="btn btn-primary btn-sm" href="${'/compare?ids=' + ids.join(',')}">Compare</a>
    <button class="btn btn-ghost btn-sm" type="button" data-compare-clear>Clear</button>`);
  trayEl.hidden = false;
}

function syncBadges() {
  const c = $('[data-cart-count]');
  if (c) { c.textContent = cart.count; c.hidden = cart.count === 0; }
  const n = compare.ids().length;
  const k = $('[data-compare-count]');
  if (k) { k.textContent = n; k.hidden = n === 0; }
  $$('[data-compare]').forEach((box) => { box.checked = compare.has(Number(box.dataset.compare)); });
}

function wireGlobalEvents() {
  document.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      add.disabled = true;
      try { await cart.add(Number(add.dataset.add)); toast('Added to your cart', { href: '/cart', action: 'View cart' }); }
      catch (err) { toast(err.message, { type: 'error' }); }
      add.disabled = false;
      return;
    }
    if (e.target.closest('[data-compare-clear]')) { compare.clear(); return; }
    if (e.target.closest('[data-theme-toggle]')) {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      try { localStorage.setItem('th-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
      return;
    }
    const menuBtn = e.target.closest('[data-menu-btn]');
    const menu = $('[data-account] .menu');
    if (menuBtn) { menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (e.target.closest('[data-logout]')) {
      await auth.logout();
      if (['account', 'checkout', 'order', 'admin'].includes(document.body.dataset.page)) location.href = '/';
      else { renderAccount(); toast('You have been logged out.'); }
      return;
    }
    if (menu && !menu.hidden && !menu.contains(e.target)) menu.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const m = $('[data-account] .menu'); if (m && !m.hidden) { m.hidden = true; $('[data-menu-btn]')?.focus(); } }
  });
  document.addEventListener('change', (e) => {
    const box = e.target.closest('[data-compare]');
    if (box) { const ok = compare.toggle(Number(box.dataset.compare)); if (!ok) box.checked = false; }
  });
  window.addEventListener('cart:change', syncBadges);
  window.addEventListener('compare:change', () => { syncBadges(); renderTray(); });
  window.addEventListener('storage', () => { syncBadges(); renderTray(); });
}

/**
 * Boot a page: inject header/footer, load the session + store rules, wire global handlers.
 * Resolves once auth state is known, so page scripts can rely on `auth.user`.
 */
export async function initApp({ active = '', requireAuth = false, requireAdmin = false } = {}) {
  document.body.insertAdjacentHTML('afterbegin', SPRITE);
  const [cfg] = await Promise.all([api('/config').catch(() => null), auth.load().catch(() => null)]);
  if (cfg) { store.freeShippingThreshold = cfg.free_shipping_threshold; store.shippingFee = cfg.shipping_fee; store.maxQty = cfg.max_qty_per_item; }

  if (requireAuth && !auth.require()) return new Promise(() => {});
  if (requireAdmin && !auth.user?.is_admin) {
    if (!auth.user) auth.require(); else location.replace('/');
    return new Promise(() => {});
  }

  const header = $('#site-header'), footer = $('#site-footer');
  if (header) mount(header, headerHTML(active));
  if (footer) mount(footer, footerHTML());
  renderAccount();
  wireSearch();
  wireGlobalEvents();
  syncBadges();
  renderTray();
  cart._set(auth.user ? (await api('/cart').then((q) => q.item_count).catch(() => 0)) : cart.localCount());
  return auth.user;
}
