"""Security middleware: response headers, HTTPS enforcement, body limits."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse, Response

from app.core.config import settings

# API responses are JSON and file downloads — never a document that should be
# allowed to load scripts, be framed, or submit forms.
_API_CSP = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
# Served images still need to render when opened directly.
_ASSET_CSP = (
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)

_PERMISSIONS_POLICY = (
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), "
    "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), "
    "magnetometer=(), microphone=(), midi=(), payment=(), usb=(), "
    "screen-wake-lock=(), xr-spatial-tracking=()"
)

# Swagger UI needs to load its own bundle; it is only reachable outside
# production, where the strict API policy would break it.
_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach the OWASP secure-header set to every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = _PERMISSIONS_POLICY
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        # Old header, still honoured by some proxies and legacy clients.
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"

        if not path.startswith(_DOC_PATHS):
            response.headers["Content-Security-Policy"] = (
                _ASSET_CSP if path.startswith("/uploads/") else _API_CSP
            )

        # Authenticated payloads must never sit in a shared cache.
        if path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"

        # HSTS is only meaningful (and only safe) over TLS.
        forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if forwarded_proto == "https" or settings.FORCE_HTTPS:
            response.headers["Strict-Transport-Security"] = (
                f"max-age={settings.HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload"
            )
        return response


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect plain HTTP to HTTPS when FORCE_HTTPS is enabled.

    Health checks are exempt so an internal load balancer probing over HTTP
    does not mark the service unhealthy.
    """

    _EXEMPT = ("/health", "/api/v1/health")

    async def dispatch(self, request: Request, call_next):
        if not settings.FORCE_HTTPS or request.url.path in self._EXEMPT:
            return await call_next(request)

        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto != "https":
            return RedirectResponse(str(request.url.replace(scheme="https")), status_code=308)
        return await call_next(request)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized requests up front (large-payload DoS).

    Only the declared Content-Length is checked here; the upload service
    enforces the real ceiling while reading, which also covers chunked bodies
    that arrive without a length.
    """

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large"},
                    )
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
        return await call_next(request)
