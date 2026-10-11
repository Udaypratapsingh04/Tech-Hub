"""Registration, login/logout and profile endpoints."""
import sqlite3

from flask import Blueprint, jsonify

from ..db import get_db
from ..security import (clear_auth_cookie, current_user, hash_password, login_required, public_user,
                        rate_limit, set_auth_cookie, verify_password)
from ..utils import (ApiError, clean_str, json_body, raise_if_errors, valid_email, valid_password,
                     valid_phone)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = hash_password("not-a-real-password-1")


@bp.post("/register")
@rate_limit("register", 10, 600)
def register():
    data = json_body()
    errors: dict = {}
    name = clean_str(data.get("name"), "name", min_len=2, max_len=80, errors=errors)
    email = valid_email(data.get("email"), errors)
    password = valid_password(data.get("password"), errors)
    if "confirm_password" in data and data["confirm_password"] != data.get("password"):
        errors["confirm_password"] = "Passwords do not match."
    raise_if_errors(errors)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, hash_password(password)),
        )
    except sqlite3.IntegrityError:
        raise ApiError("An account with this email already exists.", 409, "email_taken",
                       fields={"email": "This email is already registered. Try logging in."})
    user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    resp = jsonify({"user": public_user(user)})
    resp.status_code = 201
    return set_auth_cookie(resp, user["id"])


@bp.post("/login")
@rate_limit("login", 10, 60)
def login():
    data = json_body()
    errors: dict = {}
    email = valid_email(data.get("email"), errors)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    raise_if_errors(errors)

    user = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    ok = verify_password(user["password_hash"] if user else _DUMMY_HASH, password)
    if not user or not ok:
        raise ApiError("Incorrect email or password.", 401, "invalid_credentials")
    return set_auth_cookie(jsonify({"user": public_user(user)}), user["id"])


@bp.post("/logout")
def logout():
    return clear_auth_cookie(jsonify({"ok": True}))


@bp.get("/me")
def me():
    user = current_user()
    return jsonify({"user": public_user(user) if user else None})


@bp.patch("/me")
@login_required
def update_profile():
    data = json_body()
    errors: dict = {}
    user = current_user()
    name = clean_str(data.get("name", user["name"]), "name", min_len=2, max_len=80, errors=errors)
    phone = valid_phone(data.get("phone", user["phone"]), errors, required=False)
    raise_if_errors(errors)
    db = get_db()
    db.execute("UPDATE users SET name = ?, phone = ? WHERE id = ?", (name, phone, user["id"]))
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify({"user": public_user(row)})


@bp.post("/change-password")
@login_required
@rate_limit("change-password", 10, 600)
def change_password():
    data = json_body()
    errors: dict = {}
    user = current_user()
    if not verify_password(user["password_hash"], data.get("current_password") or ""):
        errors["current_password"] = "Current password is incorrect."
    new_password = valid_password(data.get("new_password"), errors, "new_password")
    if not errors and new_password == data.get("current_password"):
        errors["new_password"] = "Choose a password you haven't used here before."
    raise_if_errors(errors)
    get_db().execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), user["id"]))
    return jsonify({"ok": True})
