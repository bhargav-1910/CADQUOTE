"""Transactional email delivery.

Uses the standard library SMTP client — the only outbound mail this product
sends is password reset and security notices, which does not justify a
provider SDK. When SMTP_HOST is unset (local development) the message is
logged instead of sent so the flow stays testable without a mail server.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from app.core.config import settings

logger = logging.getLogger(__name__)

# Reset links must point at our own frontend; anything else would turn the
# email into an attacker-controlled redirect.
_RESET_PATH = "/reset-password"
_VERIFY_PATH = "/verify-email"


def _brand() -> str:
    return settings.LEGAL_COMPANY_NAME or settings.APP_NAME


def build_reset_url(token: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}{_RESET_PATH}?token={token}"


def build_verify_url(token: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}{_VERIFY_PATH}?token={token}"


def _shell(title: str, body_html: str) -> str:
    """Minimal, client-safe HTML shell. All interpolation is pre-escaped."""
    return f"""\
<!doctype html>
<html><body style="margin:0;background:#0f1115;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#0284c7">
            {escape(_brand())}
          </p>
          <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">{escape(title)}</h1>
          {body_html}
          <hr style="margin:28px 0 16px;border:none;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">
            Sent by {escape(_brand())}. Questions? Write to
            <a href="mailto:{escape(settings.LEGAL_CONTACT_EMAIL)}"
               style="color:#0284c7">{escape(settings.LEGAL_CONTACT_EMAIL)}</a>.<br>
            Report a security issue to
            <a href="mailto:{escape(settings.LEGAL_SECURITY_EMAIL)}"
               style="color:#0284c7">{escape(settings.LEGAL_SECURITY_EMAIL)}</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def render_password_reset_email(*, full_name: str, reset_url: str) -> tuple[str, str, str]:
    """Return (subject, text_body, html_body) for the reset email."""
    ttl = settings.PASSWORD_RESET_TOKEN_TTL_MINUTES
    subject = f"Reset your {_brand()} password"
    text = (
        f"Hi {full_name},\n\n"
        f"We received a request to reset your {_brand()} password.\n"
        f"Open this link to choose a new one:\n\n{reset_url}\n\n"
        f"The link expires in {ttl} minutes and can only be used once.\n"
        "If you did not request this, you can ignore this email — your password "
        "will not change.\n\n"
        f"— {_brand()}\n"
    )
    html = _shell(
        "Reset your password",
        f"""
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">
            Hi {escape(full_name)}, we received a request to reset your password.
          </p>
          <p style="margin:0 0 24px">
            <a href="{escape(reset_url)}"
               style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;
                      padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">
              Choose a new password
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#475569">
            This link expires in {ttl} minutes and works only once.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569">
            Didn't request this? Ignore this email — your password stays unchanged.
          </p>
        """,
    )
    return subject, text, html


def render_password_changed_email(*, full_name: str) -> tuple[str, str, str]:
    """Notify the account owner that credentials changed (takeover tripwire)."""
    subject = f"Your {_brand()} password was changed"
    text = (
        f"Hi {full_name},\n\n"
        f"Your {_brand()} password was just changed and all other sessions were "
        "signed out.\n\n"
        "If this wasn't you, contact us immediately at "
        f"{settings.LEGAL_SECURITY_EMAIL}.\n\n— {_brand()}\n"
    )
    html = _shell(
        "Your password was changed",
        f"""
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">
            Hi {escape(full_name)}, your password was just changed and every other
            active session was signed out.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569">
            If this wasn't you, contact
            <a href="mailto:{escape(settings.LEGAL_SECURITY_EMAIL)}"
               style="color:#0284c7">{escape(settings.LEGAL_SECURITY_EMAIL)}</a> immediately.
          </p>
        """,
    )
    return subject, text, html


def _send_sync(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    if not settings.SMTP_HOST:
        # Development fallback. The body is logged, never the token-bearing
        # URL in production, because production always has SMTP configured.
        logger.info("SMTP not configured; email not sent. Subject=%r To=%r", subject, to_email)
        logger.debug("Email body:\n%s", text_body)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)


async def send_email(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    """Send mail off the event loop. Never raises — delivery failure must not
    leak account existence or break the calling request."""
    try:
        await asyncio.to_thread(_send_sync, to_email, subject, text_body, html_body)
        return True
    except Exception as exc:  # noqa: BLE001 - delivery is best effort
        logger.error("Email delivery failed for subject=%r: %s", subject, exc)
        return False


def render_verify_email(*, full_name: str, verify_url: str) -> tuple[str, str, str]:
    """Confirm ownership of the address used at signup."""
    hours = settings.EMAIL_VERIFICATION_TTL_HOURS
    subject = f"Confirm your {_brand()} email address"
    text = (
        f"Hi {full_name},\n\n"
        f"Confirm this email address to finish setting up your {_brand()} account:\n\n"
        f"{verify_url}\n\n"
        f"The link expires in {hours} hours.\n"
        "If you did not create this account, you can ignore this email.\n\n"
        f"\u2014 {_brand()}\n"
    )
    html = _shell(
        "Confirm your email address",
        f"""
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">
            Hi {escape(full_name)}, confirm this address to finish setting up your account.
          </p>
          <p style="margin:0 0 24px">
            <a href="{escape(verify_url)}"
               style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;
                      padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">
              Confirm email address
            </a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569">
            This link expires in {hours} hours. Didn't create this account? Ignore this email.
          </p>
        """,
    )
    return subject, text, html


def render_totp_changed_email(*, full_name: str, enabled: bool) -> tuple[str, str, str]:
    """Two-factor changes are a takeover signal; always tell the owner."""
    state = "enabled" if enabled else "disabled"
    subject = f"Two-factor authentication {state} on your {_brand()} account"
    text = (
        f"Hi {full_name},\n\n"
        f"Two-factor authentication was just {state} on your {_brand()} account.\n\n"
        f"If this wasn't you, contact {settings.LEGAL_SECURITY_EMAIL} immediately "
        "and change your password.\n\n"
        f"\u2014 {_brand()}\n"
    )
    html = _shell(
        f"Two-factor authentication {state}",
        f"""
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">
            Hi {escape(full_name)}, two-factor authentication was just
            <strong>{escape(state)}</strong> on your account.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569">
            If this wasn't you, contact
            <a href="mailto:{escape(settings.LEGAL_SECURITY_EMAIL)}"
               style="color:#0284c7">{escape(settings.LEGAL_SECURITY_EMAIL)}</a>
            immediately and change your password.
          </p>
        """,
    )
    return subject, text, html
