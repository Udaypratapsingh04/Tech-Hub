"""Application configuration.

Everything is driven by environment variables (optionally loaded from a `.env`
file in the project root) so nothing sensitive lives in source control.
"""
import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INSTANCE_DIR = ROOT / "instance"
FRONTEND_DIR = ROOT / "frontend"


def _load_dotenv() -> None:
    """Tiny .env loader (KEY=VALUE per line) so we don't need an extra dependency."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _persistent_secret() -> str:
    """Use SECRET_KEY if provided, otherwise generate one once and keep it on disk
    so login sessions survive server restarts."""
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    INSTANCE_DIR.mkdir(exist_ok=True)
    key_file = INSTANCE_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    return key


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_config() -> dict:
    _load_dotenv()
    env = os.environ.get("APP_ENV", "development").lower()
    is_prod = env == "production"

    cfg = {
        "ENV_NAME": env,
        "SECRET_KEY": _persistent_secret(),
        "DATABASE": os.environ.get("DATABASE_PATH", str(INSTANCE_DIR / "techhub.db")),
        "FRONTEND_DIR": str(FRONTEND_DIR),
        # Auth
        "TOKEN_TTL_HOURS": int(os.environ.get("TOKEN_TTL_HOURS", 24 * 7)),
        "COOKIE_NAME": "th_session",
        "COOKIE_SECURE": _bool("COOKIE_SECURE", is_prod),
        "RATE_LIMIT_ENABLED": _bool("RATE_LIMIT_ENABLED", True),
        # Store rules
        "FREE_SHIPPING_THRESHOLD": int(os.environ.get("FREE_SHIPPING_THRESHOLD", 5000)),
        "SHIPPING_FEE": int(os.environ.get("SHIPPING_FEE", 99)),
        "MAX_QTY_PER_ITEM": int(os.environ.get("MAX_QTY_PER_ITEM", 10)),
        # First admin account (created automatically if no admin exists)
        "ADMIN_EMAIL": os.environ.get("ADMIN_EMAIL", "admin@techhub.local"),
        "ADMIN_PASSWORD": os.environ.get("ADMIN_PASSWORD", "Admin@12345"),
        "ADMIN_NAME": os.environ.get("ADMIN_NAME", "Store Admin"),
        "MAX_CONTENT_LENGTH": 1024 * 1024,
        "JSON_SORT_KEYS": False,
    }

    if is_prod and cfg["ADMIN_PASSWORD"] == "Admin@12345":
        raise RuntimeError("Set ADMIN_PASSWORD in the environment before running in production.")
    return cfg
