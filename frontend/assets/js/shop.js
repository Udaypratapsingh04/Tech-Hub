import { initApp, api, html, raw, mount, $, $$, qs, money, plural, icon, productCard, skeletons, shopUrl } from './app.js';

const PER_PAGE = 12;
const KEYS = ['category', 'subcategory', 'q', 'brand', 'min_price', 'max_price', 'in_stock', 'is_new', 'sort', 'page'];

const readState = () => {
  const p = new URLSearchParams(location.search);
  return Object.fromEntries(KEYS.map((k) => [k, p.get(k) || '']).filter(([, v]) => v));
};
let state = readState();
let cats = [];
let token = 0; // ignore responses from superseded requests

const active = () => (state.is_new ? 'new' : state.subcategory || state.category || '');
await initApp({ active: active() });
cats = (await api('/categories')).items;

/* ------------------------------------------------------------ navigation */
function go(patch, { replace = false } = {}) {
  const next = { ...state, ...patch };
  if (!('page' in patch)) delete next.page;
  Object.keys(next).forEach((k) => { if (!next[k] || next[k] === '0') delete next[k]; });
  state = next;
  history[replace ? 'replaceState' : 'pushState'](null, '', shopUrl(state));
  load();
}
window.addEventListener('popstate', () => { state = readState(); load(); });

/* --------------------------------------------------------------- rendering */
const subLabel = () => cats.find((c) => c.subcategory === state.subcategory)?.label;

function renderHeading(total) {
  let title = 'All products';
  if (state.q) title = `Results for “${state.q}”`;
  else if (state.is_new) title = 'New arrivals';
  else if (state.subcategory) title = subLabel() || 'Products';
  else if (state.category) title = state.category === 'laptops' ? 'Laptops' : 'Accessories';
  $('#shop-title').textContent = title;
  document.title = `${title} | TECH HUB`;
  $('#shop-sub').textContent = state.q || state.is_new ? '' : state.category === 'laptops'
    ? 'Compare specs and add up to four models to the comparison table.' : state.category === 'accessories' ? 'Peripherals that work with every laptop we sell.' : '';
  const crumbs = [['Home', '/']];
  if (state.category) crumbs.push([state.category === 'laptops' ? 'Laptops' : 'Accessories', shopUrl({ category: state.category })]);
  if (state.subcategory) crumbs.push([subLabel() || state.subcategory, null]);
  else if (!state.category) crumbs.push([title, null]);
  mount($('#crumbs'), html`${crumbs.map(([label, href], i) => html`${i ? icon('chevron-right') : ''}${href ? html`<a href="${href}">${label}</a>` : html`<span aria-current="page">${label}</span>`}`)}`);
  $('#result-count').textContent = plural(total, 'product');
}

function categoryLinks() {
  const link = (label, patch, count, isActive, sub = false) => html`<li><a class="${sub ? 'sub' : ''}" href="${shopUrl({ ...patch, sort: state.sort })}"
      data-set="${JSON.stringify({ category: '', subcategory: '', is_new: '', brand: '', ...patch })}" ${raw(isActive ? 'aria-current="true"' : '')}><span>${label}</span><span>${count}</span></a></li>`;
  const sum = (cat) => cats.filter((c) => c.category === cat).reduce((n, c) => n + c.count, 0);
  const group = (cat, label) => html`${link(label, { category: cat }, sum(cat), state.category === cat && !state.subcategory && !state.is_new)}
    ${cats.filter((c) => c.category === cat).map((c) => link(c.short, { category: cat, subcategory: c.subcategory }, c.count, state.subcategory === c.subcategory, true))}`;
  return html`<ul class="filter-list">${link('All products', {}, sum('laptops') + sum('accessories'), !state.category && !state.is_new)}
    ${group('laptops', 'Laptops')}${group('accessories', 'Accessories')}</ul>`;
}

function renderFilters(facets) {
  const brands = (state.brand || '').split(',').filter(Boolean);
  mount($('#filters'), html`
    <div class="filters-close"><h2>Filters</h2><button class="btn btn-ghost btn-sm" type="button" data-close-filters>${icon('x', 'icon-sm')}Close</button></div>
    <div class="filter-group"><h3>Category</h3>${categoryLinks()}</div>
    <form class="filter-group" id="price-form"><h3>Price (₹)</h3>
      <div class="price-inputs">
        <input class="input" name="min_price" type="number" min="0" inputmode="numeric" placeholder="${facets.price.min}" value="${state.min_price || ''}" aria-label="Minimum price">
        <input class="input" name="max_price" type="number" min="0" inputmode="numeric" placeholder="${facets.price.max}" value="${state.max_price || ''}" aria-label="Maximum price">
        <button class="btn btn-secondary btn-sm" type="submit">Apply</button>
      </div></form>
    ${facets.brands.length ? html`<div class="filter-group"><h3>Brand</h3><div class="stack">
      ${facets.brands.map((b) => html`<label class="check"><input type="checkbox" data-brand="${b.name}" ${raw(brands.includes(b.name) ? 'checked' : '')}>${b.name} <span class="muted">(${b.count})</span></label>`)}</div></div>` : ''}
    <div class="filter-group"><h3>Availability</h3><label class="check"><input type="checkbox" id="in-stock" ${raw(state.in_stock ? 'checked' : '')}>In stock only</label></div>`);
}

function renderChips() {
  const chips = [];
  if (state.q) chips.push([`Search: ${state.q}`, { q: '' }]);
  (state.brand || '').split(',').filter(Boolean).forEach((b) => chips.push([b, { brand: state.brand.split(',').filter((x) => x !== b).join(',') }]));
  if (state.min_price || state.max_price) chips.push([`${state.min_price ? money(state.min_price) : 'Any'} to ${state.max_price ? money(state.max_price) : 'any'}`, { min_price: '', max_price: '' }]);
  if (state.in_stock) chips.push(['In stock', { in_stock: '' }]);
  const box = $('#active-filters');
  mount(box, chips.length ? html`${chips.map(([label, patch]) => html`<span class="chip">${label}<button type="button" aria-label="Remove filter ${label}" data-set="${JSON.stringify(patch)}">${icon('x', 'icon-sm')}</button></span>`)}
    <button class="btn btn-ghost btn-sm" type="button" data-set="${JSON.stringify({ q: '', brand: '', min_price: '', max_price: '', in_stock: '' })}">Clear all</button>` : '');
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out = []; let prev = 0;
  [...set].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
}
function renderPagination(page, pages) {
  mount($('#pagination'), pages <= 1 ? html`` : html`
    <button type="button" data-page="${page - 1}" ${raw(page === 1 ? 'disabled' : '')} aria-label="Previous page">Previous</button>
    ${pageList(page, pages).map((n) => n === '…' ? html`<span class="muted">…</span>` : html`<button type="button" data-page="${n}" ${raw(n === page ? 'aria-current="page"' : '')} aria-label="Page ${n}">${n}</button>`)}
    <button type="button" data-page="${page + 1}" ${raw(page === pages ? 'disabled' : '')} aria-label="Next page">Next</button>`);
}

async function load() {
  const mine = ++token;
  mount($('#grid'), skeletons(6));
  $('#sort').value = state.sort || 'featured';
  try {
    const data = await api('/products' + qs({ ...state, per_page: PER_PAGE }));
    if (mine !== token) return;
    renderHeading(data.total);
    renderFilters(data.facets);
    renderChips();
    renderPagination(data.page, data.pages);
    mount($('#grid'), data.items.length ? html`${data.items.map(productCard)}` : html`<div class="empty">${icon('search')}<h3>No products match these filters</h3>
        <p>Try removing a filter or searching for something broader.</p>
        <button class="btn btn-primary" type="button" data-set="${JSON.stringify({ q: '', brand: '', min_price: '', max_price: '', in_stock: '' })}">Clear filters</button></div>`);
  } catch (err) {
    if (mine !== token) return;
    mount($('#grid'), html`<div class="empty">${icon('alert')}<h3>Couldn't load products</h3><p>${err.message}</p><button class="btn btn-primary" type="button" data-retry>Try again</button></div>`);
  }
}

/* ------------------------------------------------------------------ events */
document.addEventListener('click', (e) => {
  const set = e.target.closest('[data-set]');
  if (set && $('#main').contains(set)) { e.preventDefault(); go(JSON.parse(set.dataset.set)); $('#filters').classList.remove('is-open'); return; }
  const pg = e.target.closest('[data-page]');
  if (pg && !pg.disabled) { go({ page: pg.dataset.page }); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (e.target.closest('[data-retry]')) load();
  if (e.target.closest('#filters-open')) $('#filters').classList.add('is-open');
  if (e.target.closest('[data-close-filters]')) $('#filters').classList.remove('is-open');
});
$('#filters').addEventListener('submit', (e) => {
  if (e.target.id !== 'price-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  go({ min_price: f.get('min_price'), max_price: f.get('max_price') });
});
$('#filters').addEventListener('change', (e) => {
  if (e.target.dataset.brand !== undefined) {
    const brands = $$('[data-brand]:checked', $('#filters')).map((b) => b.dataset.brand);
    go({ brand: brands.join(',') });
  } else if (e.target.id === 'in-stock') go({ in_stock: e.target.checked ? '1' : '' });
});
$('#sort').addEventListener('change', (e) => go({ sort: e.target.value === 'featured' ? '' : e.target.value }));

load();
