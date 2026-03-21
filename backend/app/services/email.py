"""Email delivery service for reports and notifications."""
import asyncio
import smtplib
from email.message import EmailMessage
from html import escape

from app.core.config import settings
from app.schemas.schemas import BulkReportEmailRequest


def _format_currency(value: float | str, currency: str) -> str:
    amount = float(value)
    return f"{currency} {amount:,.2f}"


def _build_bulk_report_html(payload: BulkReportEmailRequest) -> str:
    title = escape(payload.report_title or "Bulk Quote Report")
    intro = escape(payload.message or "")
    intro_html = f"<p style=\"margin:0 0 16px 0;\">{intro}</p>" if intro else ""

    rows = []
    for item in payload.items:
        rows.append(
            """
            <tr>
              <td style=\"padding:8px;border:1px solid #e5e7eb;\">{filename}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">{qty}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;\">{material}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;\">{finish}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;\">{inspection}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">{unit_price}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">{line_total}</td>
              <td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">{lead_time:.1f} days</td>
            </tr>
            """.format(
                filename=escape(item.filename),
                qty=item.quantity,
                material=escape(item.material_name),
                finish=escape(item.surface_finish_name),
                inspection=escape(item.inspection_level_name),
                unit_price=escape(_format_currency(item.unit_price, payload.currency)),
                line_total=escape(_format_currency(item.line_total, payload.currency)),
                lead_time=item.lead_time_days,
            )
        )

    return f"""
    <html>
      <body style=\"font-family:Arial,sans-serif;color:#111827;\">
        <h2 style=\"margin-bottom:8px;\">{title}</h2>
        <p style=\"margin:0 0 12px 0;\">Files: {payload.file_count}</p>
        <p style=\"margin:0 0 12px 0;\">Total Cost: <strong>{_format_currency(payload.total_cost, payload.currency)}</strong></p>
        <p style=\"margin:0 0 16px 0;\">Batch Lead Time: up to {payload.max_lead_time_days:.1f} days</p>
        {intro_html}

        <table style=\"border-collapse:collapse;width:100%;font-size:13px;\">
          <thead>
            <tr style=\"background:#f3f4f6;\">
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:left;\">File</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">Qty</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:left;\">Material</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:left;\">Finish</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:left;\">Inspection</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">Unit Price</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">Line Total</th>
              <th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;\">Lead Time</th>
            </tr>
          </thead>
          <tbody>
            {''.join(rows)}
          </tbody>
        </table>
      </body>
    </html>
    """


def _build_bulk_report_text(payload: BulkReportEmailRequest) -> str:
    lines = [
        payload.report_title or "Bulk Quote Report",
        "",
        f"Files: {payload.file_count}",
        f"Total Cost: {_format_currency(payload.total_cost, payload.currency)}",
        f"Batch Lead Time: up to {payload.max_lead_time_days:.1f} days",
    ]

    if payload.message:
        lines.extend(["", payload.message])

    lines.append("")
    lines.append("Per-file details:")

    for item in payload.items:
        lines.append(
            "- {name} | Qty {qty} | {material} | {finish} | {inspection} | Unit {unit} | Line {line} | {lead:.1f} days".format(
                name=item.filename,
                qty=item.quantity,
                material=item.material_name,
                finish=item.surface_finish_name,
                inspection=item.inspection_level_name,
                unit=_format_currency(item.unit_price, payload.currency),
                line=_format_currency(item.line_total, payload.currency),
                lead=item.lead_time_days,
            )
        )

    return "\n".join(lines)


def _send_email_sync(message: EmailMessage) -> None:
    if not settings.SMTP_HOST:
        raise ValueError("SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend environment.")

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()

        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

        server.send_message(message)


async def send_bulk_report_email(payload: BulkReportEmailRequest) -> None:
    """Send a bulk quote summary report via SMTP."""
    msg = EmailMessage()
    msg["Subject"] = payload.subject or f"Bulk Quote Report - {payload.file_count} Files"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = payload.recipient_email

    msg.set_content(_build_bulk_report_text(payload))
    msg.add_alternative(_build_bulk_report_html(payload), subtype="html")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email_sync, msg)
