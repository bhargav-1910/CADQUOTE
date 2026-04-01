"""Email delivery service for quote communications."""
from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import Optional
from functools import partial

from app.core.config import settings
from app.models.models import Quote, User


def _ensure_smtp_configured() -> None:
    if not settings.SMTP_HOST:
        raise ValueError(
            "SMTP is not configured. Set SMTP_HOST (and credentials if required) in backend environment settings."
        )


def _resolve_from_email() -> str:
    configured = (settings.SMTP_FROM_EMAIL or "").strip()
    username = (settings.SMTP_USERNAME or "").strip()
    if configured:
        return configured
    if username:
        return username
    raise ValueError("SMTP sender email is not configured. Set SMTP_FROM_EMAIL or SMTP_USERNAME.")


def _build_default_subject(quote: Quote) -> str:
    return f"Quotation {quote.quote_number} from {settings.APP_NAME}"


def _build_default_body(quote: Quote, sender: User) -> str:
    recipient_name = quote.customer_name or "Customer"
    sender_phone = getattr(sender, "phone_number", None) or ""
    sender_company = sender.company_name or settings.APP_NAME
    return (
        f"Dear {recipient_name},\n\n"
        "Thank you for your enquiry. Please find attached our quotation for your CNC machining requirement.\n\n"
        f"Quotation Number: {quote.quote_number}\n"
        f"Quoted Amount: INR {float(quote.total_price):,.2f}\n"
        f"Estimated Lead Time: {quote.estimated_lead_time_days} business days\n"
        f"Valid Until: {quote.valid_until.strftime('%Y-%m-%d')}\n\n"
        "If you need any revisions in quantity, material, finish, or delivery timeline, please reply to this email and we will update the quote promptly.\n\n"
        "Best regards,\n"
        f"{sender.full_name}\n"
        f"{sender_company}\n"
        f"{sender_phone}"
    )


def _send_quote_email_sync(
    *,
    quote: Quote,
    sender: User,
    recipient_email: str,
    pdf_path: str,
    subject: Optional[str],
    message: Optional[str],
    use_logged_in_sender_identity: bool,
) -> None:
    _ensure_smtp_configured()

    attachment_path = Path(pdf_path)
    if not attachment_path.exists() or not attachment_path.is_file():
        raise ValueError("Quote PDF file is missing. Generate the PDF before sending email.")

    email = EmailMessage()
    smtp_identity_email = _resolve_from_email()
    user_email = (sender.email or "").strip()
    sender_email = user_email if (use_logged_in_sender_identity and user_email) else smtp_identity_email
    sender_name = (sender.full_name or "").strip() or settings.SMTP_FROM_NAME
    email["From"] = formataddr((sender_name, sender_email))
    email["To"] = recipient_email
    if use_logged_in_sender_identity and user_email:
        email["Reply-To"] = user_email
    if sender_email.lower() != smtp_identity_email.lower():
        # Keep authenticated SMTP identity explicit for providers that validate sender headers.
        email["Sender"] = formataddr((settings.SMTP_FROM_NAME, smtp_identity_email))
    email["Subject"] = subject or _build_default_subject(quote)
    email.set_content(message or _build_default_body(quote, sender))

    with open(attachment_path, "rb") as handle:
        email.add_attachment(
            handle.read(),
            maintype="application",
            subtype="pdf",
            filename=f"{quote.quote_number}.pdf",
        )

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()

            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")

            smtp.send_message(email, from_addr=smtp_identity_email)
    except smtplib.SMTPAuthenticationError as exc:
        raise ValueError(
            "SMTP authentication failed. If you are using Gmail, enable 2-Step Verification and use a 16-character App Password in SMTP_PASSWORD."
        ) from exc


def _send_plain_email_sync(*, recipient_email: str, subject: str, body: str, reply_to: Optional[str] = None) -> None:
    _ensure_smtp_configured()

    email = EmailMessage()
    from_email = _resolve_from_email()
    email["From"] = formataddr((settings.SMTP_FROM_NAME, from_email))
    email["To"] = recipient_email
    email["Subject"] = subject
    if reply_to:
        email["Reply-To"] = reply_to
    email.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()

            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")

            smtp.send_message(email)
    except smtplib.SMTPAuthenticationError as exc:
        raise ValueError(
            "SMTP authentication failed. If you are using Gmail, enable 2-Step Verification and use a 16-character App Password in SMTP_PASSWORD."
        ) from exc


async def send_quote_email(
    *,
    quote: Quote,
    sender: User,
    recipient_email: str,
    pdf_path: str,
    subject: Optional[str] = None,
    message: Optional[str] = None,
    use_logged_in_sender_identity: bool = True,
) -> None:
    """Send quote PDF via SMTP in a worker thread."""
    loop = asyncio.get_event_loop()
    send_task = partial(
        _send_quote_email_sync,
        quote=quote,
        sender=sender,
        recipient_email=recipient_email,
        pdf_path=pdf_path,
        subject=subject,
        message=message,
        use_logged_in_sender_identity=use_logged_in_sender_identity,
    )
    await loop.run_in_executor(
        None,
        send_task,
    )


async def send_plain_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
    reply_to: Optional[str] = None,
) -> None:
    """Send text email via configured SMTP provider."""
    loop = asyncio.get_event_loop()
    send_task = partial(
        _send_plain_email_sync,
        recipient_email=recipient_email,
        subject=subject,
        body=body,
        reply_to=reply_to,
    )
    await loop.run_in_executor(None, send_task)
