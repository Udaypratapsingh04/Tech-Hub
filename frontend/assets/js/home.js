import { initApp, api, html, raw, mount, $, $$, money, stars, icon, productCard, productUrl, shopUrl, skeletons, plural, compare } from './app.js';

const SCENES = [
  { key: 'students', sub: 'students', title: 'Laptops that keep up with a full timetable',
    text: 'Light, long-lasting machines for lectures, labs and late-night assignments.', cta: 'Shop student laptops',
    alt: 'A laptop on a sunlit wooden desk next to a stack of books and a coffee cup' },
  { key: 'gaming', sub: 'gaming', title: 'Smooth frames. Serious graphics.',
    text: 'High-refresh displays and RTX graphics, ready for whatever you play next.', cta: 'Shop gaming laptops',
    alt: 'A gaming laptop on a glass desk with headphones and a mouse in a dark room' },
  { key: 'creators', sub: 'creators', title: 'A bigger canvas for your best work',
    text: 'Sharp OLED and 4K screens with the power to edit, design and render.', cta: 'Shop creator laptops',
    alt: 'A laptop running design software next to a drawing tablet on a wooden desk' },
];

await initApp({ active: '' });

const grid = $('#new-arrivals');
mount(grid, skeletons(4));

const [cats, news, featured, latest] = await Promise.all([
  api('/categories'),
  api('/products?is_new=1&per_page=4&sort=featured'),
  Promise.all(['students', 'gaming', 'creators'].map((s) => api(`/products?subcategory=${s}&per_page=1&sort=featured`))),
  api('/reviews/latest?limit=3'),
]);
const bySub = Object.fromEntries(cats.items.map((c) => [c.subcategory, c]));

/* ---- hero: one scene per use case, switched by the tabs ---- */
function renderHero(index = 0) {
  const scene = SCENES[index];
  const hero = $('#hero');
  mount(hero, html`
    ${SCENES.map((s, i) => html`<div class="hero-scene ${i === index ? 'is-active' : ''}">
      <img src="/assets/img/scenes/${s.key}-1920.webp" srcset="/assets/img/scenes/${s.key}-960.webp 960w, /assets/img/scenes/${s.key}-1920.webp 1920w"
           sizes="(max-width: 1240px) 100vw, 1240px" alt="${s.alt}" ${raw(i === 0 ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async"></div>`)}
    <div class="hero-copy" id="hero-panel" role="tabpanel" aria-labelledby="hero-tab-${scene.key}">
      <h1>${scene.title}</h1>
      <p>${scene.text}</p>
      <div class="hero-actions">
        <a class="btn btn-light btn-lg" href="${shopUrl({ category: 'laptops', subcategory: scene.sub })}">${scene.cta}</a>
        <a class="btn btn-outline-light btn-lg" href="/compare">Compare models</a>
      </div>
    </div>
    <div class="hero-tabs" role="tablist" aria-label="Choose a collection">
      ${SCENES.map((s, i) => html`<button class="hero-tab" role="tab" id="hero-tab-${s.key}" data-scene="${i}" aria-selected="${String(i === index)}" tabindex="${i === index ? 0 : -1}">
        <strong>${bySub[s.sub]?.short ?? s.key}</strong><span>${bySub[s.sub]?.count} models from ${money(bySub[s.sub]?.min_price)}</span></button>`)}
    </div>`);
}
renderHero(0);
$('#hero').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-scene]');
  if (!tab) return;
  const i = Number(tab.dataset.scene);
  if (tab.getAttribute('aria-selected') === 'true') return;
  renderHero(i);
  $(`[data-scene="${i}"]`).focus();
});
$('#hero').addEventListener('keydown', (e) => {
  const tab = e.target.closest('[data-scene]');
  if (!tab || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const next = (Number(tab.dataset.scene) + (e.key === 'ArrowRight' ? 1 : SCENES.length - 1)) % SCENES.length;
  renderHero(next);
  $(`[data-scene="${next}"]`).focus();
});

/* ---- laptop types ---- */
mount($('#types'), html`${cats.items.filter((c) => c.category === 'laptops').map((c) => html`
  <a class="type-tile" href="${shopUrl({ category: c.category, subcategory: c.subcategory })}">
    <div class="stage"><img src="${c.image}" alt="" loading="lazy"></div>
    <div class="type-tile-body"><h3>${c.label}</h3><p>${plural(c.count, 'model')} from ${money(c.min_price)}</p></div>
  </a>`)}`);

/* ---- new arrivals ---- */
mount(grid, html`${news.items.map(productCard)}`);

/* ---- compare preview built from live catalog data ---- */
const picks = featured.map((r) => r.items[0]).filter(Boolean);
const row = (label, fn) => html`<tr><th scope="row">${label}</th>${picks.map((p) => html`<td>${fn(p)}</td>`)}</tr>`;
mount($('#compare-promo'), html`
  <div>
    <h2>Not sure which one? Put them side by side.</h2>
    <p>Add up to four laptops to compare processor, memory, storage and price in one table.</p>
    <a class="btn btn-primary btn-lg" href="${'/compare?ids=' + picks.map((p) => p.id).join(',')}">Compare these three</a>
  </div>
  <div class="mini-wrap"><table class="mini-table">
    <thead><tr><td></td>${picks.map((p) => html`<th scope="col" class="mini-head"><div class="stage"><img src="${p.image}" alt="" loading="lazy"></div><a class="mini-name" href="${productUrl(p)}">${p.name}</a></th>`)}</tr></thead>
    <tbody>${row('Processor', (p) => p.specs.Processor ?? '-')}${row('Memory', (p) => p.specs.RAM ?? '-')}${row('Storage', (p) => p.specs.Storage ?? '-')}${row('Price', (p) => html`<strong>${money(p.price)}</strong>`)}</tbody>
  </table></div>`);

/* ---- accessories ---- */
mount($('#accessories'), html`${cats.items.filter((c) => c.category === 'accessories').map((c) => html`
  <a class="acc-tile" href="${shopUrl({ category: c.category, subcategory: c.subcategory })}">
    <div class="stage"><img src="${c.image}" alt="" loading="lazy"></div>
    <div class="acc-tile-body"><h3>${c.label}</h3><p>From ${money(c.min_price)}</p></div>
  </a>`)}`);

/* ---- reviews: only shown once real customers have written some ---- */
if (latest.items.length) {
  $('#reviews-section').hidden = false;
  mount($('#reviews'), html`${latest.items.map((r) => html`
    <article class="review-card">
      ${stars(r.rating)}
      ${r.title ? html`<h3>${r.title}</h3>` : ''}
      <p class="review-body">${r.comment}</p>
      <p class="review-meta">${r.author}${r.verified ? ' · Verified purchase' : ''} on <a href="${productUrl({ slug: r.product_slug })}">${r.product_name}</a></p>
    </article>`)}`);
}
