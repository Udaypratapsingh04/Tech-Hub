import { initApp, auth, html, raw, mount, $, icon, safeNext, setBusy, showFieldErrors, toast } from './app.js';

const user = await initApp({ active: '' });
const page = document.body.dataset.page; // "login" | "signup"
const next = safeNext(new URLSearchParams(location.search).get('next'));
if (user) location.replace(next);

const nextQs = next !== '/' ? '?next=' + encodeURIComponent(next) : '';
const password = (id, name, label, ac, hint = '') => html`<div class="field"><label for="${id}">${label}</label>
  <div class="input-affix"><input class="input" id="${id}" name="${name}" type="password" autocomplete="${ac}">
  <button type="button" data-reveal="${id}" aria-label="Show password">${icon('eye')}</button></div>
  ${hint ? html`<p class="field-hint">${hint}</p>` : ''}<p class="field-error" data-error-for="${name}"></p></div>`;

if (page === 'login') {
  document.title = 'Log in | TECH HUB';
  mount($('#auth-root'), html`<div><h1>Log in</h1><p class="muted">Welcome back. Enter your details to continue.</p></div>
    <form id="auth-form" novalidate>
      <div class="alert alert-danger" id="auth-alert" hidden></div>
      <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" autofocus><p class="field-error" data-error-for="email"></p></div>
      ${password('password', 'password', 'Password', 'current-password')}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Log in</button>
    </form>
    <p class="muted">New to TECH HUB? <a class="link" href="/signup${nextQs}">Create an account</a></p>`);
} else {
  document.title = 'Create account | TECH HUB';
  mount($('#auth-root'), html`<div><h1>Create your account</h1><p class="muted">It takes under a minute.</p></div>
    <form id="auth-form" novalidate>
      <div class="alert alert-danger" id="auth-alert" hidden></div>
      <div class="field"><label for="name">Full name</label><input class="input" id="name" name="name" autocomplete="name" autofocus><p class="field-error" data-error-for="name"></p></div>
      <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email"><p class="field-error" data-error-for="email"></p></div>
      ${password('password', 'password', 'Password', 'new-password', 'At least 8 characters, with a letter and a number.')}
      ${password('confirm', 'confirm_password', 'Confirm password', 'new-password')}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Create account</button>
    </form>
    <p class="muted">Already have an account? <a class="link" href="/login${nextQs}">Log in</a></p>`);
}

const form = $('#auth-form');
form.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reveal]');
  if (!b) return;
  const input = $('#' + b.dataset.reveal);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  mount(b, icon(show ? 'eye-off' : 'eye'));
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = form.elements, alertBox = $('#auth-alert'), btn = $('[type=submit]', form);
  alertBox.hidden = true;
  if (page === 'signup' && f.password.value !== f.confirm_password.value) {
    showFieldErrors(form, { fields: { confirm_password: 'Passwords do not match.' } });
    return;
  }
  setBusy(btn, true);
  try {
    if (page === 'login') await auth.login(f.email.value, f.password.value);
    else await auth.register({ name: f.name.value, email: f.email.value, password: f.password.value, confirm_password: f.confirm_password.value });
    location.href = next;
  } catch (err) {
    setBusy(btn, false);
    if (!showFieldErrors(form, err)) {
      mount(alertBox, html`${icon('alert')}<span>${err.message}</span>`);
      alertBox.hidden = false;
    }
  }
});
