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
                    "CAD",
                    Paragraph(f"{item['file_name']}<br/><font size='8'>Bulk quote item</font>", base_style),
                    escape(quote.hsn_code or "NA"),
                    f"{qty:.1f}",
                    "Pcs",
                    f"{(line_total / qty):,.2f}",
                    f"{line_total:,.2f}",
                ])
        else:
            line_rows = [[
                "1",
                "CAD",
                Paragraph(
                    f"{quote.cad_file.original_filename}<br/><font size='8'>"
                    f"Material: {quote.material.name} | Finish: {quote.surface_finish.name} | Inspection: {quote.inspection_level.name}"
                    f"</font>",
                    base_style,
                ),
                escape(quote.hsn_code or "NA"),
                f"{max(int(quote.quantity), 1):.1f}",
                "Pcs",
                f"{float(quote.unit_price):,.2f}",
                f"{float(quote.total_price):,.2f}",
            ]]

        items = Table(
            [["SN", "Image", "Description", "HSN Code", "Qty", "UOM", "Price", "Total"]] + line_rows,
            colWidths=[8 * mm, 20 * mm, 55 * mm, 20 * mm, 14 * mm, 14 * mm, 24 * mm, 35 * mm],
        )
        items.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.8, line_color),
            ("BACKGROUND", (0, 0), (-1, 0), light_gray),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("ALIGN", (0, 1), (1, -1), "CENTER"),
            ("ALIGN", (3, 1), (5, -1), "CENTER"),
            ("ALIGN", (6, 1), (7, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ]))
        content.append(items)

        subtotal = float(quote.total_price)
        gst_display = quote.gst or "As applicable"
        grand_total = subtotal

        lower_left = Paragraph(f"<b>Amount in Words</b><br/>INR {grand_total:,.2f} only.", base_style)
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
                    "description": f"{escape(item['file_name'])}<br><span class=\"desc-meta\">Bulk quote item</span>",
                    "hsn_code": escape(quote.hsn_code or "NA"),
                    "qty": qty,
                    "uom": "Pcs",
                    "unit_price": line_total / qty,
                    "line_total": line_total,
                })
        else:
            line_items = [{
                "description": (
                    f"{quote.cad_file.original_filename}<br>"
                    f"<span class=\"desc-meta\">Material: {escape(quote.material.name)} | "
                    f"Finish: {escape(quote.surface_finish.name)} | "
                    f"Inspection: {escape(quote.inspection_level.name)}</span><br>"
                    f"<span class=\"desc-meta\">Volume: {geometry.volume:.2f} cm3 | "
                    f"Weight: {weight_kg:.3f} kg</span>"
                ),
                "hsn_code": escape(quote.hsn_code or "NA"),
                "qty": max(int(quote.quantity), 1),
                "uom": "Pcs",
                "unit_price": float(quote.unit_price),
                "line_total": float(quote.total_price),
            }]

        line_items_html = ""
        for idx, item in enumerate(line_items, start=1):
            line_items_html += (
                "<tr>"
                f"<td class=\"center\">{idx}</td>"
                "<td class=\"image-cell\"><div class=\"img-ph\">CAD</div></td>"
                f"<td>{item['description']}</td>"
                f"<td class=\"center\">{item['hsn_code']}</td>"
                f"<td class=\"right\">{item['qty']:.1f}</td>"
                f"<td class=\"center\">{item['uom']}</td>"
                f"<td class=\"right\">{item['unit_price']:,.2f}</td>"
                f"<td class=\"right\">{item['line_total']:,.2f}</td>"
                "</tr>"
            )

        subtotal = float(quote.total_price)
        gst_display = quote.gst or "As applicable"
        grand_total = subtotal

        subject_line = cleaned_notes.splitlines()[0].strip() if cleaned_notes else "Quote for CNC machining"
        client_lines = [
            quote.customer_name or "Valued Customer",
            quote.customer_company or "",
            quote.customer_email or "",
        ]
        client_block = "<br>".join(escape(line) for line in client_lines if line)

        logo_html = ""
        logo_abs_path = (issuer_profile or {}).get("company_logo_abs_path")
        if logo_abs_path and Path(logo_abs_path).exists():
            logo_uri = Path(logo_abs_path).as_uri()
            logo_html = f'<img src="{escape(logo_uri)}" alt="Company logo" class="logo-img">'

        context = {
            "company_name": escape((issuer_profile or {}).get("company_name") or "CNC Quote Platform"),
            "company_address": escape((issuer_profile or {}).get("company_address") or "123 Manufacturing Way\nIndustrial City, IC 12345").replace("\n", "<br>"),
            "company_phone": escape((issuer_profile or {}).get("company_phone") or "N/A"),
            "company_email": escape((issuer_profile or {}).get("company_email") or "quotes@cncplatform.com"),
            "company_logo_html": logo_html,
            "quote_number": quote.quote_number,
            "quote_date": quote.created_at.strftime("%d-%m-%Y"),
            "terms_of_payment": escape(quote.payment_terms or "Not specified"),
            "client_id": str(quote.id).split("-")[0].upper(),
            "client_block": client_block,
            "subject": escape(subject_line),
            "line_items_html": line_items_html,
            "subtotal": subtotal,
            "gst_display": escape(gst_display),
            "grand_total": grand_total,
            "delivery": escape(quote.delivery or "Not specified"),
            "price_validity": escape(quote.price_validity or "Not specified"),
            "signature_name": escape((issuer_profile or {}).get("company_name") or "Authorized Signatory"),
            "dfm_summary_html": self._build_dfm_summary_html(dfm_analysis),
            "prepared_date": datetime.utcnow().strftime("%d-%m-%Y"),
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
            "<table><tr><td>"
            "<div class=\"terms-title\">DFM Summary</div>"
            f"<div>Score: <strong>{summary['score']}/100 ({escape(summary['label'])})</strong></div>"
            f"<div>Total Findings: {summary['issue_count']}</div>"
            "<ul style=\"margin:6px 0 0 18px; padding:0;\">"
            f"{issue_html}"
            "</ul>"
            "</td></tr></table>"
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
        @page {{ size: A4; margin: 10mm; }}
        body {{
            font-family: "Segoe UI", Arial, Helvetica, sans-serif;
            font-size: 10.5px;
            color: #0f172a;
            margin: 0;
            line-height: 1.35;
        }}
        .quote {{ border: 1px solid #1e293b; }}
        table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
        td, th {{ border: 0.8px solid #475569; vertical-align: top; padding: 7px; }}
        .no-border td {{ border: none; padding: 0; }}
        .header-title {{ font-size: 22px; color: #0f172a; font-weight: 700; line-height: 1.2; margin-bottom: 2px; }}
        .header-sub {{ font-size: 12px; color: #1d4ed8; font-weight: 600; margin-bottom: 8px; }}
        .brand-wrap {{ display: table; width: 100%; }}
        .brand-logo {{ display: table-cell; width: 70px; vertical-align: top; }}
        .brand-text {{ display: table-cell; vertical-align: top; }}
        .logo-img {{ max-width: 60px; max-height: 60px; object-fit: contain; }}
        .quote-heading {{ text-align: center; font-size: 14px; font-weight: 700; background: #e2e8f0; letter-spacing: 0.5px; padding: 8px 6px; }}
        .meta-label {{ width: 44%; font-weight: 600; background: #f8fafc; }}
        .meta-val {{ text-align: right; font-weight: 700; }}
        .section-label {{ font-size: 13px; font-weight: 700; margin-bottom: 6px; }}
        .subject-row {{ font-size: 12px; font-weight: 700; padding: 8px 0 2px; }}
        .item-head th {{ background: #eef2ff; text-align: center; font-size: 11px; font-weight: 700; }}
        .center {{ text-align: center; }}
        .right {{ text-align: right; }}
        .image-cell {{ text-align: center; }}
        .img-ph {{
            margin: 0 auto;
            width: 54px;
            height: 54px;
            border: 1px dashed #777;
            color: #666;
            font-size: 10px;
            line-height: 54px;
        }}
        .desc-meta {{ color: #4a4a4a; font-size: 11px; }}
        .amount-label {{ font-size: 13px; font-weight: 700; margin-bottom: 4px; }}
        .terms-title {{ font-size: 13px; font-weight: 700; margin-bottom: 4px; }}
        .totals-table td {{ border: none; padding: 3px 0; }}
        .totals-table .key {{ width: 70%; font-weight: 700; }}
        .totals-table .sep {{ width: 6%; text-align: center; }}
        .totals-table .val {{ width: 24%; text-align: right; font-weight: 700; }}
        .sign-wrap {{ text-align: center; padding-top: 8px; }}
        .sign-date {{ color: #475569; font-size: 10px; margin-top: 4px; }}
        .sign-line {{ margin-top: 24px; font-weight: 700; }}
        .footer-note {{ text-align: center; font-size: 10px; color: #475569; padding: 6px 0; border-top: 1px solid #1e293b; }}
        .section-table {{ margin-top: -1px; }}
        .totals-cell {{ background: #f8fafc; }}
    </style>
</head>
<body>
    <div class="quote">
        <table>
            <tr>
                <td style="width:50%;">
                    <div class="brand-wrap">
                        <div class="brand-logo">{company_logo_html}</div>
                        <div class="brand-text">
                            <div class="header-title">{company_name}</div>
                            <div class="header-sub">Precision Manufacturing Quotation</div>
                            <div>{company_address}</div>
                            <div>Contact: {company_phone}</div>
                            <div>Email: {company_email}</div>
                        </div>
                    </div>
                </td>
                <td style="width:50%; padding:0;">
                    <table>
                        <tr><td class="quote-heading" colspan="2">QUOTATION</td></tr>
                        <tr><td class="meta-label">Quotation No.</td><td class="meta-val">{quote_number}</td></tr>
                        <tr><td class="meta-label">Date</td><td class="meta-val">{quote_date}</td></tr>
                        <tr><td class="meta-label">Terms of Payment</td><td class="meta-val">{terms_of_payment}</td></tr>
                        <tr><td class="meta-label">Client ID</td><td class="meta-val">{client_id}</td></tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td colspan="2">
                    <div class="section-label">To:</div>
                    <div>{client_block}</div>
                    <div class="subject-row">Subject:- {subject}</div>
                </td>
            </tr>
        </table>

        <table class="section-table">
            <colgroup>
                <col style="width:4%;"><col style="width:12%;"><col style="width:24%;"><col style="width:10%;">
                <col style="width:8%;"><col style="width:7%;"><col style="width:12%;"><col style="width:13%;">
            </colgroup>
            <tr class="item-head">
                <th>SN</th>
                <th>Image</th>
                <th>Description</th>
                <th>HSN Code</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Price</th>
                <th>Total</th>
            </tr>
            {line_items_html}
        </table>

        <table class="section-table">
            <tr>
                <td style="width:60%;">
                    <div class="amount-label">Amount in Words</div>
                    <div>INR {grand_total:,.2f} only.</div>
                </td>
                <td class="totals-cell" style="width:40%;">
                    <table class="totals-table">
                        <tr><td class="key">Sub Total</td><td class="sep">:</td><td class="val">{subtotal:,.2f}</td></tr>
                        <tr><td class="key">GST ({gst_display})</td><td class="sep">:</td><td class="val">Included/As applicable</td></tr>
                        <tr><td class="key">Total Amount</td><td class="sep">:</td><td class="val">{grand_total:,.2f}</td></tr>
                    </table>
                </td>
            </tr>
        </table>

        <table class="section-table">
            <tr>
                <td style="width:65%;">
                    <div class="terms-title">Terms and Conditions:</div>
                    <div>1. Payment Terms: {terms_of_payment}</div>
                    <div>2. Delivery: {delivery}</div>
                    <div>3. GST: {gst_display}</div>
                    <div>4. Price Validity: {price_validity}</div>
                </td>
                <td style="width:35%;">
                    <div class="sign-wrap">
                        <div>For {signature_name}</div>
                        <div class="sign-date">Prepared on {prepared_date}</div>
                        <div class="sign-line">Authorized Signatory</div>
                    </div>
                </td>
            </tr>
        </table>

        {dfm_summary_html}

        <div class="footer-note">This is a software generated quotation from {company_name}. For clarifications, contact {company_email}.</div>
    </div>
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


