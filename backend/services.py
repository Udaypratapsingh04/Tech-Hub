"""Serializers and business logic shared by several routes."""
import json

from flask import current_app

from .utils import iso

# Products joined with their review aggregates. Used everywhere a product is returned.
PRODUCT_SELECT = """
SELECT p.*, COALESCE(r.avg_rating, 0) AS rating_avg, COALESCE(r.cnt, 0) AS rating_count
FROM products p
LEFT JOIN (
    SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews GROUP BY product_id
) r ON r.product_id = p.id
"""


def product_dict(row) -> dict:
    keys = row.keys()
    data = {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "brand": row["brand"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "price": row["price"],
        "image": row["image"],
        "description": row["description"],
        "specs": json.loads(row["specs"] or "{}"),
        "stock": row["stock"],
        "in_stock": row["stock"] > 0,
        "low_stock": 0 < row["stock"] <= 5,
        "is_new": bool(row["is_new"]),
        "is_featured": bool(row["is_featured"]),
        "active": bool(row["active"]),
    }
    if "rating_avg" in keys:
        data["rating"] = {"average": round(row["rating_avg"], 1), "count": row["rating_count"]}
    return data


def product_brief(row) -> dict:
    return {k: row[k] for k in ("id", "slug", "name", "brand", "price", "image", "stock", "category", "subcategory")}


# ------------------------------------------------------------------- cart math
def shipping_for(subtotal: int) -> int:
    cfg = current_app.config
    if subtotal <= 0 or subtotal >= cfg["FREE_SHIPPING_THRESHOLD"]:
        return 0
    return cfg["SHIPPING_FEE"]


def quote_cart(db, items: list[dict]) -> dict:
    """Price a list of {product_id, quantity} using *database* prices and stock.

    The client never tells us what something costs - only what it wants. That is what
    makes the totals trustworthy.
    """
    cfg = current_app.config
    merged: dict[int, int] = {}
    for item in items:
        pid, qty = int(item["product_id"]), int(item["quantity"])
        merged[pid] = merged.get(pid, 0) + max(qty, 0)

    rows = {}
    if merged:
        marks = ",".join("?" * len(merged))
        for row in db.execute(f"SELECT * FROM products WHERE active = 1 AND id IN ({marks})", list(merged)):
            rows[row["id"]] = row

    lines, unavailable, subtotal = [], [], 0
    for pid, requested in merged.items():
        row = rows.get(pid)
        if row is None:
            unavailable.append(pid)
            continue
        effective = min(requested, cfg["MAX_QTY_PER_ITEM"], row["stock"])
        issue = None
        if row["stock"] == 0:
            issue = "out_of_stock"
        elif requested > row["stock"]:
            issue = "limited_stock"
        elif requested > cfg["MAX_QTY_PER_ITEM"]:
            issue = "max_quantity"
        line_total = row["price"] * effective
        subtotal += line_total
        lines.append({
            "product": product_brief(row),
            "quantity": effective,
            "requested": requested,
            "line_total": line_total,
            "issue": issue,
        })

    shipping = shipping_for(subtotal)
    threshold = cfg["FREE_SHIPPING_THRESHOLD"]
    return {
        "lines": lines,
        "unavailable": unavailable,
        "item_count": sum(l["quantity"] for l in lines),
        "subtotal": subtotal,
        "shipping_fee": shipping,
        "total": subtotal + shipping,
        "free_shipping_threshold": threshold,
        "amount_to_free_shipping": max(threshold - subtotal, 0) if subtotal > 0 else threshold,
    }


# ---------------------------------------------------------------------- orders
ORDER_FLOW = ["placed", "processing", "shipped", "delivered"]
USER_CANCELLABLE = {"placed", "processing"}
ADMIN_CANCELLABLE = {"placed", "processing", "shipped"}


def order_dict(db, row, include_user: bool = False) -> dict:
    items = db.execute(
        "SELECT product_id, name, image, unit_price, quantity FROM order_items WHERE order_id = ? ORDER BY id",
        (row["id"],),
    ).fetchall()
    events = db.execute(
        "SELECT status, created_at FROM order_events WHERE order_id = ? ORDER BY id", (row["id"],)
    ).fetchall()
    data = {
        "id": row["id"],
        "order_number": row["order_number"],
        "status": row["status"],
        "payment_method": row["payment_method"],
        "payment_status": row["payment_status"],
        "subtotal": row["subtotal"],
        "shipping_fee": row["shipping_fee"],
        "total": row["total"],
        "shipping": {
            "name": row["ship_name"], "email": row["ship_email"], "phone": row["ship_phone"],
            "address": row["ship_address"], "city": row["ship_city"],
            "state": row["ship_state"], "pincode": row["ship_pincode"],
        },
        "items": [
            {"product_id": i["product_id"], "name": i["name"], "image": i["image"],
             "unit_price": i["unit_price"], "quantity": i["quantity"],
             "line_total": i["unit_price"] * i["quantity"]}
            for i in items
        ],
        "events": [{"status": e["status"], "at": iso(e["created_at"])} for e in events],
        "can_cancel": row["status"] in USER_CANCELLABLE,
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
    }
    if include_user:
        user = db.execute("SELECT id, name, email FROM users WHERE id = ?", (row["user_id"],)).fetchone()
        data["user"] = dict(user) if user else None
    return data


def restock_order(db, order_id: int) -> None:
    for item in db.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,)):
        db.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (item["quantity"], item["product_id"]))
