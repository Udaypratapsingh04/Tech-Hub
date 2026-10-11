"""Public catalog endpoints: search/filter/sort products, details, categories, compare."""
from flask import Blueprint, current_app, jsonify, request

from ..db import get_db
from ..seed_data import CATEGORIES
from ..services import PRODUCT_SELECT, product_dict
from ..utils import ApiError, like_escape

bp = Blueprint("catalog", __name__, url_prefix="/api")

SORTS = {
    "featured": "p.is_featured DESC, p.is_new DESC, p.id ASC",
    "price_asc": "p.price ASC, p.id ASC",
    "price_desc": "p.price DESC, p.id ASC",
    "newest": "p.is_new DESC, p.id DESC",
    "rating": "rating_avg DESC, rating_count DESC, p.id ASC",
    "name": "p.name COLLATE NOCASE ASC",
}
SPEC_ORDER = ["Display", "Processor", "Graphics", "RAM", "Storage"]


def _int_arg(name: str, default=None):
    try:
        return int(request.args.get(name, ""))
    except ValueError:
        return default


def _csv_arg(name: str) -> list[str]:
    return [v.strip() for v in request.args.get(name, "").split(",") if v.strip()]


def _filters(*, brand=True, price=True, stock=True):
    """Build a WHERE clause from query-string filters. Everything is parameterised."""
    where, params = ["p.active = 1"], []

    for column, arg in (("p.category", "category"), ("p.subcategory", "subcategory")):
        values = _csv_arg(arg)
        if values:
            where.append(f"{column} IN ({','.join('?' * len(values))})")
            params += values

    q = request.args.get("q", "").strip()[:80]
    for token in q.split():
        like = f"%{like_escape(token)}%"
        where.append("(p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' "
                     "OR p.subcategory LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')")
        params += [like] * 4

    if request.args.get("is_new") == "1":
        where.append("p.is_new = 1")
    if brand:
        brands = _csv_arg("brand")
        if brands:
            where.append(f"p.brand IN ({','.join('?' * len(brands))})")
            params += brands
    if price:
        low, high = _int_arg("min_price"), _int_arg("max_price")
        if low is not None:
            where.append("p.price >= ?")
            params.append(low)
        if high is not None:
            where.append("p.price <= ?")
            params.append(high)
    if stock and request.args.get("in_stock") == "1":
        where.append("p.stock > 0")
    return " AND ".join(where), params


@bp.get("/products")
def list_products():
    db = get_db()
    page = max(_int_arg("page", 1), 1)
    per_page = min(max(_int_arg("per_page", 12), 1), 48)
    order = SORTS.get(request.args.get("sort", "featured"), SORTS["featured"])

    where, params = _filters()
    total = db.execute(f"SELECT COUNT(*) FROM products p WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"{PRODUCT_SELECT} WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
        params + [per_page, (page - 1) * per_page],
    ).fetchall()

    # Facets ignore the brand/price/stock filters so the sidebar always shows what's available.
    base_where, base_params = _filters(brand=False, price=False, stock=False)
    brands = db.execute(
        f"SELECT brand, COUNT(*) AS n FROM products p WHERE {base_where} AND brand != '' "
        "GROUP BY brand ORDER BY brand COLLATE NOCASE", base_params).fetchall()
    bounds = db.execute(
        f"SELECT MIN(price), MAX(price) FROM products p WHERE {base_where}", base_params).fetchone()

    return jsonify({
        "items": [product_dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max((total + per_page - 1) // per_page, 1),
        "facets": {
            "brands": [{"name": b["brand"], "count": b["n"]} for b in brands],
            "price": {"min": bounds[0] or 0, "max": bounds[1] or 0},
        },
    })


def _find_product(db, ident: str):
    column = "p.id" if ident.isdigit() else "p.slug"
    row = db.execute(f"{PRODUCT_SELECT} WHERE {column} = ? AND p.active = 1", (ident,)).fetchone()
    if row is None:
        raise ApiError("Product not found.", 404, "not_found")
    return row


@bp.get("/products/<ident>")
def product_detail(ident):
    return jsonify({"product": product_dict(_find_product(get_db(), ident))})


@bp.get("/products/<ident>/related")
def related_products(ident):
    db = get_db()
    row = _find_product(db, ident)
    rows = db.execute(
        f"""{PRODUCT_SELECT}
            WHERE p.active = 1 AND p.id != ? AND p.category = ?
            ORDER BY (p.subcategory = ?) DESC, ABS(p.price - ?) ASC LIMIT 4""",
        (row["id"], row["category"], row["subcategory"], row["price"]),
    ).fetchall()
    return jsonify({"items": [product_dict(r) for r in rows]})


@bp.get("/categories")
def categories():
    db = get_db()
    out = []
    for meta in CATEGORIES:
        stats = db.execute(
            "SELECT COUNT(*) AS n, MIN(price) AS min_price FROM products "
            "WHERE active = 1 AND category = ? AND subcategory = ?",
            (meta["category"], meta["subcategory"]),
        ).fetchone()
        cover = db.execute(
            "SELECT image, name FROM products WHERE active = 1 AND category = ? AND subcategory = ? "
            "ORDER BY is_featured DESC, id ASC LIMIT 1",
            (meta["category"], meta["subcategory"]),
        ).fetchone()
        out.append({
            **meta,
            "count": stats["n"],
            "min_price": stats["min_price"],
            "image": cover["image"] if cover else None,
            "image_alt": cover["name"] if cover else "",
        })
    return jsonify({"items": out})


@bp.get("/compare")
def compare():
    try:
        ids = [int(x) for x in request.args.get("ids", "").split(",") if x.strip()]
    except ValueError:
        raise ApiError("ids must be a comma-separated list of product ids.", 400, "bad_request")
    ids = list(dict.fromkeys(ids))[:4]
    if not ids:
        return jsonify({"items": [], "spec_keys": []})
    db = get_db()
    marks = ",".join("?" * len(ids))
    found = {r["id"]: r for r in db.execute(f"{PRODUCT_SELECT} WHERE p.active = 1 AND p.id IN ({marks})", ids)}
    items = [product_dict(found[i]) for i in ids if i in found]
    keys: list[str] = []
    for item in items:
        for key in item["specs"]:
            if key not in keys:
                keys.append(key)
    keys.sort(key=lambda k: (SPEC_ORDER.index(k) if k in SPEC_ORDER else len(SPEC_ORDER), k))
    return jsonify({"items": items, "spec_keys": keys})


@bp.get("/config")
def store_config():
    """Store rules the UI needs to display (so they live in one place: the server)."""
    cfg = current_app.config
    return jsonify({
        "free_shipping_threshold": cfg["FREE_SHIPPING_THRESHOLD"],
        "shipping_fee": cfg["SHIPPING_FEE"],
        "max_qty_per_item": cfg["MAX_QTY_PER_ITEM"],
    })
