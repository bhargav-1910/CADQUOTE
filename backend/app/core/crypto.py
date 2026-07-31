"""Application-layer encryption for sensitive database columns.

Disk encryption protects a stolen server; it does nothing against a leaked
backup, a compromised read replica, or an over-broad SELECT. Tax IDs and
customer contact details are encrypted here so the ciphertext is what lands in
every one of those places.

AES-256-GCM via the `cryptography` package, which is already a transitive
dependency through `python-jose[cryptography]`. Each value gets a fresh random
nonce, and GCM's tag makes tampering detectable rather than silent.

Key management
--------------
``FIELD_ENCRYPTION_KEY`` is a base64 32-byte key:

    python -c "import base64,os; print(base64.b64encode(os.urandom(32)).decode())"

Leave it unset and columns are stored as plaintext exactly as before — so this
is opt-in and existing databases keep working. Set it and new writes are
encrypted; reads transparently handle both, which lets a deployment migrate
without downtime.

ponytail: single active key. Add a key-id prefix and a second accepted key if
rotation without re-encrypting every row is ever needed.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

from sqlalchemy import String, TypeDecorator

from app.core.config import settings

logger = logging.getLogger(__name__)

# Marks ciphertext so a mixed-content column can be read during migration.
_PREFIX = "enc:v1:"


def _load_key() -> Optional[bytes]:
    raw = (settings.FIELD_ENCRYPTION_KEY or "").strip()
    if not raw:
        return None
    try:
        key = base64.b64decode(raw, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY must be base64-encoded. Generate one with: "
            'python -c "import base64,os; print(base64.b64encode(os.urandom(32)).decode())"'
        ) from exc
    if len(key) != 32:
        raise RuntimeError(
            f"FIELD_ENCRYPTION_KEY must decode to 32 bytes for AES-256, got {len(key)}"
        )
    return key


_KEY = _load_key()

if _KEY is not None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    _AESGCM = AESGCM(_KEY)
else:  # pragma: no cover - plaintext mode
    _AESGCM = None
    if settings.is_production:
        logger.warning(
            "FIELD_ENCRYPTION_KEY is not set; GSTIN and customer contact details "
            "are stored in plaintext."
        )


def encrypt_value(plaintext: str) -> str:
    """Encrypt to ``enc:v1:<base64(nonce || ciphertext || tag)>``."""
    if _AESGCM is None:
        return plaintext
    nonce = os.urandom(12)  # 96-bit nonce, the GCM standard
    ciphertext = _AESGCM.encrypt(nonce, plaintext.encode("utf-8"), None)
    return _PREFIX + base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_value(stored: str) -> str:
    """Decrypt a stored value, passing plaintext through untouched."""
    if not stored.startswith(_PREFIX):
        # Written before encryption was enabled. Returned as-is so enabling the
        # key does not break existing rows.
        return stored
    if _AESGCM is None:
        raise RuntimeError(
            "Encrypted value found but FIELD_ENCRYPTION_KEY is not set. "
            "Restore the key to read this data."
        )
    payload = base64.b64decode(stored[len(_PREFIX):])
    return _AESGCM.decrypt(payload[:12], payload[12:], None).decode("utf-8")


class EncryptedString(TypeDecorator):
    """A String column encrypted at rest, transparent to queries.

    Note the trade-off: an encrypted column cannot be matched with SQL
    equality or LIKE. Only fields that are read and displayed — never searched
    — use this type. Customer *name* and *company* stay plaintext precisely
    because the customer list searches them.
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int = 255, **kwargs):
        # Ciphertext is ~2x the plaintext plus overhead; widen so a value that
        # fit before still fits once encrypted.
        super().__init__(length=max(length * 3, 255), **kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_value(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return decrypt_value(value)
        except Exception:  # noqa: BLE001
            # A row that cannot be decrypted must not break the whole query;
            # surface it as missing and let the log carry the detail.
            logger.exception("Failed to decrypt a stored field")
            return None
