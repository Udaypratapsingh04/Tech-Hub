"""End-to-end API tests.  Run with:  python -m unittest discover -s tests -v"""
import os
import tempfile
import unittest

from backend import create_app
from backend.security import reset_rate_limits

SHIP = {"name": "Asha Verma", "phone": "9876543210", "address": "12 MG Road, Sector 4",
        "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"}


class Base(unittest.TestCase):
    rate_limit = False

    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.app = create_app({
            "DATABASE": self.db_path, "TESTING": True, "RATE_LIMIT_ENABLED": self.rate_limit,
            "ADMIN_EMAIL": "boss@shop.test", "ADMIN_PASSWORD": "Boss@12345",
        })
        reset_rate_limits()
        self.client = self.app.test_client()

    def tearDown(self):
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(self.db_path + suffix)
            except FileNotFoundError:
                pass

    # helpers -------------------------------------------------------------
    def new_client(self):
        return self.app.test_client()

    def signup(self, client=None, email="asha@example.com", name="Asha Verma", password="Secret123"):
        client = client or self.client
        r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        self.assertEqual(r.status_code, 201, r.json)
        return r.json["user"]

    def admin_client(self):
        c = self.new_client()
        r = c.post("/api/auth/login", json={"email": "boss@shop.test", "password": "Boss@12345"})
        self.assertEqual(r.status_code, 200, r.json)
        return c

    def product(self, slug):
        return self.client.get(f"/api/products/{slug}").json["product"]

    def order(self, items, client=None, method="upi", ship=None):
        client = client or self.client
        return client.post("/api/orders", json={"items": items, "shipping": ship or SHIP, "payment_method": method})


class CatalogTests(Base):
    def test_listing_filters_sort_and_pagination(self):
        r = self.client.get("/api/products?category=laptops&subcategory=gaming&sort=price_asc")
        prices = [p["price"] for p in r.json["items"]]
        self.assertEqual(r.json["total"], 5)
        self.assertEqual(prices, sorted(prices))

        r = self.client.get("/api/products?per_page=10&page=2")
        self.assertEqual(len(r.json["items"]), 10)
        self.assertEqual(r.json["page"], 2)
        self.assertGreaterEqual(r.json["pages"], 4)

        r = self.client.get("/api/products?category=accessories&min_price=4000&max_price=6000")
        self.assertTrue(all(4000 <= p["price"] <= 6000 for p in r.json["items"]))
        self.assertIn("Apple", [b["name"] for b in r.json["facets"]["brands"]])

    def test_search_is_safe_and_matches_names(self):
        self.assertEqual(self.client.get("/api/products?q=victus").json["total"], 1)
        # SQL metacharacters must be treated as plain text
        self.assertEqual(self.client.get("/api/products?q=%27%20OR%201%3D1%20--").json["total"], 0)
        self.assertEqual(self.client.get("/api/products?q=%25").json["total"], 0)

    def test_detail_by_slug_and_id_and_404(self):
        by_slug = self.product("hp-victus-16")
        by_id = self.client.get(f"/api/products/{by_slug['id']}").json["product"]
        self.assertEqual(by_slug["id"], by_id["id"])
        self.assertEqual(self.client.get("/api/products/nope").status_code, 404)

    def test_compare_returns_union_of_specs(self):
        ids = ",".join(str(self.product(s)["id"]) for s in ("hp-victus-16", "apple-macbook-m4"))
        r = self.client.get(f"/api/compare?ids={ids}")
        self.assertEqual(len(r.json["items"]), 2)
        self.assertIn("Graphics", r.json["spec_keys"])

    def test_categories_have_counts(self):
        items = self.client.get("/api/categories").json["items"]
        self.assertEqual(len(items), 8)
        self.assertTrue(all(i["count"] > 0 and i["image"] for i in items))


class AuthTests(Base):
    def test_register_login_logout_me(self):
        user = self.signup()
        self.assertNotIn("password_hash", user)
        self.assertEqual(self.client.get("/api/auth/me").json["user"]["email"], "asha@example.com")
        self.client.post("/api/auth/logout")
        self.assertIsNone(self.client.get("/api/auth/me").json["user"])
        r = self.client.post("/api/auth/login", json={"email": "ASHA@example.com", "password": "Secret123"})
        self.assertEqual(r.status_code, 200)

    def test_session_cookie_is_httponly_and_samesite(self):
        r = self.client.post("/api/auth/register", json={"name": "Asha", "email": "a@b.co", "password": "Secret123"})
        cookie = r.headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Lax", cookie)

    def test_validation_errors(self):
        r = self.client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "short"})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(set(r.json["error"]["fields"]), {"name", "email", "password"})
        r = self.client.post("/api/auth/register", json={"name": "Asha", "email": "a@b.co", "password": "onlyletters"})
        self.assertIn("password", r.json["error"]["fields"])

    def test_duplicate_email_and_bad_login(self):
        self.signup()
        r = self.client.post("/api/auth/register", json={"name": "Other", "email": "ASHA@example.com", "password": "Secret123"})
        self.assertEqual(r.status_code, 409)
        bad = self.new_client().post("/api/auth/login", json={"email": "asha@example.com", "password": "wrong-pass1"})
        unknown = self.new_client().post("/api/auth/login", json={"email": "ghost@example.com", "password": "wrong-pass1"})
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.json, unknown.json)  # no hint about which emails exist

    def test_password_hash_is_not_plaintext(self):
        self.signup()
        with self.app.app_context():
            from backend.db import get_db
            stored = get_db().execute("SELECT password_hash FROM users WHERE email='asha@example.com'").fetchone()[0]
        self.assertNotIn("Secret123", stored)

    def test_non_json_write_is_rejected(self):
        r = self.client.post("/api/auth/login", data="email=a", content_type="application/x-www-form-urlencoded")
        self.assertEqual(r.status_code, 415)

    def test_change_password(self):
        self.signup()
        r = self.client.post("/api/auth/change-password", json={"current_password": "nope12345", "new_password": "Better456"})
        self.assertEqual(r.status_code, 422)
        r = self.client.post("/api/auth/change-password", json={"current_password": "Secret123", "new_password": "Better456"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.new_client().post("/api/auth/login", json={"email": "asha@example.com", "password": "Better456"}).status_code, 200)


class RateLimitTests(Base):
    rate_limit = True

    def test_login_is_throttled(self):
        codes = [self.client.post("/api/auth/login", json={"email": "x@y.co", "password": "whatever1"}).status_code
                 for _ in range(12)]
        self.assertEqual(codes[:10], [401] * 10)
        self.assertEqual(codes[10], 429)


class CartTests(Base):
    def test_quote_ignores_client_prices_and_applies_shipping(self):
        mouse = self.product("hp-z3700-wireless-mouse")  # ₹1,200
        r = self.client.post("/api/cart/quote", json={"items": [{"product_id": mouse["id"], "quantity": 2, "price": 1}]})
        self.assertEqual(r.json["subtotal"], 2400)
        self.assertEqual(r.json["shipping_fee"], 99)  # below the free-delivery threshold
        self.assertEqual(r.json["total"], 2499)
        laptop = self.product("hp-victus-16")
        r = self.client.post("/api/cart/quote", json={"items": [{"product_id": laptop["id"], "quantity": 1}]})
        self.assertEqual(r.json["shipping_fee"], 0)

    def test_quote_clamps_to_stock_and_flags_unavailable(self):
        laptop = self.product("hp-victus-16")
        r = self.client.post("/api/cart/quote", json={"items": [{"product_id": laptop["id"], "quantity": 99}, {"product_id": 9999, "quantity": 1}]})
        self.assertEqual(r.json["lines"][0]["quantity"], 10)
        self.assertEqual(r.json["lines"][0]["issue"], "limited_stock")
        self.assertEqual(r.json["unavailable"], [9999])

    def test_server_cart_requires_login_and_persists(self):
        self.assertEqual(self.client.get("/api/cart").status_code, 401)
        self.signup()
        mouse = self.product("apple-magic-mouse")["id"]
        self.client.post("/api/cart/items", json={"product_id": mouse, "quantity": 1})
        r = self.client.post("/api/cart/items", json={"product_id": mouse, "quantity": 2})
        self.assertEqual(r.json["lines"][0]["quantity"], 3)
        r = self.client.put(f"/api/cart/items/{mouse}", json={"quantity": 1})
        self.assertEqual(r.json["item_count"], 1)
        r = self.client.post("/api/cart/merge", json={"items": [{"product_id": mouse, "quantity": 2}]})
        self.assertEqual(r.json["item_count"], 3)
        r = self.client.delete(f"/api/cart/items/{mouse}")
        self.assertEqual(r.json["item_count"], 0)


class OrderTests(Base):
    def stock(self, slug):
        return self.product(slug)["stock"]

    def test_checkout_uses_db_prices_and_decrements_stock(self):
        self.signup()
        p = self.product("hp-victus-16")
        before = p["stock"]
        r = self.order([{"product_id": p["id"], "quantity": 2, "price": 1}])
        self.assertEqual(r.status_code, 201, r.json)
        order = r.json["order"]
        self.assertEqual(order["total"], 99900 * 2)
        self.assertEqual(order["items"][0]["unit_price"], 99900)
        self.assertEqual(order["payment_status"], "paid")
        self.assertRegex(order["order_number"], r"^TH-\d{6}-\d{5}$")
        self.assertEqual(self.stock("hp-victus-16"), before - 2)

    def test_cod_is_pending_and_requires_login(self):
        p = self.product("apple-magic-mouse")
        self.assertEqual(self.order([{"product_id": p["id"], "quantity": 1}]).status_code, 401)
        self.signup()
        r = self.order([{"product_id": p["id"], "quantity": 1}], method="cod")
        self.assertEqual(r.json["order"]["payment_status"], "pending")
        self.assertEqual(r.json["order"]["shipping_fee"], 0)  # ₹5,500 is over the threshold

    def test_cannot_oversell(self):
        self.signup()
        p = self.product("hp-victus-16")
        r = self.order([{"product_id": p["id"], "quantity": 10}])
        self.assertEqual(r.status_code, 201)
        r = self.order([{"product_id": p["id"], "quantity": 5}])
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json["error"]["code"], "stock_issue")
        self.assertEqual(r.json["error"]["details"][0]["available"], 2)
        self.assertEqual(self.stock("hp-victus-16"), 2)  # failed order changed nothing

    def test_failed_order_rolls_back_every_line(self):
        self.signup()
        ok = self.product("apple-magic-mouse")
        scarce = self.product("hp-victus-16")
        self.order([{"product_id": scarce["id"], "quantity": 10}])
        self.order([{"product_id": scarce["id"], "quantity": scarce["stock"] - 10}])  # now sold out
        r = self.order([{"product_id": ok["id"], "quantity": 1}, {"product_id": scarce["id"], "quantity": 1}])
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.stock("apple-magic-mouse"), ok["stock"])

    def test_shipping_validation(self):
        self.signup()
        p = self.product("apple-magic-mouse")
        bad = dict(SHIP, pincode="12", phone="123")
        r = self.order([{"product_id": p["id"], "quantity": 1}], ship=bad)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(set(r.json["error"]["fields"]), {"shipping.pincode", "shipping.phone"})
        r = self.client.post("/api/orders", json={"items": [{"product_id": p["id"], "quantity": 1}], "shipping": SHIP, "payment_method": "bitcoin"})
        self.assertEqual(r.status_code, 422)

    def test_orders_are_private(self):
        self.signup()
        p = self.product("apple-magic-mouse")
        oid = self.order([{"product_id": p["id"], "quantity": 1}]).json["order"]["id"]
        other = self.new_client()
        self.signup(other, email="other@example.com", name="Other Person")
        self.assertEqual(other.get(f"/api/orders/{oid}").status_code, 404)
        self.assertEqual(other.post(f"/api/orders/{oid}/cancel").status_code, 404)
        self.assertEqual(other.get("/api/orders").json["items"], [])
        self.assertEqual(self.client.get(f"/api/orders/{oid}").status_code, 200)

    def test_cancel_restocks_and_refunds(self):
        self.signup()
        p = self.product("hp-victus-16")
        oid = self.order([{"product_id": p["id"], "quantity": 3}]).json["order"]["id"]
        r = self.client.post(f"/api/orders/{oid}/cancel")
        self.assertEqual(r.json["order"]["status"], "cancelled")
        self.assertEqual(r.json["order"]["payment_status"], "refunded")
        self.assertEqual(self.stock("hp-victus-16"), p["stock"])
        self.assertEqual(self.client.post(f"/api/orders/{oid}/cancel").status_code, 409)

    def test_cannot_cancel_after_shipping(self):
        self.signup()
        p = self.product("apple-magic-mouse")
        oid = self.order([{"product_id": p["id"], "quantity": 1}]).json["order"]["id"]
        admin = self.admin_client()
        admin.patch(f"/api/admin/orders/{oid}", json={"status": "shipped"})
        self.assertEqual(self.client.post(f"/api/orders/{oid}/cancel").status_code, 409)

    def test_ordered_items_leave_the_saved_cart(self):
        self.signup()
        p = self.product("apple-magic-mouse")
        self.client.post("/api/cart/items", json={"product_id": p["id"], "quantity": 1})
        self.order([{"product_id": p["id"], "quantity": 1}])
        self.assertEqual(self.client.get("/api/cart").json["item_count"], 0)


class ReviewTests(Base):
    def test_review_flow(self):
        p = self.product("hp-victus-16")
        url = f"/api/products/{p['id']}/reviews"
        self.assertEqual(self.client.post(url, json={"rating": 5, "comment": "Great machine overall"}).status_code, 401)
        self.signup()
        self.assertEqual(self.client.post(url, json={"rating": 9, "comment": "short"}).status_code, 422)
        r = self.client.post(url, json={"rating": 5, "title": "Great", "comment": "Runs every game I own at max"})
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.json["review"]["verified"])
        self.assertEqual(r.json["review"]["author"], "Asha V.")  # full surname never exposed
        # posting again edits rather than duplicating
        r = self.client.post(url, json={"rating": 4, "comment": "Runs hot after a few hours"})
        self.assertEqual(r.status_code, 200)
        listing = self.client.get(url).json
        self.assertEqual(listing["summary"]["count"], 1)
        self.assertEqual(listing["summary"]["average"], 4)
        self.assertTrue(listing["items"][0]["mine"])
        self.assertEqual(self.client.get(f"/api/products/{p['id']}").json["product"]["rating"]["count"], 1)

    def test_verified_badge_and_delete_permissions(self):
        self.signup()
        p = self.product("hp-victus-16")
        self.order([{"product_id": p["id"], "quantity": 1}])
        r = self.client.post(f"/api/products/{p['id']}/reviews", json={"rating": 5, "comment": "Bought it, love it"})
        self.assertTrue(r.json["review"]["verified"])
        rid = r.json["review"]["id"]
        other = self.new_client()
        self.signup(other, email="o@example.com", name="Other Person")
        self.assertEqual(other.delete(f"/api/reviews/{rid}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/reviews/{rid}").status_code, 200)
        self.assertEqual(self.client.get("/api/reviews/latest").json["items"], [])


class AdminTests(Base):
    def test_requires_admin(self):
        self.assertEqual(self.client.get("/api/admin/stats").status_code, 401)
        self.signup()
        self.assertEqual(self.client.get("/api/admin/stats").status_code, 403)
        self.assertEqual(self.client.post("/api/admin/products", json={}).status_code, 403)

    def test_dashboard_and_order_lifecycle(self):
        self.signup()
        p = self.product("apple-magic-mouse")
        order = self.order([{"product_id": p["id"], "quantity": 1}], method="cod").json["order"]
        admin = self.admin_client()
        stats = admin.get("/api/admin/stats").json
        self.assertEqual(stats["orders"], 1)
        self.assertEqual(stats["revenue"], 5500)
        r = admin.patch(f"/api/admin/orders/{order['id']}", json={"status": "processing"})
        self.assertEqual(r.json["order"]["status"], "processing")
        admin.patch(f"/api/admin/orders/{order['id']}", json={"status": "delivered"})
        done = admin.get(f"/api/orders/{order['id']}").json["order"]
        self.assertEqual(done["payment_status"], "paid")  # COD is collected on delivery
        self.assertEqual([e["status"] for e in done["events"]], ["placed", "processing", "delivered"])
        back = admin.patch(f"/api/admin/orders/{order['id']}", json={"status": "placed"})
        self.assertEqual(back.status_code, 409)

    def test_product_crud(self):
        admin = self.admin_client()
        payload = {"name": "Test Laptop X", "brand": "Acme", "category": "laptops", "subcategory": "students",
                   "price": 45000, "stock": 7, "image": "/assets/img/products/hp-victus-16.webp",
                   "specs": {"RAM": "16GB", "": "ignored"}}
        r = admin.post("/api/admin/products", json=payload)
        self.assertEqual(r.status_code, 201, r.json)
        pid = r.json["product"]["id"]
        self.assertEqual(r.json["product"]["slug"], "test-laptop-x")
        self.assertEqual(r.json["product"]["specs"], {"RAM": "16GB"})
        self.assertEqual(self.client.get("/api/products/test-laptop-x").status_code, 200)

        r = admin.put(f"/api/admin/products/{pid}", json={"price": 41000, "stock": 0})
        self.assertEqual(r.json["product"]["price"], 41000)
        self.assertFalse(r.json["product"]["in_stock"])

        bad = admin.post("/api/admin/products", json=dict(payload, image="https://evil.example/x.png", price=-5))
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(set(bad.json["error"]["fields"]), {"image", "price"})

        self.assertEqual(admin.delete(f"/api/admin/products/{pid}").status_code, 200)
        self.assertEqual(self.client.get("/api/products/test-laptop-x").status_code, 404)
        self.assertEqual(admin.get("/api/admin/products?q=Test").json["total"], 1)  # still visible to admin


class FrontendServingTests(Base):
    def test_health_and_unknown_api(self):
        self.assertEqual(self.client.get("/healthz").json, {"status": "ok"})
        r = self.client.get("/api/does-not-exist")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json["error"]["code"], "not_found")

    def test_security_headers_and_traversal(self):
        r = self.client.get("/api/products?per_page=1")
        self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", r.headers["Content-Security-Policy"])
        self.assertEqual(r.headers["Cache-Control"], "no-store")
        self.assertEqual(self.client.get("/..%2f..%2fbackend%2fconfig.py").status_code, 404)
        self.assertEqual(self.client.get("/../backend/config.py").status_code, 404)


if __name__ == "__main__":
    unittest.main()
