"""SQLite access layer: connection handling, schema and a transaction helper."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    phone         TEXT    NOT NULL DEFAULT '',
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    brand       TEXT    NOT NULL DEFAULT '',
    category    TEXT    NOT NULL CHECK (category IN ('laptops', 'accessories')),
    subcategory TEXT    NOT NULL,
    price       INTEGER NOT NULL CHECK (price >= 0),
    image       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    specs       TEXT    NOT NULL DEFAULT '{}',
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_new      INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category, subcategory, active);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products (price);

CREATE TABLE IF NOT EXISTS cart_items (
    user_id    INTEGER NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number   TEXT    UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users (id),
    status         TEXT    NOT NULL DEFAULT 'placed'
                   CHECK (status IN ('placed', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_method TEXT    NOT NULL CHECK (payment_method IN ('card', 'upi', 'netbanking', 'cod')),
    payment_status TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (payment_status IN ('paid', 'pending', 'refunded', 'void')),
    subtotal       INTEGER NOT NULL,
    shipping_fee   INTEGER NOT NULL,
    total          INTEGER NOT NULL,
    ship_name      TEXT    NOT NULL,
    ship_email     TEXT    NOT NULL DEFAULT '',
    ship_phone     TEXT    NOT NULL,
    ship_address   TEXT    NOT NULL,
    ship_city      TEXT    NOT NULL,
    ship_state     TEXT    NOT NULL,
    ship_pincode   TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id),
    name       TEXT    NOT NULL,
    image      TEXT    NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity   INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    status     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title      TEXT    NOT NULL DEFAULT '',
    comment    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, user_id)
);
"""


def get_db() -> sqlite3.Connection:
    """One connection per request, stored on flask.g."""
    if "db" not in g:
        conn = sqlite3.connect(current_app.config["DATABASE"], isolation_level=None, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


def close_db(_exc=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection):
    """BEGIN IMMEDIATE takes the write lock up-front, so concurrent checkouts can't
    both read the same stock level and oversell."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def init_db(app) -> None:
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db = get_db()
        db.executescript(SCHEMA)
