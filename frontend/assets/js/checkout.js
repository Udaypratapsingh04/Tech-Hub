import { initApp, api, auth, cart, html, raw, mount, $, $$, money, icon, plural, toast, setBusy, showFieldErrors, ApiError } from './app.js';

await initApp({ active: '', requireAuth: true });
const root = $('#checkout-root');
const params = new URLSearchParams(location.search);
const buyId = Number(params.get('buy')) || null;
const buyQty = Math.max(1, Number(params.get('qty')) || 1);

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank'];
const METHODS = [
  ['upi', 'UPI', 'Pay with any UPI app', 'phone'],
  ['card', 'Card', 'Credit or debit card', 'card'],
  ['netbanking', 'Net banking', 'Choose your bank', 'bank'],
  ['cod', 'Cash on delivery', 'Pay when it arrives', 'cash'],
];

// "Buy now" checks out a single item without touching the saved cart.
const quote = buyId
  ? await api('/cart/quote', { method: 'POST', body: { items: [{ product_id: buyId, quantity: buyQty }] } })
  : await cart.get();
const lines = quote.lines.filter((l) => l.quantity > 0);

if (!lines.length) {
  mount(root, html`<div class="empty">${icon('cart')}<h3>Nothing to check out yet</h3><p>Your cart is empty or the items are no longer available.</p><a class="btn btn-primary" href="/shop">Browse products</a></div>`);
  throw new Error('empty checkout');
}

// Pre-fill from the account and the most recent order.
const last = (await api('/orders').catch(() => ({ items: [] }))).items[0]?.shipping;
const u = auth.user;
const v = { name: last?.name || u.name, phone: last?.phone || u.phone || '', email: last?.email || u.email,
  address: last?.address || '', city: last?.city || '', state: last?.state || '', pincode: last?.pincode || '' };

const field = (name, label, opts = {}) => html`<div class="field ${opts.cls || ''}"><label for="f-${name}">${label}</label>
  ${opts.area ? html`<textarea class="textarea" id="f-${name}" name="${name}" autocomplete="${opts.ac}">${v[name]}</textarea>`
    : html`<input class="input" id="f-${name}" name="${name}" value="${v[name]}" autocomplete="${opts.ac}" ${raw(opts.attrs || '')}>`}
  <p class="field-error" data-error-for="${name}"></p></div>`;

function paintSummary(q = quote) {
  return html`<aside class="card summary" aria-label="Order summary"><h2 class="card-title">Order summary</h2>
    ${lines.map((l) => html`<div class="mini-line"><div class="stage"><img src="${l.product.image}" alt=""></div><span>${l.product.name}<br><span class="muted">Qty ${l.quantity}</span></span><span class="num">${money(l.line_total)}</span></div>`)}
    <div class="summary-row"><span>Subtotal</span><span class="num">${money(q.subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span class="num">${q.shipping_fee ? money(q.shipping_fee) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span class="num">${money(q.total)}</span></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit" form="checkout-form" id="place-order">${icon('lock')}Place order · ${money(q.total)}</button>
    <p class="field-hint">By placing your order you agree you can cancel it any time before it ships.</p></aside>`;
}

mount(root, html`<div class="checkout-layout">
  <form id="checkout-form" class="stack" novalidate>
    <section class="card"><h2 class="step-title"><span class="n">1</span>Delivery details</h2>
      <div class="stack">
        <div class="field-row">${field('name', 'Full name', { ac: 'name' })}${field('phone', 'Mobile number', { ac: 'tel', attrs: 'inputmode="numeric" placeholder="10-digit number"' })}</div>
        ${field('email', 'Email', { ac: 'email', attrs: 'type="email"' })}
        ${field('address', 'Address', { ac: 'street-address', area: true })}
        <div class="field-row">${field('city', 'City', { ac: 'address-level2' })}
          <div class="field"><label for="f-state">State</label><input class="input" id="f-state" name="state" list="states" value="${v.state}" autocomplete="address-level1"><datalist id="states">${STATES.map((s) => html`<option value="${s}">`)}</datalist><p class="field-error" data-error-for="state"></p></div>
          ${field('pincode', 'PIN code', { ac: 'postal-code', attrs: 'inputmode="numeric" maxlength="6"' })}</div>
      </div></section>
    <section class="card"><h2 class="step-title"><span class="n">2</span>Payment</h2>
      <div class="alert alert-warn">${icon('info')}<span>This is a demo store. No money is taken, and card details stay in your browser: they are never sent to the server.</span></div>
      <div class="pay-options" role="radiogroup" aria-label="Payment method">
        ${METHODS.map(([key, label, sub, ic], i) => html`<label class="pay-option"><input type="radio" name="payment_method" value="${key}" ${raw(i === 0 ? 'checked' : '')}>${icon(ic)}<span><strong>${label}</strong><span>${sub}</span></span></label>`)}
      </div>
      <div class="pay-panel" id="pay-panel"></div>
    </section>
    <div class="alert alert-danger" id="form-alert" hidden></div>
  </form>
  ${paintSummary()}</div>`);

/* ------------------------------------------------------ payment sub-forms */
const panels = {
  upi: () => html`<div class="field"><label for="p-upi">UPI ID</label><input class="input" id="p-upi" name="upi" placeholder="name@bank" autocomplete="off"><p class="field-error" data-error-for="upi"></p></div>`,
  card: () => html`<div class="field"><label for="p-card">Card number</label><input class="input" id="p-card" name="card" inputmode="numeric" placeholder="1234 5678 9012 3456" autocomplete="off" maxlength="19"><p class="field-error" data-error-for="card"></p></div>
    <div class="field"><label for="p-cname">Name on card</label><input class="input" id="p-cname" name="cname" autocomplete="off"><p class="field-error" data-error-for="cname"></p></div>
    <div class="field-row"><div class="field"><label for="p-exp">Expiry (MM/YY)</label><input class="input" id="p-exp" name="exp" inputmode="numeric" placeholder="MM/YY" maxlength="5" autocomplete="off"><p class="field-error" data-error-for="exp"></p></div>
    <div class="field"><label for="p-cvv">CVV</label><input class="input" id="p-cvv" name="cvv" type="password" inputmode="numeric" maxlength="4" autocomplete="off"><p class="field-error" data-error-for="cvv"></p></div></div>`,
  netbanking: () => html`<div class="field"><label for="p-bank">Bank</label><select class="select" id="p-bank" name="bank"><option value="">Choose your bank</option>${BANKS.map((b) => html`<option>${b}</option>`)}</select><p class="field-error" data-error-for="bank"></p></div>`,
  cod: () => html`<p class="muted">Pay in cash when your order is delivered. Please keep the exact amount ready.</p>`,
};
const form = $('#checkout-form');
const method = () => form.elements.payment_method.value;
const paintPanel = () => mount($('#pay-panel'), panels[method()]());
paintPanel();
form.addEventListener('change', (e) => { if (e.target.name === 'payment_method') paintPanel(); });
form.addEventListener('input', (e) => {
  if (e.target.name === 'card') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  if (e.target.name === 'exp') { let d = e.target.value.replace(/\D/g, '').slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); e.target.value = d; }
  if (e.target.name === 'pincode' || e.target.name === 'cvv') e.target.value = e.target.value.replace(/\D/g, '');
});

const luhn = (num) => { let sum = 0, alt = false; for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt && (d *= 2) > 9) d -= 9; sum += d; alt = !alt; } return sum % 10 === 0; };
function checkPayment() {
  const err = {}; const f = form.elements;
  if (method() === 'upi' && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(f.upi.value.trim())) err.upi = 'Enter a valid UPI ID, like name@bank.';
  if (method() === 'netbanking' && !f.bank.value) err.bank = 'Choose your bank.';
  if (method() === 'card') {
    const num = f.card.value.replace(/\s/g, '');
    if (num.length < 13 || !luhn(num)) err.card = 'Enter a valid card number.';
    if (f.cname.value.trim().length < 2) err.cname = 'Enter the name on the card.';
    const m = f.exp.value.match(/^(\d{2})\/(\d{2})$/);
    const expired = !m || +m[1] < 1 || +m[1] > 12 || new Date(2000 + +m[2], +m[1], 1) <= new Date();
    if (expired) err.exp = 'Enter a valid future date.';
    if (!/^\d{3,4}$/.test(f.cvv.value)) err.cvv = 'Enter the 3 or 4 digit code.';
  }
  return err;
}

/* ------------------------------------------------------------------ submit */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = $('#form-alert');
  alertBox.hidden = true;
  const payErr = checkPayment();
  if (Object.keys(payErr).length) { showFieldErrors(form, { fields: payErr }); return; }

  const f = form.elements;
  const body = {
    items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
    payment_method: method(),
    shipping: { name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value, city: f.city.value, state: f.state.value, pincode: f.pincode.value },
  };
  const btn = $('#place-order');
  setBusy(btn, true, 'Placing your order');
  try {
    const { order } = await api('/orders', { method: 'POST', body });
    await cart.get().catch(() => {});
    location.href = `/order?id=${order.id}&new=1`;
  } catch (err) {
    setBusy(btn, false);
    if (err instanceof ApiError && err.code === 'stock_issue') {
      const names = (err.details || []).map((d) => `${d.name || 'An item'}${d.available !== undefined ? ` (only ${d.available} left)` : ''}`).join(', ');
      mount(alertBox, html`${icon('alert')}<span>${names} is no longer available in the quantity you chose. <a class="link" href="/cart">Review your cart</a>.</span>`);
      alertBox.hidden = false;
    } else if (!showFieldErrors(form, err, 'shipping.')) {
      mount(alertBox, html`${icon('alert')}<span>${err.message}</span>`);
      alertBox.hidden = false;
    }
    alertBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
});
