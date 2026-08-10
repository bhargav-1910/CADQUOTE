"""Optional malware scanning for uploaded files.

Disabled by default so nothing changes for existing deployments. Point
``CLAMAV_HOST``/``CLAMAV_PORT`` at a clamd instance to turn it on; the INSTREAM
protocol is a handful of bytes, so this talks to clamd directly rather than
adding a client dependency.

Scanning is called from `upload.py` — the single point every CAD file passes
through — so there is no path that stores an unscanned file.
"""
from __future__ import annotations

import asyncio
import logging
import socket
import struct

from app.core.config import settings

logger = logging.getLogger(__name__)

# clamd caps INSTREAM chunks; 64 KiB is comfortably under the default limit.
_CHUNK = 64 * 1024


class ScanError(RuntimeError):
    """The scanner could not be reached or returned an unusable answer."""


def _scan_sync(content: bytes) -> tuple[bool, str | None]:
    """Return ``(is_clean, signature)``. Raises ScanError if clamd is unusable."""
    try:
        with socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=settings.CLAMAV_TIMEOUT_SECONDS
        ) as sock:
            sock.sendall(b"zINSTREAM\x00")
            for offset in range(0, len(content), _CHUNK):
                chunk = content[offset:offset + _CHUNK]
                sock.sendall(struct.pack("!L", len(chunk)) + chunk)
            sock.sendall(struct.pack("!L", 0))  # zero-length chunk ends the stream

            response = b""
            while b"\x00" not in response:
                received = sock.recv(4096)
                if not received:
                    break
                response += received
    except OSError as exc:
        raise ScanError(f"clamd unreachable: {exc}") from exc

    answer = response.rstrip(b"\x00").decode("utf-8", "replace").strip()
    if answer.endswith("OK"):
        return True, None
    if answer.endswith("FOUND"):
        # "stream: Eicar-Test-Signature FOUND"
        signature = answer.split(":", 1)[-1].rsplit(" FOUND", 1)[0].strip()
        return False, signature or "unknown"
    raise ScanError(f"unexpected clamd response: {answer[:120]}")


async def scan_bytes(content: bytes) -> tuple[bool, str | None]:
    """Scan an in-memory upload off the event loop.

    Returns ``(is_clean, signature)``. When scanning is disabled the content is
    reported clean, which keeps the default deployment behaviour unchanged.
    """
    if not settings.CLAMAV_ENABLED:
        return True, None
    return await asyncio.to_thread(_scan_sync, content)


async def assert_clean(content: bytes, *, filename: str) -> None:
    """Raise HTTP 422 when the scanner rejects the upload.

    On scanner failure the behaviour is governed by ``CLAMAV_FAIL_CLOSED``:
    fail-closed refuses the upload (correct for untrusted intake), fail-open
    logs and accepts (avoids an outage when clamd restarts).
    """
    from fastapi import HTTPException

    try:
        is_clean, signature = await scan_bytes(content)
    except ScanError as exc:
        logger.error("Malware scan failed for %r: %s", filename, exc)
        if settings.CLAMAV_FAIL_CLOSED:
            raise HTTPException(
                status_code=503,
                detail="File scanning is temporarily unavailable. Please retry shortly.",
            ) from exc
        return

    if not is_clean:
        # The signature name goes to the log, never to the uploader.
        logger.warning("Malware detected in upload %r: %s", filename, signature)
        from app.core.security_log import log_security_event

        log_security_event(
            "upload.malware_blocked", outcome="denied", signature=signature,
        )
        raise HTTPException(
            status_code=422,
            detail="This file was rejected by our malware scanner.",
        )
