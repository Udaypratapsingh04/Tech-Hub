import { initApp, api, auth, cart, compare, store, html, raw, mount, $, $$, money, stars, icon, fmtDate, plural, productCard, shopUrl,
  toast, setBusy, showFieldErrors, confirmDialog } from './app.js';

await initApp({ active: '' });
const root = $('#pdp-root');
const params = new URLSearchParams(location.search);
const ident = params.get('slug') || params.get('id');

let product;
try {
  product = (await api('/products/' + encodeURIComponent(ident || ''))).product;
} catch {
  document.title = 'Product not found | TECH HUB';
  mount(root, html`<div class="empty">${icon('search')}<h3>We couldn't find that product</h3><p>It may have been removed or the link is incorrect.</p><a class="btn btn-primary" href="/shop">Browse all products</a></div>`);
  throw new Error('product not found');
}
document.title = `${product.name} | TECH HUB`;

let qty = 1;
const maxQty = () => Math.max(1, Math.min(product.stock, store.maxQty));
const stockNote = () => !product.in_stock ? html`<span class="stock stock-out">Sold out</span>`
  : product.low_stock ? html`<span class="stock stock-low">Only ${product.stock} left</span>` : html`<span class="stock stock-ok">In stock</span>`;
const catLabel = product.category === 'laptops' ? 'Laptops' : 'Accessories';
const subLabel = (await api('/categories')).items.find((c) => c.subcategory === product.subcategory)?.short ?? product.subcategory;

function renderMain() {
  const specs = Object.entries(product.specs);
  mount(root, html`
    <nav class="breadcrumb page-head" aria-label="Breadcrumb">
      <a href="/">Home</a>${icon('chevron-right')}<a href="${shopUrl({ category: product.category })}">${catLabel}</a>${icon('chevron-right')}
      <a href="${shopUrl({ category: product.category, subcategory: product.subcategory })}">${subLabel}</a>
    </nav>
    <div class="pdp">
      <div class="pdp-stage"><img src="${product.image}" alt="${product.name}"></div>
      <div class="pdp-info">
        <div>${product.brand ? html`<p class="muted">${product.brand}</p>` : ''}<h1>${product.name}</h1></div>
        <div class="row" id="pdp-rating"></div>
        <p class="pdp-price">${money(product.price)}</p>
        <div>${stockNote()}</div>
        ${product.description ? html`<p>${product.description}</p>` : ''}
        <div class="buy-row">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" id="qty-minus" aria-label="Decrease quantity">${icon('minus')}</button>
            <output id="qty-out" aria-live="polite">1</output>
            <button type="button" id="qty-plus" aria-label="Increase quantity">${icon('plus')}</button>
          </div>
          <button class="btn btn-primary btn-lg" id="add-btn" ${raw(product.in_stock ? '' : 'disabled')}>Add to cart</button>
          <button class="btn btn-secondary btn-lg" id="buy-btn" ${raw(product.in_stock ? '' : 'disabled')}>Buy now</button>
        </div>
        ${product.category === 'laptops' ? html`<label class="compare-toggle"><input type="checkbox" data-compare="${product.id}" ${raw(compare.has(product.id) ? 'checked' : '')}> Add to compare</label>` : ''}
        <ul class="info-list">
          <li>${icon('truck')}Free delivery on orders over ${money(store.freeShippingThreshold)}</li>
          <li>${icon('undo')}Cancel any time before your order ships</li>
        </ul>
      </div>
    </div>
    ${specs.length ? html`<section class="section-tight" aria-labelledby="specs-h"><h2 id="specs-h" class="card-title">Specifications</h2>
      <table class="spec-table"><tbody>${specs.map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}</tbody></table></section>` : ''}
    <section class="section-tight" id="reviews" aria-labelledby="reviews-h"></section>
    <section class="section-tight" id="related" hidden aria-labelledby="related-h"><div class="section-head"><h2 id="related-h">You might also like</h2></div><div class="grid-products" id="related-grid"></div></section>`);
  paintQty();
  paintRating();
}

function paintQty() {
  $('#qty-out').textContent = qty;
  $('#qty-minus').disabled = qty <= 1;
  $('#qty-plus').disabled = qty >= maxQty();
}
function paintRating() {
  const r = product.rating;
  mount($('#pdp-rating'), r.count
    ? html`${stars(r.average)}<a class="link" href="#reviews">${r.average} · ${plural(r.count, 'review')}</a>`
    : html`<a class="link" href="#reviews">Be the first to review</a>`);
}

renderMain();

root.addEventListener('click', async (e) => {
  if (e.target.closest('#qty-minus')) { qty = Math.max(1, qty - 1); paintQty(); }
  if (e.target.closest('#qty-plus')) { qty = Math.min(maxQty(), qty + 1); paintQty(); }
  if (e.target.closest('#buy-btn')) location.href = `/checkout?buy=${product.id}&qty=${qty}`;
  const add = e.target.closest('#add-btn');
  if (add) {
    setBusy(add, true);
    try { await cart.add(product.id, qty); toast(`${plural(qty, 'item')} added to your cart`, { href: '/cart', action: 'View cart' }); }
    catch (err) { toast(err.message, { type: 'error' }); }
    setBusy(add, false);
  }
});

/* =============================================================== reviews */
let reviewPage = 1, rating = 0;

async function loadReviews(page = 1) {
  const data = await api(`/products/${product.id}/reviews?page=${page}`);
  reviewPage = page;
  product.rating = { average: data.summary.average, count: data.summary.count };
  paintRating();
  const mine = data.items.find((r) => r.mine);
  const s = data.summary;
  mount($('#reviews'), html`
    <h2 id="reviews-h" class="card-title">Customer reviews</h2>
    <div class="reviews-layout">
      <div class="rating-summary">
        ${s.count ? html`<div><span class="rating-big">${s.average}</span> <span class="muted">out of 5</span></div>${stars(s.average, true)}<p class="muted">${plural(s.count, 'review')}</p>
          <div>${[5, 4, 3, 2, 1].map((n) => html`<div class="dist-row"><span>${n}★</span><div class="bar"><span data-w="${s.count ? Math.round((s.distribution[n] / s.count) * 100) : 0}"></span></div><span>${s.distribution[n]}</span></div>`)}</div>`
          : html`<p class="muted">No reviews yet.</p>`}
      </div>
      <div>
        <div id="review-form-slot" class="card"></div>
        <div id="review-list">${data.items.map(reviewItem)}</div>
        ${data.page < data.pages ? html`<button class="btn btn-secondary" id="more-reviews">Show more reviews</button>` : ''}
      </div>
    </div>`);
  paintForm(mine);
}

const reviewItem = (r) => html`<article class="review-item" data-review="${r.id}">
  <header>${stars(r.rating)}${r.title ? html`<strong>${r.title}</strong>` : ''}</header>
  <p>${r.comment}</p>
  <p class="muted">${r.author}${r.verified ? html` <span class="badge badge-ok">Verified purchase</span>` : ''} · ${fmtDate(r.created_at)}
    ${r.mine ? html` · <button class="link" type="button" data-delete-review="${r.id}">Delete</button>` : ''}</p></article>`;

function paintForm(existing) {
  const slot = $('#review-form-slot');
  if (!auth.user) {
    mount(slot, html`<p><strong>Share your experience.</strong> <a class="link" href="${'/login?next=' + encodeURIComponent(location.pathname + location.search)}">Log in</a> to write a review.</p>`);
    return;
  }
  rating = existing?.rating || 0;
  mount(slot, html`<form id="review-form" class="stack" novalidate>
    <h3>${existing ? 'Update your review' : 'Write a review'}</h3>
    <div class="field"><span class="label" id="rating-label">Your rating</span>
      <div class="star-input" role="group" aria-labelledby="rating-label">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-star="${n}" aria-label="${plural(n, 'star')}" aria-pressed="false">${raw('<svg class="icon" aria-hidden="true"><use href="#i-star-full"/></svg>')}</button>`)}</div>
      <p class="field-error" data-error-for="rating"></p></div>
    <div class="field"><label for="rv-title">Headline <span class="muted">(optional)</span></label><input class="input" id="rv-title" name="title" maxlength="100" value="${existing?.title || ''}"></div>
    <div class="field"><label for="rv-comment">Your review</label><textarea class="textarea" id="rv-comment" name="comment" maxlength="1000" placeholder="What did you like or dislike? How are you using it?">${existing?.comment || ''}</textarea>
      <p class="field-error" data-error-for="comment"></p></div>
    <div><button class="btn btn-primary" type="submit">${existing ? 'Update review' : 'Submit review'}</button></div>
  </form>`);
  paintStars();
}
function paintStars() {
  $$('[data-star]').forEach((b) => { const on = Number(b.dataset.star) <= rating; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(Number(b.dataset.star) === rating)); });
}

$('#reviews').addEventListener('click', async (e) => {
  const star = e.target.closest('[data-star]');
  if (star) { rating = Number(star.dataset.star); paintStars(); return; }
  if (e.target.closest('#more-reviews')) {
    const btn = e.target.closest('#more-reviews');
    const data = await api(`/products/${product.id}/reviews?page=${reviewPage + 1}`);
    reviewPage += 1;
    $('#review-list').insertAdjacentHTML('beforeend', data.items.map((r) => reviewItem(r).s).join(''));
    if (reviewPage >= data.pages) btn.remove();
    return;
  }
  const del = e.target.closest('[data-delete-review]');
  if (del && await confirmDialog({ title: 'Delete your review?', message: 'This removes it for everyone.', confirmLabel: 'Delete', danger: true })) {
    await api('/reviews/' + del.dataset.deleteReview, { method: 'DELETE' });
    toast('Review deleted');
    loadReviews(1);
  }
});
$('#reviews').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = $('[type=submit]', form);
  if (!rating) { showFieldErrors(form, { fields: {} }); $('[data-error-for=rating]', form).textContent = 'Choose a star rating.'; return; }
  setBusy(btn, true);
  try {
    const res = await api(`/products/${product.id}/reviews`, { method: 'POST', body: { rating, title: form.title.value, comment: form.comment.value } });
    toast('Thanks! Your review is live.');
    await loadReviews(1);
  } catch (err) {
    setBusy(btn, false);
    if (!showFieldErrors(form, err)) toast(err.message, { type: 'error' });
  }
});

/* ================================================================ related */
async function loadRelated() {
  const { items } = await api(`/products/${product.id}/related`);
  if (!items.length) return;
  $('#related').hidden = false;
  mount($('#related-grid'), html`${items.map(productCard)}`);
}

await Promise.all([loadReviews(1), loadRelated()]).catch(() => {});
if (location.hash === '#reviews') $('#reviews').scrollIntoView();
