"""Admin-only endpoints: dashboard stats, order management and product CRUD."""
import json
import re

from flask import Blueprint, jsonify, request

from ..db import get_db, transaction
from ..security import admin_required
from ..seed_data import CATEGORIES
from ..services import (ADMIN_CANCELLABLE, ORDER_FLOW, PRODUCT_SELECT, order_dict, product_dict, restock_order)
from ..utils import ApiError, clean_str, json_body, like_escape, raise_if_errors, to_int

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

VALID_SUBCATEGORIES = {(c["category"], c["subcategory"]) for c in CATEGORIES}


@bp.before_request
@admin_required
def _guard():
    """Every route in this blueprint requires an admin."""


# ----------------------------------------------------------------------- stats
@bp.get("/stats")
def stats():
    db = get_db()
    one = lambda sql, *p: db.execute(sql, p).fetchone()[0]  # noqa: E731
    revenue = one("SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelled'")
    by_status = {r["status"]: r["n"] for r in db.execute("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")}
    low_stock = db.execute(
        "SELECT id, name, stock, image FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock, name LIMIT 8"
    ).fetchall()
    recent = db.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 6").fetchall()
    return jsonify({
        "revenue": revenue,
        "orders": sum(by_status.values()),
        "orders_by_status": by_status,
        "customers": one("SELECT COUNT(*) FROM users WHERE is_admin = 0"),
        "products": one("SELECT COUNT(*) FROM products WHERE active = 1"),
        "low_stock": [dict(r) for r in low_stock],
        "recent_orders": [order_dict(db, r, include_user=True) for r in recent],
    })


# ---------------------------------------------------------------------- orders
@bp.get("/orders")
def list_orders():
    db = get_db()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = 15
    where, params = "1=1", []
    status = request.args.get("status")
    if status:
        where += " AND status = ?"
        params.append(status)
    q = request.args.get("q", "").strip()
    if q:
        where += " AND (order_number LIKE ? ESCAPE '\\' OR ship_name LIKE ? ESCAPE '\\' OR ship_email LIKE ? ESCAPE '\\')"
        params += [f"%{like_escape(q)}%"] * 3
    total = db.execute(f"SELECT COUNT(*) FROM orders WHERE {where}", params).fetchone()[0]
    rows = db.execute(f"SELECT * FROM orders WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?",
                      params + [per_page, (page - 1) * per_page]).fetchall()
    return jsonify({"items": [order_dict(db, r, include_user=True) for r in rows], "total": total,
                    "page": page, "pages": max((total + per_page - 1) // per_page, 1)})


@bp.patch("/orders/<int:order_id>")
def update_order(order_id: int):
    new_status = json_body().get("status")
    if new_status not in ORDER_FLOW + ["cancelled"]:
        raise ApiError("Unknown status.", 422, "validation_error", fields={"status": "Unknown status."})
    db = get_db()
    with transaction(db):
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if row is None:
            raise ApiError("Order not found.", 404, "not_found")
        current = row["status"]
        if new_status == current:
            return jsonify({"order": order_dict(db, row, include_user=True)})
        if new_status == "cancelled":
            if current not in ADMIN_CANCELLABLE:
                raise ApiError(f"A {current} order can't be cancelled.", 409, "invalid_transition")
            payment = "refunded" if row["payment_status"] == "paid" else "void"
            restock_order(db, order_id)
        else:
            if current in ("delivered", "cancelled") or ORDER_FLOW.index(new_status) < ORDER_FLOW.index(current):
                raise ApiError(f"Can't move an order from {current} to {new_status}.", 409, "invalid_transition")
            payment = "paid" if new_status == "delivered" and row["payment_method"] == "cod" else row["payment_status"]
        db.execute("UPDATE orders SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?",
                   (new_status, payment, order_id))
        db.execute("INSERT INTO order_events (order_id, status) VALUES (?, ?)", (order_id, new_status))
    row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return jsonify({"order": order_dict(db, row, include_user=True)})


# -------------------------------------------------------------------- products
def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "product"


def _unique_slug(db, name: str, ignore_id: int | None = None) -> str:
    base, slug, n = _slugify(name), _slugify(name), 2
    while db.execute("SELECT 1 FROM products WHERE slug = ? AND id != ?", (slug, ignore_id or -1)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _validate_product(data: dict, partial_from=None) -> dict:
    """Validate a product payload. For updates, missing keys fall back to the current row."""
    cur = product_dict(partial_from) if partial_from is not None else {}
    get = lambda k, d=None: data.get(k, cur.get(k, d))  # noqa: E731
    errors: dict = {}
    out = {
        "name": clean_str(get("name"), "name", min_len=2, max_len=120, errors=errors),
        "brand": clean_str(get("brand", ""), "brand", max_len=60, required=False, errors=errors),
        "price": to_int(get("price"), "price", minimum=0, maximum=10_000_000, errors=errors),
        "stock": to_int(get("stock"), "stock", minimum=0, maximum=100_000, errors=errors),
        "description": clean_str(get("description", ""), "description", max_len=2000, required=False, errors=errors),
        "image": clean_str(get("image"), "image", max_len=300, errors=errors),
    }
    category, sub = get("category"), get("subcategory")
    if (category, sub) not in VALID_SUBCATEGORIES:
        errors["subcategory"] = "Choose a valid category and type."
    out["category"], out["subcategory"] = category, sub
    if out["image"] and not out["image"].startswith("/assets/img/"):
        errors["image"] = "Image must be a file inside frontend/assets/img/ (e.g. /assets/img/products/my-laptop.webp)."
    specs = get("specs", {})
    if not isinstance(specs, dict) or len(specs) > 12:
        errors["specs"] = "Specs must be an object with at most 12 entries."
        specs = {}
    out["specs"] = {str(k).strip()[:40]: str(v).strip()[:100] for k, v in specs.items() if str(k).strip() and str(v).strip()}
    for flag, default in (("is_new", False), ("is_featured", False), ("active", True)):
        out[flag] = int(bool(get(flag, default)))
    raise_if_errors(errors)
    return out


@bp.get("/products")
def list_products():
    db = get_db()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 20, type=int), 1), 100)
    where, params = "1=1", []
    q = request.args.get("q", "").strip()
    if q:
        where += " AND (p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\')"
        params += [f"%{like_escape(q)}%"] * 2
    total = db.execute(f"SELECT COUNT(*) FROM products p WHERE {where}", params).fetchone()[0]
    rows = db.execute(f"{PRODUCT_SELECT} WHERE {where} ORDER BY p.id DESC LIMIT ? OFFSET ?",
                      params + [per_page, (page - 1) * per_page]).fetchall()
    return jsonify({"items": [product_dict(r) for r in rows], "total": total, "page": page,
                    "pages": max((total + per_page - 1) // per_page, 1)})


@bp.post("/products")
def create_product():
    data = _validate_product(json_body())
    db = get_db()
    slug = _unique_slug(db, data["name"])
    pid = db.execute(
        """INSERT INTO products (slug, name, brand, category, subcategory, price, image, description,
                                 specs, stock, is_new, is_featured, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (slug, data["name"], data["brand"], data["category"], data["subcategory"], data["price"], data["image"],
         data["description"], json.dumps(data["specs"]), data["stock"], data["is_new"], data["is_featured"],
         data["active"]),
    ).lastrowid
    resp = jsonify({"product": product_dict(db.execute(f"{PRODUCT_SELECT} WHERE p.id = ?", (pid,)).fetchone())})
    resp.status_code = 201
    return resp


def _get_or_404(db, pid: int):
    row = db.execute(f"{PRODUCT_SELECT} WHERE p.id = ?", (pid,)).fetchone()
    if row is None:
        raise ApiError("Product not found.", 404, "not_found")
    return row


@bp.put("/products/<int:pid>")
def update_product(pid: int):
    db = get_db()
    row = _get_or_404(db, pid)
    data = _validate_product(json_body(), partial_from=row)
    db.execute(
        """UPDATE products SET name=?, brand=?, category=?, subcategory=?, price=?, image=?, description=?,
                               specs=?, stock=?, is_new=?, is_featured=?, active=? WHERE id=?""",
        (data["name"], data["brand"], data["category"], data["subcategory"], data["price"], data["image"],
         data["description"], json.dumps(data["specs"]), data["stock"], data["is_new"], data["is_featured"],
         data["active"], pid),
    )
    return jsonify({"product": product_dict(_get_or_404(db, pid))})


@bp.delete("/products/<int:pid>")
def archive_product(pid: int):
    """Soft delete: hides the product from the store but keeps order history intact."""
    db = get_db()
    _get_or_404(db, pid)
    db.execute("UPDATE products SET active = 0 WHERE id = ?", (pid,))
    db.execute("DELETE FROM cart_items WHERE product_id = ?", (pid,))
    return jsonify({"ok": True})
