"""Shared helpers: API errors, request parsing and input validation."""
import re
from typing import Any

from flask import request


class ApiError(Exception):
    """Raise anywhere in a route to return a clean JSON error response."""

    def __init__(self, message: str, status: int = 400, code: str = "bad_request",
                 fields: dict | None = None, details: Any = None):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code
        self.fields, self.details = fields or {}, details

    def to_dict(self) -> dict:
        body = {"code": self.code, "message": self.message}
        if self.fields:
            body["fields"] = self.fields
        if self.details is not None:
            body["details"] = self.details
        return {"error": body}


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object.", 400, "invalid_json")
    return data


# ---------------------------------------------------------------- validators
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^(?:\+91[\s-]?|0)?[6-9]\d{9}$")
PIN_RE = re.compile(r"^[1-9]\d{5}$")


def clean_str(value: Any, field: str, *, min_len: int = 1, max_len: int = 200,
              required: bool = True, errors: dict | None = None) -> str:
    """Trim and length-check a string; record the problem in `errors` if invalid."""
    errors = errors if errors is not None else {}
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            errors[field] = "This field is required."
        return ""
    if not isinstance(value, str):
        errors[field] = "Must be text."
        return ""
    value = re.sub(r"\s+", " ", value).strip() if max_len <= 200 else value.strip()
    if len(value) < min_len:
        errors[field] = f"Must be at least {min_len} characters."
    elif len(value) > max_len:
        errors[field] = f"Must be {max_len} characters or fewer."
    return value


def valid_email(value: Any, errors: dict, field: str = "email") -> str:
    value = clean_str(value, field, max_len=254, errors=errors).lower()
    if value and not EMAIL_RE.match(value):
        errors[field] = "Enter a valid email address."
    return value


def valid_password(value: Any, errors: dict, field: str = "password") -> str:
    if not isinstance(value, str) or not value:
        errors[field] = "Password is required."
        return ""
    if len(value) < 8:
        errors[field] = "Use at least 8 characters."
    elif len(value) > 128:
        errors[field] = "Use 128 characters or fewer."
    elif not (re.search(r"[A-Za-z]", value) and re.search(r"\d", value)):
        errors[field] = "Include at least one letter and one number."
    return value


def valid_phone(value: Any, errors: dict, field: str = "phone", required: bool = True) -> str:
    value = clean_str(value, field, max_len=20, required=required, errors=errors)
    if value:
        if not PHONE_RE.match(value.replace(" ", "")):
            errors[field] = "Enter a valid 10-digit mobile number."
        else:
            value = value.replace(" ", "").replace("-", "")[-10:]
    return value


def to_int(value: Any, field: str, *, minimum: int | None = None, maximum: int | None = None,
           errors: dict | None = None, default: int | None = None) -> int | None:
    errors = errors if errors is not None else {}
    if value is None or value == "":
        if default is not None:
            return default
        errors[field] = "This field is required."
        return None
    if isinstance(value, bool):
        errors[field] = "Must be a whole number."
        return None
    try:
        number = int(value)
        if isinstance(value, float) and value != number:
            raise ValueError
    except (TypeError, ValueError):
        errors[field] = "Must be a whole number."
        return None
    if minimum is not None and number < minimum:
        errors[field] = f"Must be at least {minimum}."
    if maximum is not None and number > maximum:
        errors[field] = f"Must be at most {maximum}."
    return number


def raise_if_errors(errors: dict, message: str = "Please fix the highlighted fields.") -> None:
    if errors:
        raise ApiError(message, 422, "validation_error", fields=errors)


def like_escape(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def iso(ts: str | None) -> str | None:
    """SQLite stores UTC as 'YYYY-MM-DD HH:MM:SS'; send ISO-8601 so browsers parse it as UTC."""
    return ts.replace(" ", "T") + "Z" if ts else ts
