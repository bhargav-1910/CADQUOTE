"""Error handling that keeps internals off the wire.

Raw exception text routinely carries absolute paths, library versions, SQL
fragments and occasionally credentials. Handlers log the real exception with a
correlation id and return only that id to the caller.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


def new_error_id() -> str:
    return uuid.uuid4().hex[:12]


def internal_error(
    exc: BaseException,
    *,
    context: str,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    public_message: str = "Something went wrong while processing your request.",
) -> HTTPException:
    """Log ``exc`` and return a sanitized HTTPException to raise.

    In development the real message is appended so debugging stays practical;
    in production the caller only ever sees the correlation id.
    """
    error_id = new_error_id()
    logger.exception("%s failed [error_id=%s]: %s", context, error_id, exc)
    detail = f"{public_message} (ref: {error_id})"
    if not settings.is_production:
        detail = f"{detail} [{type(exc).__name__}: {exc}]"
    return HTTPException(status_code=status_code, detail=detail)


def register_exception_handlers(app: FastAPI) -> None:
    """Install global handlers so no route can leak a stack trace."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        headers = getattr(exc, "headers", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # Field-level messages are useful and safe; the raw input echoed by
        # pydantic's default body is not, so it is dropped.
        errors = [
            {
                "field": ".".join(str(part) for part in error.get("loc", []) if part != "body"),
                "message": error.get("msg", "Invalid value"),
            }
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        error_id = new_error_id()
        logger.exception(
            "Unhandled error [error_id=%s] on %s %s", error_id, request.method, request.url.path
        )
        content: dict[str, object] = {
            "detail": f"Internal server error (ref: {error_id})",
            "error_id": error_id,
        }
        if not settings.is_production:
            content["debug"] = f"{type(exc).__name__}: {exc}"
        return JSONResponse(status_code=500, content=content)
