import { initApp, api, auth, html, raw, mount, $, $$, money, icon, fmtDate, plural, statusBadge, toast, setBusy, showFieldErrors } from './app.js';

await initApp({ active: '', requireAuth: true });
const TABS = ['orders', 'profile', 'security'];

function showTab(name) {
  if (!TABS.includes(name)) name = 'orders';
  TABS.forEach((t) => {
    $(`#panel-${t}`).hidden = t !== name;
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === name));
  });
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
showTab(location.hash.slice(1));

/* ---------------------------------------------------------------- orders */
async function loadOrders() {
  const panel = $('#panel-orders');
  const { items } = await api('/orders');
  if (!items.length) {
    mount(panel, html`<div class="empty">${icon('package')}<h3>No orders yet</h3><p>When you place an order, you can track it here.</p><a class="btn btn-primary" href="/shop">Start shopping</a></div>`);
    return;
  }
  mount(panel, html`<div class="stack">${items.map((o) => html`<article class="card order-card">
    <div class="order-card-head"><div><strong>${o.order_number}</strong><p class="muted">Placed ${fmtDate(o.created_at)} · ${plural(o.items.reduce((n, i) => n + i.quantity, 0), 'item')}</p></div>${statusBadge(o.status)}</div>
    <div class="row row-wrap"><div class="thumbs-row">${o.items.slice(0, 4).map((i) => html`<div class="stage"><img src="${i.image}" alt="${i.name}"></div>`)}</div>
      ${o.items.length > 4 ? html`<span class="muted">+${o.items.length - 4} more</span>` : ''}<span class="spacer"></span>
      <strong class="price">${money(o.total)}</strong><a class="btn btn-secondary btn-sm" href="/order?id=${o.id}">View details</a></div>
  </article>`)}</div>`);
}

/* --------------------------------------------------------------- profile */
function paintProfile() {
  const u = auth.user;
  mount($('#panel-profile'), html`<form class="card stack" id="profile-form" novalidate>
    <h2 class="card-title">Your details</h2>
    <div class="field"><label for="pf-email">Email</label><input class="input" id="pf-email" value="${u.email}" readonly><p class="field-hint">Your email is your login and can't be changed here.</p></div>
    <div class="field-row"><div class="field"><label for="pf-name">Full name</label><input class="input" id="pf-name" name="name" value="${u.name}" autocomplete="name"><p class="field-error" data-error-for="name"></p></div>
    <div class="field"><label for="pf-phone">Mobile number</label><input class="input" id="pf-phone" name="phone" value="${u.phone}" autocomplete="tel" inputmode="numeric"><p class="field-error" data-error-for="phone"></p></div></div>
    <div><button class="btn btn-primary" type="submit">Save changes</button></div></form>`);
  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('[type=submit]', f);
    setBusy(btn, true);
    try {
      auth.user = (await api('/auth/me', { method: 'PATCH', body: { name: f.name.value, phone: f.phone.value } })).user;
      toast('Profile saved');
      setBusy(btn, false);
      showFieldErrors(f, { fields: {} });
    } catch (err) { setBusy(btn, false); if (!showFieldErrors(f, err)) toast(err.message, { type: 'error' }); }
  });
}

/* -------------------------------------------------------------- password */
function paintSecurity() {
  mount($('#panel-security'), html`<form class="card stack" id="pw-form" novalidate>
    <h2 class="card-title">Change password</h2>
    <div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" name="current_password" type="password" autocomplete="current-password"><p class="field-error" data-error-for="current_password"></p></div>
    <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" name="new_password" type="password" autocomplete="new-password"><p class="field-hint">At least 8 characters, with a letter and a number.</p><p class="field-error" data-error-for="new_password"></p></div>
    <div><button class="btn btn-primary" type="submit">Update password</button></div></form>`);
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('[type=submit]', f);
    setBusy(btn, true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
      f.reset(); toast('Password updated'); setBusy(btn, false); showFieldErrors(f, { fields: {} });
    } catch (err) { setBusy(btn, false); if (!showFieldErrors(f, err)) toast(err.message, { type: 'error' }); }
  });
}

paintProfile();
paintSecurity();
loadOrders().catch((err) => mount($('#panel-orders'), html`<div class="empty"><h3>Couldn't load your orders</h3><p>${err.message}</p></div>`));
