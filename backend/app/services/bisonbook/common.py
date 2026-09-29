from __future__ import annotations

import calendar
import csv
import io
from datetime import date, datetime
from typing import Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.bisonbook import BisonBookSettings
from ...models.vendor import Vendor


class BisonBookError(ValueError):
    """Business-rule violation surfaced to the vendor as a 400."""


def money(value) -> float:
    return round(float(value or 0) + 0.0, 2)


def get_settings(db: Session, vendor: Vendor) -> BisonBookSettings:
    row = db.query(BisonBookSettings).filter(BisonBookSettings.vendor_id == vendor.id).first()
    if row:
        return row
    row = BisonBookSettings(vendor_id=vendor.id)
    db.add(row)
    db.flush()
    return row


def ensure_open_period(db: Session, vendor: Vendor, when: date) -> None:
    locked = get_settings(db, vendor).locked_through
    if locked and when <= locked:
        raise BisonBookError(
            f"The books are locked through {locked.isoformat()}. Unlock the period or use a later date."
        )


def to_date(value) -> date:
    if value is None:
        return date.today()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def add_months(day: date, months: int) -> date:
    index = day.month - 1 + months
    year = day.year + index // 12
    month = index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def to_csv(headers: Sequence[str], rows: Iterable[Sequence]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if cell is None else cell for cell in row])
    return buffer.getvalue().encode("utf-8")


def table_pdf(title: str, subtitle: Optional[str], headers: List[str], rows: List[List], footer: Optional[str] = None) -> bytes:
    """Generic branded table PDF for reports and tax returns."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<font color='#19C37D'>BisonBook</font> &middot; {title}", styles["Heading1"]),
    ]
    if subtitle:
        story.append(Paragraph(subtitle, styles["Normal"]))
    story.append(Spacer(1, 0.25 * inch))
    data = [headers] + [["" if cell is None else str(cell) for cell in row] for row in rows]
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171717")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f4f4")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(table)
    if footer:
        story.append(Spacer(1, 0.25 * inch))
        story.append(Paragraph(footer, styles["Italic"]))
    doc.build(story)
    return buffer.getvalue()


def naira(value) -> str:
    return f"NGN {money(value):,.2f}"
