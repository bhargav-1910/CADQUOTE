"""Structured security event logging (OWASP A09).

Every authentication and privileged action lands here as one structured line
on the dedicated ``security`` logger, so it can be shipped to a SIEM without
untangling application chatter.

Secrets never enter this module: passwords, JWTs, refresh tokens and reset
tokens are not accepted as arguments and email addresses are masked.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import Request

logger = logging.getLogger("security")

# Field names that must never be written to a log line even if a caller
# passes them by mistake.
_FORBIDDEN_KEYS = {
    "password", "new_password", "current_password", "token", "access_token",
    "refresh_token", "reset_token", "secret", "authorization", "api_key",
    "otp", "hashed_password", "token_hash",
}


def mask_email(email: Optional[str]) -> Optional[str]:
    """Keep an email attributable in logs without storing it in the clear."""
    if not email:
        return None
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}"


def client_ip(request: Optional[Request]) -> Optional[str]:
    """Best-effort client address, honouring the reverse proxy header."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def log_security_event(
    event: str,
    *,
    request: Optional[Request] = None,
    user_id: Optional[Any] = None,
    email: Optional[str] = None,
    outcome: str = "success",
    **details: Any,
) -> None:
    """Emit one structured security event.

    ``outcome`` is "success", "failure" or "denied". Extra keyword details are
    included verbatim after secret-name filtering.
    """
    payload: dict[str, Any] = {
        "ts": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "event": event,
        "outcome": outcome,
    }
    if user_id is not None:
        payload["user_id"] = str(user_id)
    if email:
        payload["email"] = mask_email(email)
    ip = client_ip(request)
    if ip:
        payload["ip"] = ip
    if request is not None:
        payload["path"] = request.url.path
        agent = request.headers.get("user-agent")
        if agent:
            payload["user_agent"] = agent[:200]

    for key, value in details.items():
        if key.lower() in _FORBIDDEN_KEYS:
            continue
        payload[key] = value

    level = logging.WARNING if outcome in {"failure", "denied"} else logging.INFO
    logger.log(level, "security_event %s", json.dumps(payload, default=str))
