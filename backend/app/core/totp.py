"""TOTP second factor (RFC 6238) and single-use recovery codes.

Implemented against the stdlib: TOTP is HMAC-SHA1 over a time counter plus
dynamic truncation, which is short enough that a dependency would cost more
than it saves. Compatible with Google Authenticator, Authy, 1Password and any
other RFC 6238 client.

Verification accepts one step either side of now, absorbing normal clock drift
without meaningfully widening the window.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

# 30-second steps and 6 digits are the interoperable defaults every
# authenticator app assumes.
STEP_SECONDS = 30
DIGITS = 6
# ±1 step of tolerance for clock skew between server and phone.
DRIFT_STEPS = 1

BACKUP_CODE_COUNT = 10
_BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0/I/1 ambiguity


def generate_secret() -> str:
    """A fresh base32 secret (160 bits, the RFC 4226 recommendation)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _code_for_step(secret: str, step: int) -> str:
    # Restore the base32 padding the secret is stored without.
    padded = secret.upper() + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    # Dynamic truncation (RFC 4226 §5.4).
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(code % (10 ** DIGITS)).zfill(DIGITS)


def current_step(at: float | None = None) -> int:
    return int((at if at is not None else time.time()) // STEP_SECONDS)


def generate_code(secret: str, at: float | None = None) -> str:
    """The code an authenticator app shows right now (used by tests)."""
    return _code_for_step(secret, current_step(at))


def verify_code(
    secret: str,
    code: str,
    *,
    last_used_step: int | None = None,
    at: float | None = None,
) -> tuple[bool, int | None]:
    """Check a submitted code.

    Returns ``(is_valid, step_used)``. ``last_used_step`` blocks replay: a code
    is valid for 30 seconds, which is ample time to reuse an intercepted one,
    so each step may only be spent once.
    """
    cleaned = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(cleaned) != DIGITS:
        return False, None

    now_step = current_step(at)
    for offset in range(-DRIFT_STEPS, DRIFT_STEPS + 1):
        step = now_step + offset
        if last_used_step is not None and step <= last_used_step:
            continue  # already spent
        # compare_digest keeps the check constant-time.
        if hmac.compare_digest(_code_for_step(secret, step), cleaned):
            return True, step
    return False, None


def provisioning_uri(secret: str, *, account: str, issuer: str) -> str:
    """otpauth:// URI for the QR code an authenticator app scans."""
    label = quote(f"{issuer}:{account}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret}"
        f"&issuer={quote(issuer, safe='')}&algorithm=SHA1"
        f"&digits={DIGITS}&period={STEP_SECONDS}"
    )


def generate_backup_codes(count: int = BACKUP_CODE_COUNT) -> tuple[list[str], list[str]]:
    """Return ``(display_codes, stored_hashes)``.

    The plain codes are shown once at enrolment and never again; only their
    hashes are persisted, so a database read cannot bypass the second factor.
    """
    codes = []
    for _ in range(count):
        raw = "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes, [hash_backup_code(code) for code in codes]


def hash_backup_code(code: str) -> str:
    normalized = code.replace("-", "").replace(" ", "").upper()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def consume_backup_code(code: str, stored_hashes: list[str] | None) -> list[str] | None:
    """Spend a recovery code, returning the remaining hashes.

    ``None`` means the code did not match. Codes are single use, so the match
    is removed from the stored list.
    """
    if not stored_hashes:
        return None
    candidate = hash_backup_code(code)
    for index, stored in enumerate(stored_hashes):
        if hmac.compare_digest(stored, candidate):
            return stored_hashes[:index] + stored_hashes[index + 1:]
    return None
