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
from collections import deque
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import Request

logger = logging.getLogger("security")

# Events waiting to be written to the security_events table. Callers are
# synchronous and hold no DB session, so persistence is batched by
# flush_security_events() (a lifespan task, and on demand by the admin API).
# ponytail: bounded in-process buffer; a crash loses at most the last few
# seconds of rows (stdout keeps them). Use a queue/outbox if that matters.
_pending: deque[tuple[datetime, dict[str, Any]]] = deque(maxlen=10_000)

# Columns of security_events; everything else in the payload goes to details.
_COLUMN_KEYS = {"ts", "event", "outcome", "user_id", "email", "ip", "path"}

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
    _pending.append((datetime.utcnow(), payload))


async def flush_security_events() -> int:
    """Write buffered events to the security_events table; returns rows written.

    A failed write drops the batch with a warning rather than retrying forever:
    the stdout log line already exists, so the audit table is a convenience
    copy, not the record of truth.
    """
    if not _pending:
        return 0
    # Imported here: models import this module indirectly at startup.
    import uuid

    from app.core.database import async_session_maker
    from app.models.models import SecurityEvent

    batch = [_pending.popleft() for _ in range(min(len(_pending), 500))]
    rows = []
    for created_at, payload in batch:
        user_id = payload.get("user_id")
        try:
            user_uuid = uuid.UUID(str(user_id)) if user_id else None
        except ValueError:
            user_uuid = None
        details = {k: v for k, v in payload.items() if k not in _COLUMN_KEYS}
        rows.append(SecurityEvent(
            created_at=created_at,
            event=str(payload.get("event"))[:80],
            outcome=str(payload.get("outcome"))[:16],
            user_id=user_uuid,
            email=payload.get("email"),
            ip=str(payload["ip"])[:64] if payload.get("ip") else None,
            path=str(payload["path"])[:300] if payload.get("path") else None,
            details=json.loads(json.dumps(details, default=str)) or None,
        ))
    try:
        async with async_session_maker() as session:
            session.add_all(rows)
            await session.commit()
    except Exception as exc:  # noqa: BLE001 - audit copy must never break requests
        logging.getLogger(__name__).warning("Dropped %d security events: %s", len(rows), exc)
        return 0
    return len(rows)


async def prune_security_events(retention_days: int) -> None:
    """Delete persisted events older than the retention window."""
    from sqlalchemy import delete

    from app.core.database import async_session_maker
    from app.models.models import SecurityEvent

    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    async with async_session_maker() as session:
        await session.execute(delete(SecurityEvent).where(SecurityEvent.created_at < cutoff))
        await session.commit()
