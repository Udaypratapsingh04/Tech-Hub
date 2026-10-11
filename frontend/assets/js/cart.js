import { initApp, cart, auth, store, html, raw, mount, $, money, icon, productUrl, plural, toast } from './app.js';

await initApp({ active: '' });
const root = $('#cart-root');

const issueText = (l) => l.issue === 'out_of_stock' ? 'Sold out. Remove it to continue.'
  : l.issue === 'limited_stock' ? `Only ${l.product.stock} available, so we've adjusted the quantity.`
  : l.issue === 'max_quantity' ? `You can order up to ${store.maxQty} of each item.` : '';

function view(q) {
  if (!q.lines.length) {
    mount(root, html`<div class="empty">${icon('cart')}<h3>Your cart is empty</h3><p>Add a laptop or accessory and it will show up here.</p>
      <a class="btn btn-primary" href="/shop">Start shopping</a></div>`);
    return;
  }
  const blocked = q.lines.some((l) => l.issue === 'out_of_stock') || q.item_count === 0;
  const pct = Math.min(100, Math.round((q.subtotal / q.free_shipping_threshold) * 100));
  mount(root, html`<div class="cart-layout">
    <section class="card" aria-label="Items in your cart">${q.lines.map((l) => html`
      <article class="cart-line">
        <a class="stage" href="${productUrl(l.product)}"><img src="${l.product.image}" alt=""></a>
        <div>
          <h3><a href="${productUrl(l.product)}">${l.product.name}</a></h3>
          <p class="muted">${money(l.product.price)} each</p>
          ${l.issue ? html`<p class="field-error">${issueText(l)}</p>` : ''}
        </div>
        <div class="cart-line-side">
          <strong class="price">${money(l.line_total)}</strong>
          <div class="row">
            <div class="qty" role="group" aria-label="Quantity for ${l.product.name}">
              <button type="button" data-qty="${l.product.id}" data-to="${l.quantity - 1}" aria-label="Decrease quantity">${icon('minus')}</button>
              <output>${l.quantity}</output>
              <button type="button" data-qty="${l.product.id}" data-to="${l.quantity + 1}" aria-label="Increase quantity" ${raw(l.quantity >= Math.min(l.product.stock, store.maxQty) ? 'disabled' : '')}>${icon('plus')}</button>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" data-qty="${l.product.id}" data-to="0" aria-label="Remove ${l.product.name}">${icon('trash', 'icon-sm')}</button>
          </div>
        </div>
      </article>`)}</section>
    <aside class="card summary" aria-label="Order summary">
      <h2 class="card-title">Order summary</h2>
      ${q.amount_to_free_shipping > 0 ? html`<div class="progress"><span>Add <strong>${money(q.amount_to_free_shipping)}</strong> more for free delivery</span><div class="bar"><span data-w="${pct}"></span></div></div>`
        : html`<div class="progress"><span>${icon('truck', 'icon-sm')} You've unlocked free delivery</span></div>`}
      <div class="summary-row"><span>Subtotal (${plural(q.item_count, 'item')})</span><span class="num">${money(q.subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span class="num">${q.shipping_fee ? money(q.shipping_fee) : 'Free'}</span></div>
      <div class="summary-row total"><span>Total</span><span class="num">${money(q.total)}</span></div>
      <a class="btn btn-primary btn-lg btn-block" href="/checkout" ${raw(blocked ? 'aria-disabled="true"' : '')}>Go to checkout</a>
      ${auth.user ? '' : html`<p class="field-hint">You'll log in or create an account at checkout so we can track your order.</p>`}
      <a class="btn btn-ghost btn-block" href="/shop">Continue shopping</a>
    </aside></div>`);
}

async function refresh(action) {
  try { view(await action()); }
  catch (err) { toast(err.message, { type: 'error' }); view(await cart.get()); }
}

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-qty]');
  if (!b) return;
  const id = Number(b.dataset.qty), to = Number(b.dataset.to);
  refresh(() => cart.setQty(id, to));
});

refresh(() => cart.get());
