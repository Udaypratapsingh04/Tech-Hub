"""Cart endpoints.

Guests keep their cart in the browser and ask `/quote` for server-side prices.
Logged-in users have a persistent cart stored in the database (so it follows them
across devices); the browser merges its guest cart into it right after login.
"""
from flask import Blueprint, current_app, jsonify

from ..db import get_db, transaction
from ..security import current_user, login_required
from ..services import quote_cart
from ..utils import ApiError, json_body, raise_if_errors, to_int

bp = Blueprint("cart", __name__, url_prefix="/api/cart")


def _parse_items(data: dict, *, max_items: int = 50) -> list[dict]:
    raw = data.get("items")
    if not isinstance(raw, list):
        raise ApiError("items must be a list.", 422, "validation_error", fields={"items": "Must be a list."})
    if len(raw) > max_items:
        raise ApiError("Too many items.", 422, "validation_error")
    errors: dict = {}
    items = []
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            errors[f"items.{i}"] = "Invalid item."
            continue
        pid = to_int(entry.get("product_id"), f"items.{i}.product_id", minimum=1, errors=errors)
        qty = to_int(entry.get("quantity"), f"items.{i}.quantity", minimum=1,
                     maximum=current_app.config["MAX_QTY_PER_ITEM"] * 10, errors=errors)
        if pid and qty:
            items.append({"product_id": pid, "quantity": qty})
    raise_if_errors(errors)
    return items


def _server_quote(db, user_id: int) -> dict:
    rows = db.execute("SELECT product_id, quantity FROM cart_items WHERE user_id = ?", (user_id,)).fetchall()
    quote = quote_cart(db, [dict(r) for r in rows])
    if quote["unavailable"]:  # products that were archived since they were added
        marks = ",".join("?" * len(quote["unavailable"]))
        db.execute(f"DELETE FROM cart_items WHERE user_id = ? AND product_id IN ({marks})",
                   [user_id, *quote["unavailable"]])
    return quote


def _require_product(db, pid: int):
    row = db.execute("SELECT id FROM products WHERE id = ? AND active = 1", (pid,)).fetchone()
    if row is None:
        raise ApiError("This product is no longer available.", 404, "not_found")


@bp.post("/quote")
def quote():
    """Public: price an arbitrary list of items (used for guest carts and 'Buy now')."""
    items = _parse_items(json_body())
    return jsonify(quote_cart(get_db(), items))


@bp.get("")
@login_required
def get_cart():
    return jsonify(_server_quote(get_db(), current_user()["id"]))


@bp.post("/items")
@login_required
def add_item():
    data = json_body()
    errors: dict = {}
    pid = to_int(data.get("product_id"), "product_id", minimum=1, errors=errors)
    qty = to_int(data.get("quantity"), "quantity", minimum=1, maximum=current_app.config["MAX_QTY_PER_ITEM"],
                 errors=errors, default=1)
    raise_if_errors(errors)
    db, uid = get_db(), current_user()["id"]
    _require_product(db, pid)
    db.execute(
        """INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
           ON CONFLICT (user_id, product_id)
           DO UPDATE SET quantity = MIN(quantity + excluded.quantity, ?)""",
        (uid, pid, qty, current_app.config["MAX_QTY_PER_ITEM"]),
    )
    return jsonify(_server_quote(db, uid))


@bp.put("/items/<int:pid>")
@login_required
def set_item(pid: int):
    errors: dict = {}
    qty = to_int(json_body().get("quantity"), "quantity", minimum=0,
                 maximum=current_app.config["MAX_QTY_PER_ITEM"], errors=errors)
    raise_if_errors(errors)
    db, uid = get_db(), current_user()["id"]
    if qty == 0:
        db.execute("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", (uid, pid))
    else:
        _require_product(db, pid)
        db.execute(
            """INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
               ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = excluded.quantity""",
            (uid, pid, qty),
        )
    return jsonify(_server_quote(db, uid))


@bp.delete("/items/<int:pid>")
@login_required
def remove_item(pid: int):
    db, uid = get_db(), current_user()["id"]
    db.execute("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", (uid, pid))
    return jsonify(_server_quote(db, uid))


@bp.delete("")
@login_required
def clear_cart():
    db, uid = get_db(), current_user()["id"]
    db.execute("DELETE FROM cart_items WHERE user_id = ?", (uid,))
    return jsonify(_server_quote(db, uid))


@bp.post("/merge")
@login_required
def merge_cart():
    """Fold a guest cart (from localStorage) into the user's saved cart after login."""
    items = _parse_items(json_body())
    db, uid = get_db(), current_user()["id"]
    cap = current_app.config["MAX_QTY_PER_ITEM"]
    with transaction(db):
        for item in items:
            if db.execute("SELECT 1 FROM products WHERE id = ? AND active = 1", (item["product_id"],)).fetchone():
                db.execute(
                    """INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
                       ON CONFLICT (user_id, product_id)
                       DO UPDATE SET quantity = MIN(quantity + excluded.quantity, ?)""",
                    (uid, item["product_id"], min(item["quantity"], cap), cap),
                )
    return jsonify(_server_quote(db, uid))
