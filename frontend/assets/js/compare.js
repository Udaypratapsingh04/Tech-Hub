import { initApp, api, compare, html, raw, mount, $, money, stars, icon, productUrl, shopUrl, plural } from './app.js';

await initApp({ active: 'compare' });
const root = $('#cmp-root');

// Links can carry ?ids=1,2,3 (e.g. from the home page); adopt them as the working set.
const urlIds = (new URLSearchParams(location.search).get('ids') || '').split(',').map(Number).filter(Boolean);
if (urlIds.length) compare._save([...new Set(urlIds)].slice(0, compare.max));

const laptops = (await api('/products?category=laptops&per_page=48&sort=name')).items;

const numeric = {
  RAM: (v) => parseInt(v, 10) || 0,
  Storage: (v) => { const m = String(v).match(/([\d.]+)\s*(TB|GB)/i); return m ? parseFloat(m[1]) * (m[2].toUpperCase() === 'TB' ? 1000 : 1) : 0; },
};

async function render() {
  const ids = compare.ids();
  history.replaceState(null, '', ids.length ? '/compare?ids=' + ids.join(',') : '/compare');
  const data = ids.length ? await api('/compare?ids=' + ids.join(',')) : { items: [], spec_keys: [] };
  const items = data.items;
  const available = laptops.filter((l) => !ids.includes(l.id));

  const picker = html`<div class="cmp-picker">
    <label class="visually-hidden" for="cmp-add">Add a laptop to compare</label>
    <select class="select" id="cmp-add" ${raw(items.length >= compare.max ? 'disabled' : '')}>
      <option value="">${items.length >= compare.max ? `Maximum of ${compare.max} reached` : 'Add a laptop to compare'}</option>
      ${available.map((l) => html`<option value="${l.id}">${l.name} (${money(l.price)})</option>`)}
    </select>
    ${items.length ? html`<button class="btn btn-ghost" type="button" data-clear-all>Clear all</button>` : ''}
    ${items.length ? html`<span class="muted">${plural(items.length, 'laptop')} selected</span>` : ''}
  </div>`;

  if (!items.length) {
    mount(root, html`${picker}<div class="empty">${icon('columns')}<h3>Choose laptops to compare</h3>
      <p>Use the menu above, or tick “Add to compare” on any laptop while you browse.</p>
      <a class="btn btn-primary" href="${shopUrl({ category: 'laptops' })}">Browse laptops</a></div>`);
    return;
  }

  const best = (vals, pick) => { const t = pick(...vals); return vals.map((v) => items.length > 1 && v === t && vals.some((o) => o !== t)); };
  const priceBest = best(items.map((p) => p.price), Math.min);
  const row = (label, cells, bestFlags) => html`<tr><th scope="row">${label}</th>${cells.map((c, i) => html`<td class="${bestFlags?.[i] ? 'cmp-best' : ''}">${c}</td>`)}</tr>`;

  mount(root, html`${picker}
    ${items.length < 2 ? html`<div class="alert">${icon('info')}Add at least one more laptop to see how they compare.</div><br>` : ''}
    <div class="cmp-wrap"><table class="cmp-table">
      <caption class="visually-hidden">Laptop comparison</caption>
      <thead><tr><td></td>${items.map((p) => html`<th scope="col"><div class="cmp-head">
        <div class="stage"><img src="${p.image}" alt=""></div>
        <h3><a href="${productUrl(p)}">${p.name}</a></h3>
        <button class="btn btn-primary btn-sm" data-add="${p.id}" ${raw(p.in_stock ? '' : 'disabled')}>${p.in_stock ? 'Add to cart' : 'Sold out'}</button>
        <button class="btn btn-ghost btn-sm" data-remove="${p.id}">${icon('x', 'icon-sm')}Remove</button></div></th>`)}</tr></thead>
      <tbody>
        ${row('Price', items.map((p) => html`<strong class="price">${money(p.price)}</strong>`), priceBest)}
        ${data.spec_keys.map((k) => {
          const vals = items.map((p) => p.specs[k] ?? '-');
          const flags = numeric[k] ? best(vals.map((v) => numeric[k](v)), Math.max) : null;
          return row(k, vals, flags);
        })}
        ${row('Rating', items.map((p) => p.rating.count ? html`${stars(p.rating.average)} <span class="muted">(${p.rating.count})</span>` : html`<span class="muted">No reviews yet</span>`))}
        ${row('Availability', items.map((p) => p.in_stock ? (p.low_stock ? `Only ${p.stock} left` : 'In stock') : 'Sold out'))}
      </tbody></table></div>
    <p class="muted">Highlighted cells show the best value in a row: lowest price, most memory, largest storage.</p>`);
}

root.addEventListener('change', (e) => { if (e.target.id === 'cmp-add' && e.target.value) compare.toggle(Number(e.target.value)); });
root.addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) compare.remove(Number(rm.dataset.remove));
  if (e.target.closest('[data-clear-all]')) compare.clear();
});
window.addEventListener('compare:change', render);
render();
