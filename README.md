<<<<<<< HEAD
# TECH HUB

A complete laptop and accessories store: a redesigned storefront plus a real backend
(accounts, catalog, cart, checkout, orders, reviews and an admin dashboard).

**Stack:** Python 3.10+ · Flask · SQLite · vanilla JavaScript (no build step)

## Run it

```bash
pip install -r requirements.txt
python run.py
```

Open **http://127.0.0.1:5000**. The database is created and filled with the product
catalog automatically on first start.

**Admin dashboard:** http://127.0.0.1:5000/admin
Email `admin@techhub.local` · Password `Admin@12345` (change it, see Configuration).

Run the tests: `python -m unittest discover -s tests -v`

## What's inside

```
run.py                  start the server
backend/
  __init__.py           app factory, security headers, error handling, serves the frontend
  config.py             settings from environment variables / .env
  db.py                 SQLite schema + safe transactions
  security.py           password hashing, JWT session cookie, guards, rate limiting
  seed_data.py          the product catalog (edit prices/specs here before first run)
  services.py           pricing, shipping and order logic shared by routes
  routes/               auth, catalog, cart, orders, reviews, admin
frontend/
  *.html                one small shell per page
  assets/css/styles.css design system (light + dark)
  assets/js/            app.js (shared core) + one script per page
  assets/img/           optimised WebP images
tests/test_api.py       32 API tests
```

## Pages

| URL | Purpose |
|---|---|
| `/` | Home: collections, new arrivals, live comparison preview, reviews |
| `/shop` | Filter by category, brand, price, stock; sort; search; pagination |
| `/product?slug=…` | Details, specs, reviews, related products |
| `/compare` | Side-by-side table for up to 4 laptops |
| `/cart`, `/checkout`, `/order?id=…` | Cart, checkout, order tracking and cancellation |
| `/login`, `/signup`, `/account` | Accounts, order history, profile, password |
| `/admin` | Stats, order status management, product add/edit/archive, stock |

The old pages (GAMING, STUDENTS, CREATORS, CHROMEBOOK, Headphone, keyboard, mouse,
gamepad, Accessories, Laptop, payment, checkout2…) are all replaced by `/shop` with
filters, because products now come from the database instead of being copied into each page.

## API (all JSON under `/api`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `POST /auth/logout` `GET/PATCH /auth/me` `POST /auth/change-password` |
| Catalog | `GET /products` (q, category, subcategory, brand, min_price, max_price, in_stock, is_new, sort, page) · `GET /products/<id or slug>` · `GET /products/<id>/related` · `GET /categories` · `GET /compare?ids=1,2` · `GET /config` |
| Cart | `POST /cart/quote` (guest) · `GET /cart` · `POST /cart/items` · `PUT/DELETE /cart/items/<id>` · `POST /cart/merge` · `DELETE /cart` |
| Orders | `POST /orders` · `GET /orders` · `GET /orders/<id>` · `POST /orders/<id>/cancel` |
| Reviews | `GET/POST /products/<id>/reviews` · `DELETE /reviews/<id>` · `GET /reviews/latest` |
| Admin | `GET /admin/stats` · `GET/PATCH /admin/orders` · `GET/POST/PUT/DELETE /admin/products` |

## Security measures

* Passwords are hashed (scrypt); never stored or logged in plain text.
* Login session is an **HttpOnly, SameSite=Lax cookie** holding a signed JWT, so scripts cannot read it.
* **Prices and totals are always computed on the server** from the database; the browser only says what it wants.
* Checkout runs in a database transaction that re-checks stock, so two buyers cannot oversell the last unit.
* Users can only see and cancel their own orders; admin routes require an admin account.
* Login/registration are rate limited; all SQL is parameterised; all page output is HTML-escaped.
* Strict Content-Security-Policy and other security headers on every response.
* Card details are **never** sent to or stored by the server.

## Configuration

Copy `.env.example` to `.env`. Useful values: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SECRET_KEY`,
`FREE_SHIPPING_THRESHOLD` (default ₹5,000), `SHIPPING_FEE` (₹99), `PORT`.

For production set `APP_ENV=production` (requires a custom `ADMIN_PASSWORD`; session cookie becomes
Secure) and serve behind HTTPS with a real WSGI server: `waitress-serve --call "backend:create_app"`
on Windows, `gunicorn "backend:create_app()"` on Linux/macOS.

## Things to know

* **Payments are simulated.** UPI/card/net banking orders are marked paid immediately; COD is pending until
  delivered. To take real payments, integrate a gateway (e.g. Razorpay) inside `routes/orders.py`.
* Rate limiting is in-memory (fine for one process; use Redis if you run several).
* No emails are sent (order confirmations, password reset) - a natural next step.
* To add a product image, put the file in `frontend/assets/img/products/` and use its path in the admin form.
  `scripts/optimize_images.py` shows how the original PNGs were converted to small WebP files.
=======
# Tech-Hub
Tech Hub – A modern and responsive laptop shopping website where users can explore laptop models, view specifications, compare prices, and enjoy a user-friendly online shopping experience.
>>>>>>> d2f81ba371a5b814886c57c351ba09e248da85c5
