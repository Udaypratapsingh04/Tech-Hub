"""First-run seeding: product catalog and the initial admin account."""
import json

from .db import transaction
from .security import hash_password
from .seed_data import PRODUCTS


def seed_products(db) -> int:
    """Insert the starter catalog, but only into an empty products table."""
    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0]:
        return 0
    with transaction(db):
        for p in PRODUCTS:
            db.execute(
                """INSERT INTO products
                   (slug, name, brand, category, subcategory, price, image, description,
                    specs, stock, is_new, is_featured)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (p["slug"], p["name"], p["brand"], p["category"], p["subcategory"], p["price"],
                 p["image"], p["description"], json.dumps(p["specs"]), p["stock"],
                 int(p["is_new"]), int(p["is_featured"])),
            )
    return len(PRODUCTS)


def ensure_admin(db, config) -> bool:
    """Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists."""
    if db.execute("SELECT 1 FROM users WHERE is_admin = 1").fetchone():
        return False
    existing = db.execute("SELECT id FROM users WHERE email = ?", (config["ADMIN_EMAIL"],)).fetchone()
    if existing:
        db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (existing["id"],))
        return True
    db.execute(
        "INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)",
        (config["ADMIN_NAME"], config["ADMIN_EMAIL"].lower(), hash_password(config["ADMIN_PASSWORD"])),
    )
    return True
