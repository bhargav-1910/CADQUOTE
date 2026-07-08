"""PDF quotation document generation service."""
import os
import uuid
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Optional
import asyncio

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Quote, GeometryAnalysis, User
from app.services.storage import storage
from app.services.dfm import DFMAnalysis, analyze_dfm_from_geometry, summarize_dfm
from app.core.config import settings

# Template directory
TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

# Check if WeasyPrint is available
WEASYPRINT_AVAILABLE = False
try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except (ImportError, OSError):
    # WeasyPrint not available (missing system dependencies on Windows)
    pass


_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digits_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def _three_digits_words(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_two_digits_words(rest))
    return " ".join(parts)


def inr_in_words(amount: float) -> str:
    """Amount in words using the Indian numbering system (crore/lakh)."""
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))

    if rupees == 0:
        words = "Zero"
    else:
        crore, rem = divmod(rupees, 10_000_000)
        lakh, rem = divmod(rem, 100_000)
        thousand, hundreds = divmod(rem, 1_000)
        parts = []
        if crore:
            parts.append(f"{_two_digits_words(crore) if crore < 100 else _three_digits_words(crore)} Crore")
        if lakh:
            parts.append(f"{_two_digits_words(lakh)} Lakh")
        if thousand:
            parts.append(f"{_two_digits_words(thousand)} Thousand")
        if hundreds:
            parts.append(_three_digits_words(hundreds))
        words = " ".join(parts)

    result = f"Rupees {words}"
    if paise:
        result += f" and {_two_digits_words(paise)} Paise"
    return result + " Only"


class PDFGenerator:
    """Generate PDF quotation documents."""
    
    def __init__(self):
        self._jinja_env = None
        self._weasyprint = None
    
    def _get_jinja_env(self) -> Environment:
        """Get Jinja2 environment with template directory."""
        if self._jinja_env is None:
            TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
            self._jinja_env = Environment(
                loader=FileSystemLoader(str(TEMPLATE_DIR)),
                autoescape=True,
            )
        return self._jinja_env
    
    def _get_weasyprint(self):
        """Lazy load WeasyPrint."""
        if not WEASYPRINT_AVAILABLE:
            return None
        if self._weasyprint is None:
            from weasyprint import HTML, CSS
            self._weasyprint = {"HTML": HTML, "CSS": CSS}
        return self._weasyprint
    
    async def generate_quote_pdf(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        dfm_analysis: Optional[DFMAnalysis] = None,
        issuer_profile: Optional[dict] = None,
    ) -> str:
        """
        Generate PDF quotation document.
        
        Returns path to generated PDF.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._generate_pdf_sync,
            quote,
            geometry,
            dfm_analysis,
            issuer_profile,
        )
    
    def _generate_pdf_sync(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        dfm_analysis: Optional[DFMAnalysis] = None,
        issuer_profile: Optional[dict] = None,
    ) -> str:
        """Synchronous PDF generation."""
        # Output path
        output_dir = Path(settings.UPLOAD_DIR) / "quotes"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        filename = f"{quote.quote_number}.pdf"
        output_path = output_dir / filename
        
        # Try WeasyPrint first, fall back to reportlab on any error
        if WEASYPRINT_AVAILABLE:
            try:
                html_content = self._render_quote_html(quote, geometry, dfm_analysis, issuer_profile)
                wp = self._get_weasyprint()
                html = wp["HTML"](string=html_content)
                html.write_pdf(str(output_path))
            except Exception:
                # Fall back to reportlab on WeasyPrint error
                self._generate_pdf_reportlab(quote, geometry, str(output_path), dfm_analysis, issuer_profile)
        else:
            # Use reportlab fallback
            self._generate_pdf_reportlab(quote, geometry, str(output_path), dfm_analysis, issuer_profile)
        
        return str(output_path)
    
    def _generate_pdf_reportlab(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        output_path: str,
        dfm_analysis: Optional[DFMAnalysis] = None,
        issuer_profile: Optional[dict] = None,
    ) -> None:
        """Generate PDF using reportlab (fallback for Windows)."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.colors import black, HexColor
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        styles = getSampleStyleSheet()
        base_style = ParagraphStyle(
            "Base",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
        )
        bold_style = ParagraphStyle(
            "Bold",
            parent=base_style,
            fontName="Helvetica-Bold",
        )

        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=10 * mm,
            rightMargin=10 * mm,
            topMargin=10 * mm,
            bottomMargin=10 * mm,
        )

        content = []
        total_width = 190 * mm
        light_gray = HexColor("#f1f5f9")
        slate_ink = HexColor("#0f172a")
        slate_muted = HexColor("#334155")
        accent_blue = HexColor("#1d4ed8")
        line_color = HexColor("#475569")

        company_name = (issuer_profile or {}).get("company_name") or "CNC Quote Platform"
        company_address = (issuer_profile or {}).get("company_address") or "123 Manufacturing Way, Industrial City"
        company_phone = (issuer_profile or {}).get("company_phone") or "N/A"
        company_email = (issuer_profile or {}).get("company_email") or "quotes@cncplatform.com"
        company_logo_abs_path = (issuer_profile or {}).get("company_logo_abs_path")

        cleaned_notes = self._strip_combined_notes(quote.notes)
        subject = cleaned_notes.splitlines()[0].strip() if cleaned_notes else "Quote for CNC machining"

        logo_item = None
        if company_logo_abs_path and Path(company_logo_abs_path).exists():
            try:
                logo_item = Image(company_logo_abs_path, width=28 * mm, height=28 * mm)
                logo_item.hAlign = "LEFT"
            except Exception:
                logo_item = None

        header_text_stack = [
            Paragraph(f"<font color='{slate_ink}' size='15'><b>{company_name}</b></font>", base_style),
            Paragraph(f"<font color='{accent_blue}' size='9'><b>Precision Manufacturing Quotation</b></font>", base_style),
            Paragraph(f"<font color='{slate_muted}'>{company_address.replace(chr(10), '<br/>')}</font>", base_style),
            Paragraph(f"<font color='{slate_muted}'>Contact: {company_phone}</font>", base_style),
            Paragraph(f"<font color='{slate_muted}'>Email: {company_email}</font>", base_style),
        ]

        if logo_item is not None:
            left_header = Table(
                [[logo_item, header_text_stack]],
                colWidths=[33 * mm, 72 * mm],
            )
            left_header.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
        else:
            left_header = header_text_stack

        meta_rows = [
            [Paragraph("<b>Quotation No.</b>", base_style), Paragraph(f"<b>{quote.quote_number}</b>", base_style)],
            [Paragraph("<b>Date</b>", base_style), Paragraph(f"<b>{quote.created_at.strftime('%d-%m-%Y')}</b>", base_style)],
            [Paragraph("<b>Terms of Payment</b>", base_style), Paragraph(f"<b>{escape(quote.payment_terms or 'Not specified')}</b>", base_style)],
            [Paragraph("<b>Client ID</b>", base_style), Paragraph(f"<b>{str(quote.id).split('-')[0].upper()}</b>", base_style)],
        ]
        right_meta = Table([[Paragraph("<b>QUOTATION</b>", ParagraphStyle("MetaTitle", parent=base_style, alignment=1, fontSize=11, textColor=slate_ink))], [Table(meta_rows, colWidths=[30 * mm, 55 * mm])]], colWidths=[85 * mm])
        right_meta.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("BACKGROUND", (0, 0), (0, 0), light_gray),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))

        header = Table([[left_header, right_meta]], colWidths=[105 * mm, 85 * mm])
        header.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        content.append(header)

        to_lines = [quote.customer_name or "Valued Customer", quote.customer_company or "", quote.customer_email or ""]
        to_block = "<br/>".join([line for line in to_lines if line])
        recipient = Table(
            [[Paragraph("<b>To:</b><br/>" + to_block + f"<br/><br/><b>Subject:- {subject}</b>", base_style)]],
            colWidths=[total_width],
        )
        recipient.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        content.append(recipient)

        combined_items = self._parse_combined_items(quote.notes)
        if combined_items:
            line_rows = []
            for idx, item in enumerate(combined_items, start=1):
                qty = max(int(item["quantity"]), 1)
                line_total = float(item["line_total"])
                line_rows.append([
                    str(idx),
                    Paragraph(f"<b>{escape(item['file_name'])}</b><br/><font size='7.5' color='#64748b'>CNC machined part - combined quote line</font>", base_style),
                    escape(quote.hsn_code or "-"),
                    f"{qty:,} pcs",
                    f"{(line_total / qty):,.2f}",
                    f"{line_total:,.2f}",
                ])
        else:
            line_rows = [[
                "1",
                Paragraph(
                    f"<b>{escape(quote.cad_file.original_filename)}</b><br/><font size='7.5' color='#64748b'>"
                    f"Material: {escape(quote.material.name)} | Finish: {escape(quote.surface_finish.name)} | Inspection: {escape(quote.inspection_level.name)}"
                    f"</font>",
                    base_style,
                ),
                escape(quote.hsn_code or "-"),
                f"{max(int(quote.quantity), 1):,} pcs",
                f"{float(quote.unit_price):,.2f}",
                f"{float(quote.total_price):,.2f}",
            ]]

        items = Table(
            [["#", "Part & Specification", "HSN", "Qty", "Unit Price (Rs.)", "Amount (Rs.)"]] + line_rows,
            colWidths=[9 * mm, 89 * mm, 18 * mm, 22 * mm, 26 * mm, 26 * mm],
        )
        items.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.6, HexColor("#e2e8f0")),
            ("BACKGROUND", (0, 0), (-1, 0), slate_ink),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 7.5),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
            ("ALIGN", (3, 0), (5, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#ffffff"), HexColor("#f8fafc")]),
        ]))
        content.append(items)

        subtotal = float(quote.total_price)
        gst_display = quote.gst or "As applicable"
        grand_total = subtotal

        lower_left = Paragraph(
            f"<b>Amount in Words</b><br/><i>{escape(inr_in_words(grand_total))}</i>",
            base_style,
        )
        totals_rows = [
            ["Sub Total", ":", f"{subtotal:,.2f}"],
            [f"GST ({gst_display})", ":", "Included/As applicable"],
            ["Total Amount", ":", f"{grand_total:,.2f}"],
        ]
        totals_table = Table(totals_rows, colWidths=[42 * mm, 5 * mm, 28 * mm])
        totals_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))

        summary = Table([[lower_left, totals_table]], colWidths=[115 * mm, 75 * mm])
        summary.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        content.append(summary)

        terms_and_sign = Table(
            [[
                Paragraph(
                    "<b>Terms and Conditions:</b><br/>"
                    f"1. Payment Terms: {escape(quote.payment_terms or 'Not specified')}<br/>"
                    f"2. Delivery: {escape(quote.delivery or 'Not specified')}<br/>"
                    f"3. GST: {escape(quote.gst or 'As applicable')}<br/>"
                    f"4. Price Validity: {escape(quote.price_validity or 'Not specified')}",
                    base_style,
                ),
                Paragraph(
                    f"For <b>{company_name}</b><br/><br/>"
                    f"<font color='{slate_muted}'>Prepared on {datetime.utcnow().strftime('%d-%m-%Y')}</font><br/><br/>"
                    "<b>Authorized Signatory</b>",
                    ParagraphStyle("RightSign", parent=base_style, alignment=1),
                ),
            ]],
            colWidths=[120 * mm, 70 * mm],
        )
        terms_and_sign.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        content.append(terms_and_sign)

        if dfm_analysis:
            dfm_summary = summarize_dfm(dfm_analysis)
            issues = dfm_summary["top_issues"]
            issue_lines = "<br/>".join(
                f"- {item['severity'].upper()}: {item['title']}" for item in issues
            ) or "No critical DFM findings"
            dfm_block = Table(
                [[
                    Paragraph(
                        (
                            f"<b>DFM Summary</b><br/>"
                            f"Score: {dfm_summary['score']}/100 ({dfm_summary['label']})<br/>"
                            f"Issue Count: {dfm_summary['issue_count']}<br/>"
                            f"{issue_lines}"
                        ),
                        base_style,
                    )
                ]],
                colWidths=[total_width],
            )
            dfm_block.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.8, line_color),
                ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f8fbff")),
            ]))
            content.append(dfm_block)

        footer_text = (
            f"This is a software generated quotation from {company_name}. "
            f"For clarifications, contact {company_email}."
        )
        footer = Table(
            [[
                Paragraph(
                    footer_text,
                    ParagraphStyle("Footer", parent=base_style, alignment=1, textColor=slate_muted, fontSize=8),
                )
            ]],
            colWidths=[total_width],
        )
        footer.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        content.append(footer)
        content.append(Spacer(1, 2))

        doc.build(content)
    
    def _render_quote_html(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        dfm_analysis: Optional[DFMAnalysis] = None,
        issuer_profile: Optional[dict] = None,
    ) -> str:
        """Render quote HTML template."""
        weight_kg = (geometry.volume * quote.material.density) / 1000
        combined_items = self._parse_combined_items(quote.notes)
        cleaned_notes = self._strip_combined_notes(quote.notes)

        if combined_items:
            line_items = []
            for item in combined_items:
                qty = max(int(item["quantity"]), 1)
                line_total = float(item["line_total"])
                line_items.append({
                    "description": (
                        f"<span class=\"part-name\">{escape(item['file_name'])}</span>"
                        f"<span class=\"desc-meta\">CNC machined part · combined quote line</span>"
                    ),
                    "hsn_code": escape(quote.hsn_code or "—"),
                    "qty": qty,
                    "unit_price": line_total / qty,
                    "line_total": line_total,
                })
        else:
            spec_bits = [
                f"Material: {escape(quote.material.name)}",
                f"Finish: {escape(quote.surface_finish.name)}",
                f"Inspection: {escape(quote.inspection_level.name)}",
            ]
            if quote.tolerance_notes:
                spec_bits.append(f"Tolerance: {escape(quote.tolerance_notes)}")
            line_items = [{
                "description": (
                    f"<span class=\"part-name\">{escape(quote.cad_file.original_filename)}</span>"
                    f"<span class=\"desc-meta\">{' &nbsp;·&nbsp; '.join(spec_bits)}</span>"
                    f"<span class=\"desc-meta\">Volume: {geometry.volume:.2f} cm³ &nbsp;·&nbsp; "
                    f"Est. weight: {weight_kg:.3f} kg</span>"
                ),
                "hsn_code": escape(quote.hsn_code or "—"),
                "qty": max(int(quote.quantity), 1),
                "unit_price": float(quote.unit_price),
                "line_total": float(quote.total_price),
            }]

        line_items_html = ""
        for idx, item in enumerate(line_items, start=1):
            line_items_html += (
                "<tr>"
                f"<td class=\"center muted\">{idx}</td>"
                f"<td>{item['description']}</td>"
                f"<td class=\"center\">{item['hsn_code']}</td>"
                f"<td class=\"right num\">{item['qty']:,} pcs</td>"
                f"<td class=\"right num\">{item['unit_price']:,.2f}</td>"
                f"<td class=\"right num strong\">{item['line_total']:,.2f}</td>"
                "</tr>"
            )

        subtotal = float(quote.total_price)
        gst_display = quote.gst or "As applicable"
        grand_total = subtotal

        subject_line = cleaned_notes.splitlines()[0].strip() if cleaned_notes else "Quotation for CNC machined components"
        client_lines = [
            quote.customer_name or "Valued Customer",
            quote.customer_company or "",
            quote.customer_email or "",
        ]
        client_block = "<br>".join(escape(line) for line in client_lines if line)

        logo_html = ""
        logo_abs_path = (issuer_profile or {}).get("company_logo_abs_path")
        if logo_abs_path and Path(logo_abs_path).exists():
            # UPLOAD_DIR may be relative; as_uri() requires an absolute path.
            logo_uri = Path(logo_abs_path).resolve().as_uri()
            logo_html = f'<img src="{escape(logo_uri)}" alt="Company logo" class="logo-img">'

        lead_time_days = float(quote.estimated_lead_time_days or 0)
        lead_time_display = (
            f"{lead_time_days:g} working day{'s' if lead_time_days != 1 else ''}"
            if lead_time_days > 0
            else "To be confirmed"
        )

        brand_accent = (issuer_profile or {}).get("brand_color") or "{accent}"

        context = {
            "accent": brand_accent,
            "company_name": escape((issuer_profile or {}).get("company_name") or "CNC Quote Platform"),
            "company_address": escape((issuer_profile or {}).get("company_address") or "123 Manufacturing Way\nIndustrial City, IC 12345").replace("\n", "<br>"),
            "company_phone": escape((issuer_profile or {}).get("company_phone") or "N/A"),
            "company_email": escape((issuer_profile or {}).get("company_email") or "quotes@cncplatform.com"),
            "company_logo_html": logo_html,
            "quote_number": quote.quote_number,
            "quote_date": quote.created_at.strftime("%d %b %Y"),
            "valid_until": quote.valid_until.strftime("%d %b %Y") if quote.valid_until else "—",
            "lead_time": escape(lead_time_display),
            "terms_of_payment": escape(quote.payment_terms or "Not specified"),
            "client_id": str(quote.id).split("-")[0].upper(),
            "client_block": client_block,
            "subject": escape(subject_line),
            "item_count": len(line_items),
            "line_items_html": line_items_html,
            "subtotal": subtotal,
            "gst_display": escape(gst_display),
            "grand_total": grand_total,
            "amount_in_words": escape(inr_in_words(grand_total)),
            "delivery": escape(quote.delivery or "Not specified"),
            "price_validity": escape(quote.price_validity or "Not specified"),
            "signature_name": escape((issuer_profile or {}).get("company_name") or "Authorized Signatory"),
            "dfm_summary_html": self._build_dfm_summary_html(dfm_analysis),
            "prepared_date": datetime.utcnow().strftime("%d %b %Y"),
        }

        return self._get_inline_template().format(**context)

    def _build_dfm_summary_html(self, dfm_analysis: Optional[DFMAnalysis]) -> str:
        if not dfm_analysis:
            return ""

        summary = summarize_dfm(dfm_analysis)
        top_issues = summary["top_issues"]
        issue_html = "".join(
            (
                f"<li><strong>{escape(item['severity'].upper())}</strong> - "
                f"{escape(item['title'])}: {escape(item['recommendation'])}</li>"
            )
            for item in top_issues
        )
        if not issue_html:
            issue_html = "<li>No notable DFM issues.</li>"

        return (
            "<div class=\"dfm-callout\">"
            "<div class=\"dfm-title\">Manufacturability (DFM) Summary</div>"
            f"<div class=\"dfm-score\">Score: <strong>{summary['score']}/100 — {escape(summary['label'])}</strong>"
            f" &nbsp;·&nbsp; {summary['issue_count']} finding{'s' if summary['issue_count'] != 1 else ''}</div>"
            "<ul class=\"dfm-list\">"
            f"{issue_html}"
            "</ul>"
            "</div>"
        )

    def _parse_combined_items(self, notes: Optional[str]) -> list[dict]:
        """Parse embedded combined quote metadata from notes."""
        if not notes:
            return []

        start_tag = "[COMBINED_FILES]"
        end_tag = "[/COMBINED_FILES]"
        start_idx = notes.find(start_tag)
        end_idx = notes.find(end_tag)

        if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
            return []

        block = notes[start_idx + len(start_tag):end_idx].strip()
        if not block:
            return []

        items: list[dict] = []
        for line in block.splitlines():
            parts = line.strip().split("|")
            if len(parts) < 3:
                continue

            # v2 format: cad_file_id|filename|qty|line_total|material_id|surface_finish_id|inspection_level_id
            # v1 format: filename|qty|line_total
            if len(parts) >= 4:
                file_name = parts[1].strip()
                qty_raw = parts[2].strip()
                total_raw = parts[3].strip()
            else:
                file_name = parts[0].strip()
                qty_raw = parts[1].strip()
                total_raw = parts[2].strip()

            try:
                quantity = int(qty_raw)
                line_total = float(total_raw)
            except ValueError:
                continue

            items.append({
                "file_name": file_name,
                "quantity": quantity,
                "line_total": line_total,
            })

        return items

    def _strip_combined_notes(self, notes: Optional[str]) -> str:
        """Strip combined file metadata block and return user notes."""
        if not notes:
            return ""

        start_tag = "[COMBINED_FILES]"
        end_tag = "[/COMBINED_FILES]"
        start_idx = notes.find(start_tag)
        end_idx = notes.find(end_tag)

        if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
            return notes.strip()

        prefix = notes[:start_idx].strip()
        suffix = notes[end_idx + len(end_tag):].strip()
        combined = "\n".join([part for part in [prefix, suffix] if part])
        return combined.strip()
    
    def _get_inline_template(self) -> str:
        """Get inline HTML template for PDF generation."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Quotation {quote_number}</title>
    <style>
        @page {{
            size: A4;
            margin: 12mm 12mm 20mm 12mm;
            @bottom-left {{
                content: "{quote_number} · Computer-generated quotation";
                font-size: 7.5px;
                color: #94a3b8;
                font-family: Helvetica, Arial, sans-serif;
            }}
            @bottom-right {{
                content: "Page " counter(page) " of " counter(pages);
                font-size: 7.5px;
                color: #94a3b8;
                font-family: Helvetica, Arial, sans-serif;
            }}
        }}
        * {{ box-sizing: border-box; }}
        body {{
            font-family: Helvetica, Arial, sans-serif;
            font-size: 9.5px;
            color: #1e293b;
            margin: 0;
            line-height: 1.45;
        }}
        table {{ width: 100%; border-collapse: collapse; }}
        td, th {{ vertical-align: top; }}

        /* Top accent */
        .accent {{ height: 5px; background: linear-gradient(90deg, #0f172a 0%, #0f172a 62%, {accent} 100%); border-radius: 2px; }}

        /* Header */
        .hdr {{ margin-top: 12px; }}
        .hdr td {{ padding: 0; }}
        .logo-img {{ max-width: 52px; max-height: 52px; object-fit: contain; margin-right: 12px; }}
        .co-name {{ font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px; }}
        .co-tag {{ font-size: 8px; font-weight: 700; color: {accent}; text-transform: uppercase; letter-spacing: 1.4px; margin: 2px 0 6px; }}
        .co-meta {{ color: #64748b; font-size: 8.5px; line-height: 1.5; }}
        .doc-title {{ font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: 3px; text-align: right; }}
        .doc-no {{ font-family: "Courier New", monospace; font-size: 11px; font-weight: 700; color: {accent}; text-align: right; margin-top: 2px; }}
        .doc-dates {{ text-align: right; color: #64748b; font-size: 8.5px; margin-top: 6px; line-height: 1.6; }}
        .doc-dates b {{ color: #1e293b; }}

        /* Bill-to / meta band */
        .band {{ margin-top: 14px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }}
        .band td {{ padding: 10px 0; }}
        .band .divider {{ border-left: 1px solid #e2e8f0; padding-left: 14px; }}
        .eyebrow {{ font-size: 7.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; }}
        .bill-name {{ font-size: 11px; font-weight: 700; color: #0f172a; }}
        .kv {{ width: 100%; }}
        .kv td {{ padding: 1.5px 0; font-size: 8.8px; }}
        .kv .k {{ color: #64748b; width: 42%; }}
        .kv .v {{ color: #0f172a; font-weight: 600; }}

        .subject {{ margin: 12px 0 0; font-size: 9.5px; }}
        .subject b {{ color: #0f172a; }}

        /* Items table */
        .items {{ margin-top: 12px; table-layout: fixed; }}
        .items th {{
            background: #0f172a;
            color: #ffffff;
            font-size: 7.8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.9px;
            padding: 7px 8px;
            text-align: left;
        }}
        .items th.right {{ text-align: right; }}
        .items th.center {{ text-align: center; }}
        .items td {{ padding: 8px; border-bottom: 0.6px solid #e2e8f0; font-size: 9px; }}
        .items tr:nth-child(even) td {{ background: #f8fafc; }}
        .part-name {{ display: block; font-weight: 700; color: #0f172a; font-size: 9.5px; margin-bottom: 2px; }}
        .desc-meta {{ display: block; color: #64748b; font-size: 8px; line-height: 1.5; }}
        .center {{ text-align: center; }}
        .right {{ text-align: right; }}
        .num {{ font-family: "Courier New", monospace; white-space: nowrap; }}
        .muted {{ color: #94a3b8; }}
        .strong {{ font-weight: 700; color: #0f172a; }}

        /* Totals */
        .totals-wrap {{ margin-top: 4px; }}
        .totals-wrap td {{ padding: 0; }}
        .words-cell {{ padding: 12px 14px 0 0 !important; }}
        .words-label {{ font-size: 7.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 3px; }}
        .words-text {{ font-size: 9px; font-style: italic; color: #334155; }}
        .totals {{ width: 100%; margin-top: 6px; }}
        .totals td {{ padding: 5px 10px; font-size: 9.5px; }}
        .totals .lbl {{ color: #64748b; }}
        .totals .amt {{ text-align: right; font-family: "Courier New", monospace; font-weight: 700; color: #0f172a; white-space: nowrap; }}
        .totals .sub-row td {{ border-bottom: 0.6px solid #e2e8f0; }}
        .totals .grand td {{
            background: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 8px 10px;
        }}
        .totals .grand .amt {{ color: #ffffff; }}

        /* Commercial strip */
        .comm {{ margin-top: 16px; border: 0.8px solid #e2e8f0; border-radius: 4px; }}
        .comm td {{ padding: 8px 12px; border-left: 0.8px solid #e2e8f0; width: 25%; }}
        .comm td:first-child {{ border-left: none; }}
        .comm .val {{ font-size: 9.5px; font-weight: 700; color: #0f172a; margin-top: 1px; }}

        /* DFM callout */
        .dfm-callout {{
            margin-top: 14px;
            background: #f0f9ff;
            border-left: 3px solid {accent};
            border-radius: 0 4px 4px 0;
            padding: 9px 12px;
        }}
        .dfm-title {{ font-size: 8px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 1.1px; margin-bottom: 3px; }}
        .dfm-score {{ font-size: 9px; color: #0c4a6e; }}
        .dfm-list {{ margin: 5px 0 0 14px; padding: 0; color: #0c4a6e; font-size: 8.3px; line-height: 1.6; }}

        /* Terms + signature */
        .foot {{ margin-top: 16px; }}
        .foot td {{ padding: 0; }}
        .terms-title {{ font-size: 7.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 5px; }}
        .terms ol {{ margin: 0 0 0 14px; padding: 0; color: #475569; font-size: 8.5px; line-height: 1.7; }}
        .sign-cell {{ padding-left: 24px !important; }}
        .sign-box {{ border: 0.8px solid #e2e8f0; border-radius: 4px; padding: 12px 14px 10px; text-align: center; }}
        .sign-for {{ font-size: 9px; color: #334155; }}
        .sign-for b {{ color: #0f172a; }}
        .sign-space {{ height: 34px; }}
        .sign-rule {{ border-top: 0.8px solid #94a3b8; margin: 0 10px; }}
        .sign-title {{ font-size: 8.5px; font-weight: 700; color: #0f172a; margin-top: 4px; }}
        .sign-date {{ font-size: 7.5px; color: #94a3b8; margin-top: 2px; }}

        .thanks {{ margin-top: 14px; text-align: center; font-size: 8.5px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }}
    </style>
</head>
<body>
    <div class="accent"></div>

    <!-- Header -->
    <table class="hdr">
        <tr>
            <td style="width:56%;">
                <table><tr>
                    <td style="width:64px;">{company_logo_html}</td>
                    <td>
                        <div class="co-name">{company_name}</div>
                        <div class="co-tag">Precision CNC Manufacturing</div>
                        <div class="co-meta">{company_address}<br>{company_phone} &nbsp;·&nbsp; {company_email}</div>
                    </td>
                </tr></table>
            </td>
            <td style="width:44%;">
                <div class="doc-title">QUOTATION</div>
                <div class="doc-no">{quote_number}</div>
                <div class="doc-dates">
                    Issued: <b>{quote_date}</b><br>
                    Valid until: <b>{valid_until}</b>
                </div>
            </td>
        </tr>
    </table>

    <!-- Bill To + quote meta -->
    <table class="band">
        <tr>
            <td style="width:46%;">
                <div class="eyebrow">Bill To</div>
                <div class="bill-name">{client_block}</div>
            </td>
            <td style="width:54%;" class="divider">
                <table class="kv">
                    <tr><td class="k">Client Reference</td><td class="v">{client_id}</td></tr>
                    <tr><td class="k">Payment Terms</td><td class="v">{terms_of_payment}</td></tr>
                    <tr><td class="k">Estimated Lead Time</td><td class="v">{lead_time}</td></tr>
                    <tr><td class="k">Line Items</td><td class="v">{item_count}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <div class="subject"><b>Subject:</b> {subject}</div>

    <!-- Items -->
    <table class="items">
        <colgroup>
            <col style="width:5%;"><col style="width:49%;"><col style="width:8%;">
            <col style="width:10%;"><col style="width:14%;"><col style="width:14%;">
        </colgroup>
        <tr>
            <th class="center">#</th>
            <th>Part &amp; Specification</th>
            <th class="center">HSN</th>
            <th class="right">Qty</th>
            <th class="right">Unit Price (Rs.)</th>
            <th class="right">Amount (Rs.)</th>
        </tr>
        {line_items_html}
    </table>

    <!-- Totals -->
    <table class="totals-wrap">
        <tr>
            <td style="width:55%;" class="words-cell">
                <div class="words-label">Amount in Words</div>
                <div class="words-text">{amount_in_words}</div>
            </td>
            <td style="width:45%;">
                <table class="totals">
                    <tr class="sub-row"><td class="lbl">Subtotal</td><td class="amt">{subtotal:,.2f}</td></tr>
                    <tr class="sub-row"><td class="lbl">GST ({gst_display})</td><td class="amt">As applicable</td></tr>
                    <tr class="grand"><td>GRAND TOTAL (INR)</td><td class="amt">{grand_total:,.2f}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <!-- Commercial strip -->
    <table class="comm">
        <tr>
            <td><div class="eyebrow">Lead Time</div><div class="val">{lead_time}</div></td>
            <td><div class="eyebrow">Delivery</div><div class="val">{delivery}</div></td>
            <td><div class="eyebrow">Price Validity</div><div class="val">{price_validity}</div></td>
            <td><div class="eyebrow">GST</div><div class="val">{gst_display}</div></td>
        </tr>
    </table>

    {dfm_summary_html}

    <!-- Terms + signature -->
    <table class="foot">
        <tr>
            <td style="width:62%;" class="terms">
                <div class="terms-title">Terms &amp; Conditions</div>
                <ol>
                    <li>Payment terms: {terms_of_payment}.</li>
                    <li>Delivery: {delivery}.</li>
                    <li>GST: {gst_display}. Taxes charged extra where applicable.</li>
                    <li>Prices are valid until {valid_until} ({price_validity}); re-quote required thereafter.</li>
                    <li>Lead time is counted from receipt of confirmed purchase order and approved CAD.</li>
                </ol>
            </td>
            <td style="width:38%;" class="sign-cell">
                <div class="sign-box">
                    <div class="sign-for">For <b>{signature_name}</b></div>
                    <div class="sign-space"></div>
                    <div class="sign-rule"></div>
                    <div class="sign-title">Authorised Signatory</div>
                    <div class="sign-date">Prepared on {prepared_date}</div>
                </div>
            </td>
        </tr>
    </table>

    <div class="thanks">Thank you for the opportunity to quote. For clarifications regarding {quote_number}, contact {company_email}.</div>
</body>
</html>"""


# Global PDF generator instance
pdf_generator = PDFGenerator()


async def generate_quote_document(
    db: AsyncSession,
    quote: Quote,
    issuer: Optional[User] = None,
) -> str:
    """
    Generate PDF document for a quote.
    
    Returns path to generated PDF.
    """
    # Get geometry analysis
    from sqlalchemy import select
    from app.models.models import GeometryAnalysis
    
    query = select(GeometryAnalysis).where(
        GeometryAnalysis.cad_file_id == quote.cad_file_id
    )
    result = await db.execute(query)
    geometry = result.scalar_one_or_none()
    
    if not geometry:
        raise ValueError("Geometry analysis not found for quote")
    
    issuer_profile = None
    if issuer is not None:
        logo_abs = None
        if issuer.company_logo_path:
            logo_abs = str(Path(settings.UPLOAD_DIR) / issuer.company_logo_path)

        issuer_profile = {
            "company_name": issuer.company_name,
            "company_address": issuer.company_address,
            "company_email": issuer.email,
            "company_phone": "N/A",
            "company_logo_abs_path": logo_abs,
        }

    dfm_analysis = analyze_dfm_from_geometry(geometry)

    # Generate PDF
    pdf_path = await pdf_generator.generate_quote_pdf(
        quote,
        geometry,
        dfm_analysis,
        issuer_profile,
    )
    
    # Update quote with PDF path
    from app.services.quote import update_quote_pdf_path
    await update_quote_pdf_path(db, quote.id, pdf_path)
    
    return pdf_path


