"""Authentication helpers: password hashing, JWT sessions, route guards, rate limiting."""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db
from .utils import ApiError, iso

ALGORITHM = "HS256"


# ------------------------------------------------------------------ passwords
def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    return check_password_hash(password_hash, password)


# --------------------------------------------------------------------- tokens
def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=current_app.config["TOKEN_TTL_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm=ALGORITHM)


def _token_from_request() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(current_app.config["COOKIE_NAME"])


def set_auth_cookie(response, user_id: int):
    """HttpOnly cookie: JavaScript (and therefore any injected script) can't read the token."""
    response.set_cookie(
        current_app.config["COOKIE_NAME"],
        create_token(user_id),
        max_age=current_app.config["TOKEN_TTL_HOURS"] * 3600,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
        path="/",
    )
    return response


def clear_auth_cookie(response):
    response.delete_cookie(current_app.config["COOKIE_NAME"], path="/")
    return response


def current_user():
    """Return the logged-in user row (cached per request) or None."""
    if "current_user" in g:
        return g.current_user
    g.current_user = None
    token = _token_from_request()
    if token:
        try:
            data = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=[ALGORITHM])
            row = get_db().execute("SELECT * FROM users WHERE id = ?", (int(data["sub"]),)).fetchone()
            g.current_user = row
        except (jwt.PyJWTError, KeyError, ValueError):
            g.current_user = None
    return g.current_user


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "is_admin": bool(row["is_admin"]),
        "created_at": iso(row["created_at"]),
    }


# --------------------------------------------------------------------- guards
def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError("Please log in to continue.", 401, "auth_required")
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError("Please log in to continue.", 401, "auth_required")
        if not user["is_admin"]:
            raise ApiError("You don't have access to this area.", 403, "forbidden")
        return view(*args, **kwargs)
    return wrapper


# ----------------------------------------------------------------- rate limit
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(bucket: str, limit: int, window_seconds: int):
    """Sliding-window limiter, keyed by client IP. In-memory: fine for a single
    process; swap for Redis if you scale out to several workers."""
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            if current_app.config["RATE_LIMIT_ENABLED"]:
                key = f"{bucket}:{request.remote_addr}"
                now = time.monotonic()
                q = _hits[key]
                while q and now - q[0] > window_seconds:
                    q.popleft()
                if len(q) >= limit:
                    retry = int(window_seconds - (now - q[0])) + 1
                    err = ApiError("Too many attempts. Please wait a minute and try again.", 429, "rate_limited")
                    err.retry_after = retry
                    raise err
                q.append(now)
            return view(*args, **kwargs)
        return wrapper
    return decorator


def reset_rate_limits() -> None:
    _hits.clear()
