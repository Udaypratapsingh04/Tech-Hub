"""TECH HUB backend: a Flask JSON API that also serves the static storefront."""
import logging
from pathlib import Path

import click
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException, NotFound

from .config import load_config
from .db import close_db, get_db, init_db
from .seed import ensure_admin, seed_products
from .utils import ApiError

# URL -> frontend/<name>.html  (so links look like /shop instead of /shop.html)
PAGES = {"index", "shop", "product", "compare", "cart", "checkout", "order", "account", "login", "signup", "admin"}

CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


def create_app(overrides: dict | None = None) -> Flask:
    config = load_config()
    config.update(overrides or {})
    app = Flask(__name__, static_folder=None)
    app.config.update(config)
    app.url_map.strict_slashes = False
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    init_db(app)
    with app.app_context():
        db = get_db()
        seeded = seed_products(db)
        created_admin = ensure_admin(db, app.config)
        if seeded:
            app.logger.info("Seeded %d products.", seeded)
        if created_admin:
            app.logger.warning("Created admin account %s (change this password after first login).",
                               app.config["ADMIN_EMAIL"])
    app.teardown_appcontext(close_db)

    from .routes import admin, auth, cart, catalog, orders, reviews
    for module in (auth, catalog, cart, orders, reviews, admin):
        app.register_blueprint(module.bp)

    _register_hooks(app)
    _register_errors(app)
    _register_frontend(app)
    _register_cli(app)
    return app


def _register_hooks(app: Flask) -> None:
    @app.before_request
    def require_json_for_writes():
        # Browsers can't send cross-site JSON without a CORS preflight (which we never
        # grant), so insisting on JSON is a cheap extra layer of CSRF protection.
        if request.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH"):
            if request.content_length and not request.is_json:
                raise ApiError("Content-Type must be application/json.", 415, "unsupported_media_type")

    @app.after_request
    def add_headers(resp):
        resp.headers.setdefault("Content-Security-Policy", CSP)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        path = request.path
        if path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        elif path.startswith("/assets/img/"):
            resp.headers["Cache-Control"] = "public, max-age=604800"
        else:  # HTML/CSS/JS: always revalidate (cheap 304s thanks to ETags)
            resp.headers["Cache-Control"] = "no-cache"
        return resp


def _register_errors(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(err: ApiError):
        resp = jsonify(err.to_dict())
        resp.status_code = err.status
        if hasattr(err, "retry_after"):
            resp.headers["Retry-After"] = str(err.retry_after)
        return resp

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        if request.path.startswith("/api/"):
            resp = jsonify({"error": {"code": err.name.lower().replace(" ", "_"), "message": err.description}})
            resp.status_code = err.code
            return resp
        return err

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        app.logger.exception("Unhandled error")
        if request.path.startswith("/api/"):
            resp = jsonify({"error": {"code": "server_error", "message": "Something went wrong on our side."}})
            resp.status_code = 500
            return resp
        return "Something went wrong.", 500


def _register_frontend(app: Flask) -> None:
    root = Path(app.config["FRONTEND_DIR"])

    @app.get("/")
    def home():
        return send_from_directory(root, "index.html")

    @app.get("/healthz")
    def health():
        get_db().execute("SELECT 1")
        return jsonify({"status": "ok"})

    @app.get("/<path:path>")
    def frontend(path: str):
        if path.startswith("api/"):
            raise ApiError("Endpoint not found.", 404, "not_found")
        if path in PAGES:
            path += ".html"
        try:
            return send_from_directory(root, path)
        except NotFound:
            resp = send_from_directory(root, "404.html")
            resp.status_code = 404
            return resp


def _register_cli(app: Flask) -> None:
    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    @click.option("--name", default="Store Admin")
    def create_admin(email, password, name):
        """Create (or promote) an admin account:  flask --app backend create-admin EMAIL PASSWORD"""
        from .security import hash_password
        db = get_db()
        row = db.execute("SELECT id FROM users WHERE email = ?", (email.lower(),)).fetchone()
        if row:
            db.execute("UPDATE users SET is_admin = 1, password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
        else:
            db.execute("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)",
                       (name, email.lower(), hash_password(password)))
        click.echo(f"Admin ready: {email}")
