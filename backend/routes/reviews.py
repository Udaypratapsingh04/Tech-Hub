"""Product reviews: list, create/update, delete, and the latest-reviews feed for the home page."""
from flask import Blueprint, jsonify, request

from ..db import get_db
from ..security import current_user, login_required, rate_limit
from ..utils import ApiError, clean_str, iso, json_body, raise_if_errors, to_int

bp = Blueprint("reviews", __name__, url_prefix="/api")

REVIEW_SELECT = """
SELECT r.*, u.name AS author_name, p.name AS product_name, p.slug AS product_slug, p.image AS product_image,
       EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
               WHERE oi.product_id = r.product_id AND o.user_id = r.user_id AND o.status != 'cancelled') AS verified
FROM reviews r
JOIN users u    ON u.id = r.user_id
JOIN products p ON p.id = r.product_id
"""


def _public_name(full_name: str) -> str:
    """'Priya Sharma' -> 'Priya S.' (reviews are public; don't expose full names)."""
    parts = full_name.split()
    return f"{parts[0]} {parts[-1][0]}." if len(parts) > 1 else parts[0]


def review_dict(row, viewer_id: int | None) -> dict:
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "product_name": row["product_name"],
        "product_slug": row["product_slug"],
        "author": _public_name(row["author_name"]),
        "rating": row["rating"],
        "title": row["title"],
        "comment": row["comment"],
        "verified": bool(row["verified"]),
        "mine": viewer_id is not None and row["user_id"] == viewer_id,
        "created_at": iso(row["created_at"]),
    }


def _summary(db, product_id: int) -> dict:
    rows = db.execute("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? GROUP BY rating", (product_id,)).fetchall()
    dist = {str(i): 0 for i in range(1, 6)}
    total = weighted = 0
    for r in rows:
        dist[str(r["rating"])] = r["n"]
        total += r["n"]
        weighted += r["rating"] * r["n"]
    return {"average": round(weighted / total, 1) if total else 0, "count": total, "distribution": dist}


@bp.get("/products/<int:product_id>/reviews")
def list_reviews(product_id: int):
    db = get_db()
    if not db.execute("SELECT 1 FROM products WHERE id = ? AND active = 1", (product_id,)).fetchone():
        raise ApiError("Product not found.", 404, "not_found")
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 6, type=int), 1), 30)
    rows = db.execute(f"{REVIEW_SELECT} WHERE r.product_id = ? ORDER BY r.id DESC LIMIT ? OFFSET ?",
                      (product_id, per_page, (page - 1) * per_page)).fetchall()
    user = current_user()
    summary = _summary(db, product_id)
    return jsonify({
        "items": [review_dict(r, user["id"] if user else None) for r in rows],
        "summary": summary,
        "page": page,
        "pages": max((summary["count"] + per_page - 1) // per_page, 1),
    })


@bp.post("/products/<int:product_id>/reviews")
@login_required
@rate_limit("review", 20, 600)
def save_review(product_id: int):
    db, user = get_db(), current_user()
    if not db.execute("SELECT 1 FROM products WHERE id = ? AND active = 1", (product_id,)).fetchone():
        raise ApiError("Product not found.", 404, "not_found")
    data = json_body()
    errors: dict = {}
    rating = to_int(data.get("rating"), "rating", minimum=1, maximum=5, errors=errors)
    title = clean_str(data.get("title"), "title", max_len=100, required=False, errors=errors)
    comment = clean_str(data.get("comment"), "comment", min_len=10, max_len=1000, errors=errors)
    raise_if_errors(errors)

    existing = db.execute("SELECT id FROM reviews WHERE product_id = ? AND user_id = ?", (product_id, user["id"])).fetchone()
    if existing:  # one review per person per product: posting again edits it
        db.execute("UPDATE reviews SET rating=?, title=?, comment=?, updated_at=datetime('now') WHERE id=?",
                   (rating, title, comment, existing["id"]))
        review_id, status = existing["id"], 200
    else:
        review_id = db.execute("INSERT INTO reviews (product_id, user_id, rating, title, comment) VALUES (?,?,?,?,?)",
                               (product_id, user["id"], rating, title, comment)).lastrowid
        status = 201
    row = db.execute(f"{REVIEW_SELECT} WHERE r.id = ?", (review_id,)).fetchone()
    resp = jsonify({"review": review_dict(row, user["id"]), "summary": _summary(db, product_id)})
    resp.status_code = status
    return resp


@bp.delete("/reviews/<int:review_id>")
@login_required
def delete_review(review_id: int):
    db, user = get_db(), current_user()
    row = db.execute("SELECT * FROM reviews WHERE id = ?", (review_id,)).fetchone()
    if row is None or (row["user_id"] != user["id"] and not user["is_admin"]):
        raise ApiError("Review not found.", 404, "not_found")
    db.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
    return jsonify({"ok": True, "summary": _summary(db, row["product_id"])})


@bp.get("/reviews/latest")
def latest_reviews():
    limit = min(max(request.args.get("limit", 6, type=int), 1), 20)
    rows = get_db().execute(
        f"{REVIEW_SELECT} WHERE p.active = 1 AND r.rating >= 4 ORDER BY r.id DESC LIMIT ?", (limit,)).fetchall()
    return jsonify({"items": [review_dict(r, None) for r in rows]})
