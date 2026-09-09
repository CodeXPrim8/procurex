import os
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
import smtplib
from email.message import EmailMessage
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from ..models.quotation import Quotation, QuotationItem
from ..models.product import Product
from ..schemas.quotation import QuotationCreate, QuotationItemCreate
from ..core.config import settings


def generate_quotation_number() -> str:
    """Generate a unique quotation number."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"QT-{timestamp}"


def create_quotation(
    db: Session,
    user_id: int,
    quotation_data: QuotationCreate
) -> Quotation:
    """Create a new quotation."""
    quotation_number = generate_quotation_number()
    
    # Calculate total amount
    total_amount = Decimal("0.00")
    items = []
    
    for item_data in quotation_data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            continue
        
        unit_price = item_data.unit_price
        total_price = unit_price * item_data.quantity
        total_amount += total_price
        
        quotation_item = QuotationItem(
            quotation_id=0,  # Will be set after quotation is created
            product_id=item_data.product_id,
            vendor_product_id=item_data.vendor_product_id,
            product_name=product.name,
            quantity=item_data.quantity,
            unit_price=unit_price,
            total_price=total_price,
            specifications=item_data.specifications
        )
        items.append(quotation_item)
    
    quotation = Quotation(
        user_id=user_id,
        quotation_number=quotation_number,
        customer_name=quotation_data.customer_name,
        customer_email=quotation_data.customer_email,
        customer_phone=quotation_data.customer_phone,
        customer_address=quotation_data.customer_address,
        total_amount=total_amount,
        notes=quotation_data.notes,
        status="draft"
    )
    
    db.add(quotation)
    db.flush()  # Get the quotation ID
    
    # Set quotation_id for items
    for item in items:
        item.quotation_id = quotation.id
        db.add(item)
    
    db.commit()
    db.refresh(quotation)
    return quotation


def generate_quotation_pdf(quotation: Quotation, output_path: str) -> str:
    """Generate PDF for quotation."""
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    story = []
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=30,
    )
    
    # Title
    story.append(Paragraph("QUOTATION", title_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Quotation details
    story.append(Paragraph(f"<b>Quotation Number:</b> {quotation.quotation_number}", styles['Normal']))
    story.append(Paragraph(f"<b>Date:</b> {quotation.created_at.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Customer details
    story.append(Paragraph("<b>Bill To:</b>", styles['Heading2']))
    story.append(Paragraph(quotation.customer_name, styles['Normal']))
    story.append(Paragraph(quotation.customer_email, styles['Normal']))
    if quotation.customer_phone:
        story.append(Paragraph(quotation.customer_phone, styles['Normal']))
    if quotation.customer_address:
        story.append(Paragraph(quotation.customer_address, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Items table
    data = [['Product', 'Quantity', 'Unit Price', 'Total']]
    for item in quotation.items:
        data.append([
            item.product_name,
            str(item.quantity),
            f"${item.unit_price:.2f}",
            f"${item.total_price:.2f}"
        ])
    
    # Add total row
    data.append(['', '', '<b>Total:</b>', f"<b>${quotation.total_amount:.2f}</b>"])
    
    table = Table(data, colWidths=[3*inch, 1*inch, 1.5*inch, 1.5*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -2), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.lightgrey]),
    ]))
    
    story.append(table)
    story.append(Spacer(1, 0.3*inch))
    
    # Notes
    if quotation.notes:
        story.append(Paragraph("<b>Notes:</b>", styles['Heading2']))
        story.append(Paragraph(quotation.notes, styles['Normal']))
    
    doc.build(story)
    return output_path


def get_quotation_pdf_path(quotation_id: int) -> str:
    """Get the file path for a quotation PDF."""
    os.makedirs("quotations", exist_ok=True)
    return f"quotations/quotation_{quotation_id}.pdf"


def _ensure_quotation_pdf(quotation: Quotation) -> str:
    """
    Ensure a PDF exists for the given quotation and return its path.
    This is safe to call from request handlers prior to sending email.
    """
    pdf_path = get_quotation_pdf_path(quotation.id)
    if not os.path.exists(pdf_path):
        generate_quotation_pdf(quotation, pdf_path)
        # Best-effort to persist the PDF URL if the relationship is loaded
        try:
            quotation.pdf_url = pdf_path  # type: ignore[attr-defined]
        except Exception:
            # If the model doesn't have pdf_url or relationship isn't loaded,
            # we still return a valid PDF path.
            pass
    return pdf_path


def send_quotation_email(quotation: Quotation) -> None:
    """
    Send the quotation to the customer via email using SMTP settings.

    Raises an exception if email configuration is missing or sending fails.
    """
    # Basic configuration validation
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")
    if not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP_FROM_EMAIL is not configured")
    if not quotation.customer_email:
        raise RuntimeError("Quotation is missing customer_email")

    pdf_path = _ensure_quotation_pdf(quotation)

    # Build the email
    msg = EmailMessage()
    msg["Subject"] = f"Quotation {quotation.quotation_number}"
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = quotation.customer_email

    body_lines = [
        f"Dear {quotation.customer_name or 'Customer'},",
        "",
        "Please find attached your quotation from ProcureX.",
        "",
        f"Quotation number: {quotation.quotation_number}",
        f"Total amount: ${quotation.total_amount:.2f}",
    ]
    if quotation.notes:
        body_lines.extend(["", "Notes:", quotation.notes])
    body_lines.extend(["", "Best regards,", "ProcureX"])

    msg.set_content("\n".join(body_lines))

    # Attach PDF
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=os.path.basename(pdf_path),
    )

    # Send via SMTP with STARTTLS (typical modern configuration)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        try:
            server.starttls()
            server.ehlo()
        except Exception:
            # Some servers might not support STARTTLS; fail soft and try plain if configured that way.
            pass

        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.send_message(msg)


