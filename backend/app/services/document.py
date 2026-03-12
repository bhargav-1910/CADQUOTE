"""PDF quotation document generation service."""
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import asyncio

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Quote, GeometryAnalysis
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
        )
    
    def _generate_pdf_sync(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
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
                html_content = self._render_quote_html(quote, geometry)
                wp = self._get_weasyprint()
                html = wp["HTML"](string=html_content)
                html.write_pdf(str(output_path))
            except Exception:
                # Fall back to reportlab on WeasyPrint error
                self._generate_pdf_reportlab(quote, geometry, str(output_path))
        else:
            # Use reportlab fallback
            self._generate_pdf_reportlab(quote, geometry, str(output_path))
        
        return str(output_path)
    
    def _generate_pdf_reportlab(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
        output_path: str,
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
        
        # Header
        content.append(Paragraph("CNC Quote Platform", title_style))
        content.append(Paragraph("123 Manufacturing Way, Industrial City, IC 12345", normal_style))
        content.append(Paragraph("+1 (555) 123-4567 | quotes@cncplatform.com", normal_style))
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
        
        # Part specifications
        content.append(Paragraph("Part Specifications", heading_style))
        part_data = [
            ["Part File", quote.cad_file.original_filename],
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
        pricing_data = [
            ["Description", "Amount (INR)"],
            ["Unit Price", f"₹{float(quote.unit_price):,.2f}"],
            [f"Total Price ({quote.quantity} units)", f"₹{float(quote.total_price):,.2f}"],
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
        content.append(Paragraph("CNC Quote Platform | +1 (555) 123-4567 | quotes@cncplatform.com", footer_style))
        
        # Build PDF
        doc.build(content)
    
    def _render_quote_html(
        self,
        quote: Quote,
        geometry: GeometryAnalysis,
    ) -> str:
        """Render quote HTML template."""
        # Calculate weight
        weight_kg = (geometry.volume * quote.material.density) / 1000
        
        # Template context
        context = {
            # Company info
            "company_name": "CNC Quote Platform",
            "company_address": "123 Manufacturing Way\nIndustrial City, IC 12345",
            "company_phone": "+1 (555) 123-4567",
            "company_email": "quotes@cncplatform.com",
            
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
            
            # Configuration
            "material_name": quote.material.name,
            "material_category": quote.material.category,
            "surface_finish_name": quote.surface_finish.name,
            "inspection_level_name": quote.inspection_level.name,
            
            # Pricing
            "quantity": quote.quantity,
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
                <td>Total Price ({quantity} units)</td>
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
    
    # Generate PDF
    pdf_path = await pdf_generator.generate_quote_pdf(quote, geometry)
    
    # Update quote with PDF path
    from app.services.quote import update_quote_pdf_path
    await update_quote_pdf_path(db, quote.id, pdf_path)
    
    return pdf_path
