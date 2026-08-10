"""Sliding-window rate limiting, shared across workers when Redis is up.

The reverse proxy already caps requests per IP; this is the second layer that
survives a proxy misconfiguration and can key on things nginx cannot see
(email address, user id).

Counters live in Redis so every worker and replica draws on one allowance —
with process-local buckets, N workers silently multiply every limit by N. If
Redis is unavailable the in-process window takes over, which is weaker but
still bounds a single worker rather than failing open entirely.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Optional

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.security_log import client_ip, log_security_event

logger = logging.getLogger(__name__)

_buckets: dict[str, Deque[float]] = defaultdict(deque)
_lock = threading.Lock()
# Drop idle buckets once the map grows past this, so a flood of unique keys
# cannot pin memory (an attacker rotating IPs is the realistic case).
_MAX_TRACKED_KEYS = 50_000


def _prune(window: Deque[float], cutoff: float) -> None:
    while window and window[0] < cutoff:
        window.popleft()


async def hit_shared(key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Record one event against ``key`` in Redis, shared across workers.

    Falls back to the process-local window when Redis is unreachable, so a
    cache outage degrades the limiter instead of disabling it.
    """
    if not settings.RATE_LIMIT_ENABLED:
        return True, 0

    from app.core.cache import cache

    redis = getattr(cache, "_redis", None)
    if redis is None:
        return hit(key, limit=limit, window_seconds=window_seconds)

    redis_key = f"ratelimit:{key}"
    try:
        # INCR then EXPIRE on first hit: a fixed window, which is cheaper than
        # a sorted-set sliding window and adequate for abuse control.
        pipe = redis.pipeline()
        pipe.incr(redis_key)
        pipe.ttl(redis_key)
        count, ttl = await pipe.execute()

        if ttl is None or ttl < 0:
            await redis.expire(redis_key, window_seconds)
            ttl = window_seconds

        if int(count) > limit:
            return False, max(1, int(ttl) + 1)
        return True, 0
    except Exception as exc:  # noqa: BLE001 - never let the limiter break a request
        logger.warning("Redis rate limiter unavailable, using local window: %s", exc)
        return hit(key, limit=limit, window_seconds=window_seconds)


def hit(key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Record one event against ``key`` in this process.

    Returns ``(allowed, retry_after_seconds)``.
    """
    if not settings.RATE_LIMIT_ENABLED:
        return True, 0

    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        if len(_buckets) > _MAX_TRACKED_KEYS:
            for stale_key in [k for k, v in _buckets.items() if not v or v[-1] < cutoff]:
                del _buckets[stale_key]

        window = _buckets[key]
        _prune(window, cutoff)
        if len(window) >= limit:
            retry_after = max(1, int(window[0] + window_seconds - now) + 1)
            return False, retry_after
        window.append(now)
        return True, 0


def peek(key: str, *, window_seconds: int) -> int:
    """Current count for ``key`` without recording a new event."""
    now = time.monotonic()
    with _lock:
        window = _buckets.get(key)
        if not window:
            return 0
        _prune(window, now - window_seconds)
        return len(window)


def reset(key: str) -> None:
    """Clear a process-local bucket."""
    with _lock:
        _buckets.pop(key, None)


async def reset_shared(key: str) -> None:
    """Clear a bucket in both Redis and this process, e.g. after a good login."""
    reset(key)
    from app.core.cache import cache

    redis = getattr(cache, "_redis", None)
    if redis is None:
        return
    try:
        await redis.delete(f"ratelimit:{key}")
    except Exception:  # noqa: BLE001 - a stale counter must not break login
        pass


def build_key(scope: str, request: Optional[Request], identifier: Optional[str] = None) -> str:
    """Bucket key: scope + client address + optional account identifier."""
    parts = [scope, client_ip(request) or "unknown"]
    if identifier:
        parts.append(identifier.strip().lower())
    return "|".join(parts)


async def enforce(
    request: Optional[Request],
    scope: str,
    *,
    limit: int,
    window_seconds: int,
    identifier: Optional[str] = None,
    event: Optional[str] = None,
) -> None:
    """Raise 429 when ``scope`` is over budget for this client.

    Keyed on the client IP plus an optional identifier (email, user id) so a
    single account cannot be attacked from a rotating IP pool and one IP
    cannot spray many accounts.
    """
    key = build_key(scope, request, identifier)

    allowed, retry_after = await hit_shared(key, limit=limit, window_seconds=window_seconds)
    if allowed:
        return

    log_security_event(
        event or "rate_limit_exceeded",
        request=request,
        outcome="denied",
        scope=scope,
        limit=limit,
        window_seconds=window_seconds,
    )
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests. Please try again later.",
        headers={"Retry-After": str(retry_after)},
    )
