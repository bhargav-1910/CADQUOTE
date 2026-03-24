"""PDF quotation document generation service."""
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import asyncio

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Quote, GeometryAnalysis, User
from app.services.storage import storage
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
            issuer_profile,
        )
    
    def _generate_pdf_sync(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
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
                html_content = self._render_quote_html(quote, geometry, issuer_profile)
                wp = self._get_weasyprint()
                html = wp["HTML"](string=html_content)
                html.write_pdf(str(output_path))
            except Exception:
                # Fall back to reportlab on WeasyPrint error
                self._generate_pdf_reportlab(quote, geometry, str(output_path), issuer_profile)
        else:
            # Use reportlab fallback
            self._generate_pdf_reportlab(quote, geometry, str(output_path), issuer_profile)
        
        return str(output_path)
    
    def _generate_pdf_reportlab(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        output_path: str,
        issuer_profile: Optional[dict] = None,
    ) -> None:
        """Generate PDF using reportlab (fallback for Windows)."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        
        # Calculate weight
        weight_kg = (geometry.volume * quote.material.density) / 1000
        
        # Create PDF document
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=2*cm,
            rightMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm,
        )
        
        # Colors
        primary_color = HexColor('#2563eb')
        gray_color = HexColor('#666666')
        light_gray = HexColor('#f3f4f6')
        green_color = HexColor('#22c55e')
        
        # Styles
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=primary_color,
            spaceAfter=20,
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=primary_color,
            spaceAfter=10,
            spaceBefore=15,
        )
        
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=10,
            textColor=HexColor('#333333'),
        )
        
        # Build content
        content = []
        
        company_name = (issuer_profile or {}).get("company_name") or "CNC Quote Platform"
        company_address = (issuer_profile or {}).get("company_address") or "123 Manufacturing Way, Industrial City, IC 12345"
        company_email = (issuer_profile or {}).get("company_email") or "quotes@cncplatform.com"
        company_phone = (issuer_profile or {}).get("company_phone") or "N/A"
        logo_path = (issuer_profile or {}).get("company_logo_abs_path")

        # Header
        if logo_path and os.path.exists(logo_path):
            from reportlab.platypus import Image
            content.append(Image(logo_path, width=4*cm, height=4*cm, kind='proportional'))
            content.append(Spacer(1, 8))
        content.append(Paragraph(company_name, title_style))
        content.append(Paragraph(company_address.replace("\n", "<br/>"), normal_style))
        content.append(Paragraph(f"{company_phone} | {company_email}", normal_style))
        content.append(Spacer(1, 20))
        
        # Quote info
        content.append(Paragraph(f"<b>QUOTATION #{quote.quote_number}</b>", heading_style))
        content.append(Paragraph(f"Date: {quote.created_at.strftime('%B %d, %Y')}", normal_style))
        content.append(Paragraph(f"Valid Until: {quote.valid_until.strftime('%B %d, %Y')}", normal_style))
        content.append(Spacer(1, 15))
        
        # Customer info
        content.append(Paragraph("Customer Information", heading_style))
        customer_name = quote.customer_name or "Valued Customer"
        customer_company = quote.customer_company or ""
        customer_email = quote.customer_email or ""
        content.append(Paragraph(f"<b>{customer_name}</b>", normal_style))
        if customer_company:
            content.append(Paragraph(customer_company, normal_style))
        if customer_email:
            content.append(Paragraph(customer_email, normal_style))
        content.append(Spacer(1, 15))
        
        combined_items = self._parse_combined_items(quote.notes)

        # Part specifications
        content.append(Paragraph("Part Specifications", heading_style))
        if combined_items:
            files_data = [["Part File", "Qty", "Line Total (INR)"]]
            for item in combined_items:
                files_data.append([
                    item["file_name"],
                    str(item["quantity"]),
                    f"₹{float(item['line_total']):,.2f}",
                ])

            files_table = Table(files_data, colWidths=[9*cm, 2*cm, 4*cm])
            files_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), light_gray),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e5e7eb')),
                ('PADDING', (0, 0), (-1, -1), 8),
                ('ALIGN', (1, 1), (2, -1), 'RIGHT'),
            ]))
            content.append(files_table)
            content.append(Spacer(1, 10))

        part_data = [
            ["Primary Part", quote.cad_file.original_filename],
            ["Dimensions (X × Y × Z)", f"{geometry.bbox_x:.2f} × {geometry.bbox_y:.2f} × {geometry.bbox_z:.2f} cm"],
            ["Volume", f"{geometry.volume:.2f} cm³"],
            ["Surface Area", f"{geometry.surface_area:.2f} cm²"],
            ["Estimated Weight", f"{weight_kg:.3f} kg"],
        ]
        part_table = Table(part_data, colWidths=[5*cm, 10*cm])
        part_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), light_gray),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e5e7eb')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        content.append(part_table)
        content.append(Spacer(1, 15))
        
        # Configuration
        content.append(Paragraph("Configuration", heading_style))
        config_data = [
            ["Material", f"{quote.material.name} ({quote.material.category})"],
            ["Surface Finish", quote.surface_finish.name],
            ["Inspection Level", quote.inspection_level.name],
            ["Quantity", f"{quote.quantity} unit(s)"],
        ]
        config_table = Table(config_data, colWidths=[5*cm, 10*cm])
        config_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), light_gray),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e5e7eb')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        content.append(config_table)
        content.append(Spacer(1, 15))
        
        # Pricing - Show only total price in INR
        content.append(Paragraph("Pricing", heading_style))
        quantity_label = "combined files" if combined_items else f"{quote.quantity} units"
        pricing_data = [
            ["Description", "Amount (INR)"],
            ["Unit Price", f"₹{float(quote.unit_price):,.2f}"],
            [f"Total Price ({quantity_label})", f"₹{float(quote.total_price):,.2f}"],
        ]
        pricing_table = Table(pricing_data, colWidths=[10*cm, 5*cm])
        pricing_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), light_gray),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, -1), (-1, -1), primary_color),
            ('TEXTCOLOR', (0, -1), (-1, -1), HexColor('#ffffff')),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e5e7eb')),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        content.append(pricing_table)
        content.append(Spacer(1, 15))
        
        # Lead time
        content.append(Paragraph(
            f"<b>Estimated Lead Time:</b> {quote.estimated_lead_time_days} business days",
            normal_style
        ))
        content.append(Spacer(1, 10))
        
        # Validity
        content.append(Paragraph(
            f"<b>Quote Validity:</b> This quotation is valid for {settings.QUOTE_VALIDITY_DAYS} days from the date of issue.",
            normal_style
        ))
        content.append(Spacer(1, 20))
        
        # Terms
        content.append(Paragraph("Terms & Conditions", heading_style))
        terms = [
            "Prices are valid for the quantity specified.",
            "Lead time begins upon order confirmation and material availability.",
            "Payment terms: Net 30 days from invoice date.",
            "Shipping costs are not included unless otherwise specified.",
            "First article inspection available upon request.",
            "Tolerances per ISO 2768-mK unless otherwise specified.",
        ]
        for term in terms:
            content.append(Paragraph(f"• {term}", normal_style))
        
        content.append(Spacer(1, 30))
        
        # Footer
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=9,
            textColor=gray_color,
            alignment=TA_CENTER,
        )
        content.append(Paragraph("Thank you for your inquiry. We look forward to working with you.", footer_style))
        content.append(Paragraph(f"{company_name} | {company_phone} | {company_email}", footer_style))
        
        # Build PDF
        doc.build(content)
    
    def _render_quote_html(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        issuer_profile: Optional[dict] = None,
    ) -> str:
        """Render quote HTML template."""
        # Calculate weight
        weight_kg = (geometry.volume * quote.material.density) / 1000
        combined_items = self._parse_combined_items(quote.notes)

        combined_rows = ""
        if combined_items:
            combined_rows = "".join(
                f"<tr><td>{item['file_name']}</td><td>{item['quantity']}</td><td>₹{float(item['line_total']):,.2f}</td></tr>"
                for item in combined_items
            )

        combined_files_section = ""
        if combined_items:
            combined_files_section = (
                "<div class=\"section\">"
                "<div class=\"section-title\">Uploaded Files</div>"
                "<table class=\"part-table\">"
                "<tr><th>Part File</th><th>Qty</th><th>Line Total (INR)</th></tr>"
                f"{combined_rows}"
                "</table>"
                "</div>"
            )
        
        # Template context
        context = {
            # Company info
            "company_name": (issuer_profile or {}).get("company_name") or "CNC Quote Platform",
            "company_address": (issuer_profile or {}).get("company_address") or "123 Manufacturing Way\nIndustrial City, IC 12345",
            "company_phone": (issuer_profile or {}).get("company_phone") or "N/A",
            "company_email": (issuer_profile or {}).get("company_email") or "quotes@cncplatform.com",
            
            # Quote info
            "quote_number": quote.quote_number,
            "quote_date": quote.created_at.strftime("%B %d, %Y"),
            "valid_until": quote.valid_until.strftime("%B %d, %Y"),
            "validity_days": settings.QUOTE_VALIDITY_DAYS,
            
            # Customer info
            "customer_name": quote.customer_name or "Valued Customer",
            "customer_company": quote.customer_company or "",
            "customer_email": quote.customer_email or "",
            
            # Part info
            "part_name": quote.cad_file.original_filename,
            "volume_cm3": round(geometry.volume, 2),
            "surface_area_cm2": round(geometry.surface_area, 2),
            "bbox_x": round(geometry.bbox_x, 2),
            "bbox_y": round(geometry.bbox_y, 2),
            "bbox_z": round(geometry.bbox_z, 2),
            "weight_kg": round(weight_kg, 3),
            "combined_files_section": combined_files_section,
            
            # Configuration
            "material_name": quote.material.name,
            "material_category": quote.material.category,
            "surface_finish_name": quote.surface_finish.name,
            "inspection_level_name": quote.inspection_level.name,
            
            # Pricing
            "quantity": quote.quantity,
            "quantity_label": "combined files" if combined_items else f"{quote.quantity} units",
            "material_cost": float(quote.material_cost),
            "machining_cost": float(quote.machining_cost),
            "finish_cost": float(quote.finish_cost),
            "inspection_cost": float(quote.inspection_cost),
            "unit_price": float(quote.unit_price),
            "total_price": float(quote.total_price),
            
            # Lead time
            "lead_time_days": quote.estimated_lead_time_days,
            
            # Notes
            "notes": quote.notes or "",
            
            # Terms
            "terms_and_conditions": [
                "Prices are valid for the quantity specified.",
                "Lead time begins upon order confirmation and material availability.",
                "Payment terms: Net 30 days from invoice date.",
                "Shipping costs are not included unless otherwise specified.",
                "First article inspection available upon request.",
                "Tolerances per ISO 2768-mK unless otherwise specified.",
            ],
        }
        
        # Use inline template since we're just creating the system
        return self._get_inline_template().format(**context)

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
            if len(parts) != 3:
                continue

            file_name = parts[0].strip()
            try:
                quantity = int(parts[1].strip())
                line_total = float(parts[2].strip())
            except ValueError:
                continue

            items.append({
                "file_name": file_name,
                "quantity": quantity,
                "line_total": line_total,
            })

        return items
    
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
            margin: 2cm;
        }}
        
        body {{
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.5;
            color: #333;
            margin: 0;
            padding: 0;
        }}
        
        .header {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #2563eb;
        }}
        
        .company-info {{
            text-align: left;
        }}
        
        .company-name {{
            font-size: 20pt;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 5px;
        }}
        
        .quote-info {{
            text-align: right;
        }}
        
        .quote-number {{
            font-size: 14pt;
            font-weight: bold;
            color: #333;
        }}
        
        .section {{
            margin-bottom: 25px;
        }}
        
        .section-title {{
            font-size: 12pt;
            font-weight: bold;
            color: #2563eb;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }}
        
        .customer-details {{
            background: #f9fafb;
            padding: 15px;
            border-radius: 5px;
        }}
        
        .part-table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        
        .part-table th,
        .part-table td {{
            padding: 10px;
            text-align: left;
            border: 1px solid #e5e7eb;
        }}
        
        .part-table th {{
            background: #f3f4f6;
            font-weight: bold;
        }}
        
        .pricing-table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        
        .pricing-table th,
        .pricing-table td {{
            padding: 10px;
            border: 1px solid #e5e7eb;
        }}
        
        .pricing-table th {{
            background: #f3f4f6;
            text-align: left;
        }}
        
        .pricing-table td {{
            text-align: right;
        }}
        
        .pricing-table td:first-child {{
            text-align: left;
        }}
        
        .total-row {{
            font-weight: bold;
            background: #2563eb;
            color: white;
        }}
        
        .total-row td {{
            font-size: 12pt;
        }}
        
        .lead-time {{
            background: #ecfdf5;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #22c55e;
            margin-top: 15px;
        }}
        
        .lead-time-value {{
            font-size: 14pt;
            font-weight: bold;
            color: #22c55e;
        }}
        
        .validity {{
            background: #fef3c7;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #f59e0b;
            margin-top: 15px;
        }}
        
        .terms {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }}
        
        .terms ul {{
            margin: 0;
            padding-left: 20px;
        }}
        
        .terms li {{
            margin-bottom: 5px;
            font-size: 9pt;
            color: #666;
        }}
        
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #2563eb;
            text-align: center;
            font-size: 9pt;
            color: #666;
        }}
        
        .signature-line {{
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
        }}
        
        .signature {{
            width: 45%;
            border-top: 1px solid #333;
            padding-top: 10px;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="company-info">
            <div class="company-name">{company_name}</div>
            <div>{company_address}</div>
            <div>{company_phone}</div>
            <div>{company_email}</div>
        </div>
        <div class="quote-info">
            <div class="quote-number">QUOTATION</div>
            <div><strong>Quote #:</strong> {quote_number}</div>
            <div><strong>Date:</strong> {quote_date}</div>
            <div><strong>Valid Until:</strong> {valid_until}</div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Customer Information</div>
        <div class="customer-details">
            <div><strong>{customer_name}</strong></div>
            <div>{customer_company}</div>
            <div>{customer_email}</div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Part Specifications</div>
        <table class="part-table">
            <tr>
                <th>Part File</th>
                <td colspan="3">{part_name}</td>
            </tr>
            <tr>
                <th>Dimensions (X × Y × Z)</th>
                <td>{bbox_x} × {bbox_y} × {bbox_z} cm</td>
                <th>Volume</th>
                <td>{volume_cm3} cm³</td>
            </tr>
            <tr>
                <th>Surface Area</th>
                <td>{surface_area_cm2} cm²</td>
                <th>Estimated Weight</th>
                <td>{weight_kg} kg</td>
            </tr>
        </table>
    </div>

    {combined_files_section}
    
    <div class="section">
        <div class="section-title">Configuration</div>
        <table class="part-table">
            <tr>
                <th>Material</th>
                <td>{material_name} ({material_category})</td>
            </tr>
            <tr>
                <th>Surface Finish</th>
                <td>{surface_finish_name}</td>
            </tr>
            <tr>
                <th>Inspection Level</th>
                <td>{inspection_level_name}</td>
            </tr>
            <tr>
                <th>Quantity</th>
                <td>{quantity} unit(s)</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <div class="section-title">Pricing</div>
        <table class="pricing-table">
            <tr>
                <th>Description</th>
                <th>Amount (INR)</th>
            </tr>
            <tr>
                <td><strong>Unit Price</strong></td>
                <td><strong>₹{unit_price:,.2f}</strong></td>
            </tr>
            <tr class="total-row">
                <td>Total Price ({quantity_label})</td>
                <td>₹{total_price:,.2f}</td>
            </tr>
        </table>
        
        <div class="lead-time">
            <strong>Estimated Lead Time:</strong> 
            <span class="lead-time-value">{lead_time_days:.1f} business days</span>
        </div>
        
        <div class="validity">
            <strong>Quote Validity:</strong> This quotation is valid for {validity_days} days from the date of issue.
        </div>
    </div>
    
    <div class="terms">
        <div class="section-title">Terms & Conditions</div>
        <ul>
            <li>Prices are valid for the quantity specified.</li>
            <li>Lead time begins upon order confirmation and material availability.</li>
            <li>Payment terms: Net 30 days from invoice date.</li>
            <li>Shipping costs are not included unless otherwise specified.</li>
            <li>First article inspection available upon request.</li>
            <li>Tolerances per ISO 2768-mK unless otherwise specified.</li>
        </ul>
    </div>
    
    <div class="signature-line">
        <div class="signature">
            Authorized Signature
        </div>
        <div class="signature">
            Customer Acceptance
        </div>
    </div>
    
    <div class="footer">
        <p>Thank you for your inquiry. We look forward to working with you.</p>
        <p>{company_name} | {company_phone} | {company_email}</p>
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

    # Generate PDF
    pdf_path = await pdf_generator.generate_quote_pdf(quote, geometry, issuer_profile)
    
    # Update quote with PDF path
    from app.services.quote import update_quote_pdf_path
    await update_quote_pdf_path(db, quote.id, pdf_path)
    
    return pdf_path


