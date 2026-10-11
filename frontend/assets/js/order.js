import { initApp, api, html, raw, mount, $, money, icon, fmtDate, statusBadge, STATUS, PAYMENT_METHODS, PAYMENT_STATUS, toast, confirmDialog } from './app.js';

const user = await initApp({ active: '', requireAuth: true });
const root = $('#order-root');
const params = new URLSearchParams(location.search);
const id = Number(params.get('id'));
const isNew = params.get('new') === '1';
const STEPS = ['placed', 'processing', 'shipped', 'delivered'];

async function load() {
  let order;
  try { order = (await api('/orders/' + id)).order; }
  catch {
    mount(root, html`<div class="empty">${icon('package')}<h3>Order not found</h3><p>It may belong to a different account.</p><a class="btn btn-primary" href="/account">View my orders</a></div>`);
    return;
  }
  document.title = `Order ${order.order_number} | TECH HUB`;
  const at = (s) => order.events.find((e) => e.status === s)?.at;
  const cancelled = order.status === 'cancelled';
  const s = order.shipping;
  mount(root, html`<div class="stack">
    ${isNew && !cancelled ? html`<div class="banner-ok">${icon('check-circle')}<div><h2>Thank you, ${user.name.split(' ')[0]}. Your order is placed.</h2>
      <p>You can follow its progress below or any time from My orders. ${order.payment_method === 'cod' ? 'Please keep the exact amount ready for delivery.' : ''}</p></div></div>` : ''}
    <div class="row row-wrap"><h1 class="page-title">Order ${order.order_number}</h1><span class="spacer"></span>${statusBadge(order.status)}</div>
    <p class="muted">Placed on ${fmtDate(order.created_at, true)}</p>
    <div class="card">
      ${cancelled ? html`<div class="alert alert-danger">${icon('alert')}This order was cancelled on ${fmtDate(at('cancelled'), true)}. ${order.payment_status === 'refunded' ? 'Your payment has been refunded.' : ''}</div>`
        : html`<ol class="timeline" aria-label="Order progress">${STEPS.map((st) => html`<li class="tl-step ${at(st) ? 'done' : ''}"><strong>${STATUS[st].label}</strong><span>${at(st) ? fmtDate(at(st), true) : 'Pending'}</span></li>`)}</ol>`}
    </div>
    <div class="cart-layout">
      <section class="card" aria-label="Items">${order.items.map((i) => html`<div class="order-line">
        <a class="stage" href="${'/product?id=' + i.product_id}"><img src="${i.image}" alt=""></a>
        <div><strong>${i.name}</strong><p class="muted">${money(i.unit_price)} × ${i.quantity}</p></div><strong class="num">${money(i.line_total)}</strong></div>`)}</section>
      <aside class="card summary" aria-label="Order totals">
        <div class="summary-row"><span>Subtotal</span><span class="num">${money(order.subtotal)}</span></div>
        <div class="summary-row"><span>Delivery</span><span class="num">${order.shipping_fee ? money(order.shipping_fee) : 'Free'}</span></div>
        <div class="summary-row total"><span>Total</span><span class="num">${money(order.total)}</span></div>
        <div class="summary-row"><span>Payment</span><span>${PAYMENT_METHODS[order.payment_method]} · ${PAYMENT_STATUS[order.payment_status]}</span></div>
        ${order.can_cancel ? html`<button class="btn btn-danger btn-block" id="cancel-btn">Cancel order</button>` : ''}
      </aside>
    </div>
    <section class="card"><h2 class="card-title">Delivering to</h2>
      <address>${s.name}<br>${s.address}<br>${s.city}, ${s.state} ${s.pincode}<br>${s.phone}</address></section></div>`);
}

root.addEventListener('click', async (e) => {
  if (!e.target.closest('#cancel-btn')) return;
  const ok = await confirmDialog({ title: 'Cancel this order?', message: 'Items go back into stock and any payment is refunded. This can\'t be undone.', confirmLabel: 'Cancel order', danger: true });
  if (!ok) return;
  try { await api(`/orders/${id}/cancel`, { method: 'POST' }); toast('Order cancelled'); load(); }
  catch (err) { toast(err.message, { type: 'error' }); }
});
load();
