"""Checkout and order history."""
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify

from ..db import get_db, transaction
from ..security import current_user, login_required, rate_limit
from ..services import USER_CANCELLABLE, order_dict, restock_order, shipping_for
from ..utils import (ApiError, PIN_RE, clean_str, json_body, raise_if_errors, valid_email, valid_phone)
from .cart import _parse_items

bp = Blueprint("orders", __name__, url_prefix="/api/orders")

PAYMENT_METHODS = {"card", "upi", "netbanking", "cod"}


def _validate_shipping(raw, user) -> dict:
    if not isinstance(raw, dict):
        raise ApiError("Shipping details are required.", 422, "validation_error",
                       fields={"shipping": "Shipping details are required."})
    errors: dict = {}
    ship = {
        "name": clean_str(raw.get("name"), "shipping.name", min_len=2, max_len=80, errors=errors),
        "phone": valid_phone(raw.get("phone"), errors, "shipping.phone"),
        "email": valid_email(raw.get("email") or user["email"], errors, "shipping.email"),
        "address": clean_str(raw.get("address"), "shipping.address", min_len=5, max_len=200, errors=errors),
        "city": clean_str(raw.get("city"), "shipping.city", min_len=2, max_len=60, errors=errors),
        "state": clean_str(raw.get("state"), "shipping.state", min_len=2, max_len=60, errors=errors),
        "pincode": clean_str(raw.get("pincode"), "shipping.pincode", max_len=6, errors=errors),
    }
    if ship["pincode"] and not PIN_RE.match(ship["pincode"]):
        errors["shipping.pincode"] = "Enter a valid 6-digit PIN code."
    raise_if_errors(errors)
    return ship


@bp.post("")
@login_required
@rate_limit("checkout", 20, 600)
def create_order():
    data = json_body()
    user = current_user()
    items = _parse_items(data, max_items=20)
    if not items:
        raise ApiError("Your order has no items.", 422, "validation_error", fields={"items": "Add at least one item."})
    ship = _validate_shipping(data.get("shipping"), user)
    method = data.get("payment_method")
    if method not in PAYMENT_METHODS:
        raise ApiError("Choose a payment method.", 422, "validation_error",
                       fields={"payment_method": "Choose a payment method."})

    wanted: dict[int, int] = {}
    for item in items:
        wanted[item["product_id"]] = wanted.get(item["product_id"], 0) + item["quantity"]

    cap = current_app.config["MAX_QTY_PER_ITEM"]
    db = get_db()
    with transaction(db):
        issues, priced = [], []
        for pid, qty in wanted.items():
            row = db.execute("SELECT * FROM products WHERE id = ? AND active = 1", (pid,)).fetchone()
            if row is None:
                issues.append({"product_id": pid, "issue": "unavailable"})
            elif qty > cap:
                issues.append({"product_id": pid, "name": row["name"], "issue": "max_quantity", "available": cap})
            elif row["stock"] < qty:
                issues.append({"product_id": pid, "name": row["name"], "issue": "insufficient_stock",
                               "available": row["stock"]})
            else:
                priced.append((row, qty))
        if issues:
            raise ApiError("Some items in your order are no longer available in the quantity you chose.",
                           409, "stock_issue", details=issues)

        # Prices come from the database, never from the request.
        subtotal = sum(row["price"] * qty for row, qty in priced)
        shipping_fee = shipping_for(subtotal)
        payment_status = "pending" if method == "cod" else "paid"  # online payments are simulated

        cur = db.execute(
            """INSERT INTO orders (user_id, payment_method, payment_status, subtotal, shipping_fee, total,
                                   ship_name, ship_email, ship_phone, ship_address, ship_city, ship_state, ship_pincode)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user["id"], method, payment_status, subtotal, shipping_fee, subtotal + shipping_fee,
             ship["name"], ship["email"], ship["phone"], ship["address"], ship["city"], ship["state"], ship["pincode"]),
        )
        order_id = cur.lastrowid
        number = f"TH-{datetime.now(timezone.utc):%y%m%d}-{order_id:05d}"
        db.execute("UPDATE orders SET order_number = ? WHERE id = ?", (number, order_id))

        for row, qty in priced:
            updated = db.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
                                 (qty, row["id"], qty))
            if updated.rowcount != 1:  # lost a race with another checkout
                raise ApiError("An item just sold out. Please review your cart.", 409, "stock_issue",
                               details=[{"product_id": row["id"], "name": row["name"], "issue": "insufficient_stock"}])
            db.execute(
                "INSERT INTO order_items (order_id, product_id, name, image, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)",
                (order_id, row["id"], row["name"], row["image"], row["price"], qty),
            )
        db.execute("INSERT INTO order_events (order_id, status) VALUES (?, 'placed')", (order_id,))
        marks = ",".join("?" * len(priced))
        db.execute(f"DELETE FROM cart_items WHERE user_id = ? AND product_id IN ({marks})",
                   [user["id"], *[row["id"] for row, _ in priced]])

    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    resp = jsonify({"order": order_dict(db, order)})
    resp.status_code = 201
    return resp


@bp.get("")
@login_required
def my_orders():
    db = get_db()
    rows = db.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100",
                      (current_user()["id"],)).fetchall()
    return jsonify({"items": [order_dict(db, r) for r in rows]})


def _own_order(db, order_id: int):
    user = current_user()
    row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    # Same 404 for "doesn't exist" and "belongs to someone else" so ids can't be probed.
    if row is None or (row["user_id"] != user["id"] and not user["is_admin"]):
        raise ApiError("Order not found.", 404, "not_found")
    return row


@bp.get("/<int:order_id>")
@login_required
def order_detail(order_id: int):
    db = get_db()
    return jsonify({"order": order_dict(db, _own_order(db, order_id))})


@bp.post("/<int:order_id>/cancel")
@login_required
def cancel_order(order_id: int):
    db = get_db()
    user = current_user()
    with transaction(db):
        row = db.execute("SELECT * FROM orders WHERE id = ? AND user_id = ?", (order_id, user["id"])).fetchone()
        if row is None:
            raise ApiError("Order not found.", 404, "not_found")
        if row["status"] not in USER_CANCELLABLE:
            raise ApiError("This order can no longer be cancelled because it has already shipped.", 409, "not_cancellable")
        refund = "refunded" if row["payment_status"] == "paid" else "void"
        db.execute("UPDATE orders SET status = 'cancelled', payment_status = ?, updated_at = datetime('now') WHERE id = ?",
                   (refund, order_id))
        db.execute("INSERT INTO order_events (order_id, status) VALUES (?, 'cancelled')", (order_id,))
        restock_order(db, order_id)
    return jsonify({"order": order_dict(db, db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone())})
