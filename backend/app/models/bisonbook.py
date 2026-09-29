"""BisonBook: vendor back-office (inventory, sales, ledger, tax, files).

Amounts are stored in Naira as floats rounded to 2dp, matching catalog prices.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..core.database import Base


class BisonBookSettings(Base):
    __tablename__ = "bb_settings"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), unique=True, nullable=False)
    low_stock_threshold = Column(Integer, default=5)
    payment_terms_days = Column(Integer, default=14)
    quote_valid_days = Column(Integer, default=30)
    next_invoice_number = Column(Integer, default=1)
    next_quote_number = Column(Integer, default=1)
    locked_through = Column(Date, nullable=True)
    financial_year_end_month = Column(Integer, default=12)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockMovement(Base):
    __tablename__ = "bb_stock_movements"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    vendor_product_id = Column(Integer, ForeignKey("vendor_products.id"), nullable=False, index=True)
    movement_type = Column(String, nullable=False)  # opening | in | out | adjust | sale | return
    quantity = Column(Integer, nullable=False)  # signed: + into stock, - out of stock
    unit_cost = Column(Float, nullable=True)
    reference = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor_product = relationship("VendorProduct")


class BBCustomer(Base):
    __tablename__ = "bb_customers"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    tin = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SalesDocument(Base):
    __tablename__ = "bb_sales_documents"
    __table_args__ = (UniqueConstraint("vendor_id", "number", name="uq_bb_sales_doc_number"),)

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("bb_customers.id"), nullable=True)
    kind = Column(String, nullable=False)  # quote | invoice
    number = Column(String, nullable=False)
    # quote: draft | sent | accepted | declined | converted
    # invoice: draft | issued | partially_paid | paid | void
    status = Column(String, nullable=False, default="draft")
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)
    customer_tin = Column(String, nullable=True)
    vat_rate = Column(Float, default=0.0)
    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    source_quote_id = Column(Integer, ForeignKey("bb_sales_documents.id"), nullable=True)
    journal_entry_id = Column(Integer, ForeignKey("bb_journal_entries.id"), nullable=True)
    stock_posted = Column(Boolean, default=False)
    pdf_url = Column(String, nullable=True)
    issued_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines = relationship(
        "SalesLine",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="SalesLine.id",
    )
    payments = relationship(
        "BBPayment",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="BBPayment.paid_at",
    )


class SalesLine(Base):
    __tablename__ = "bb_sales_lines"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("bb_sales_documents.id"), nullable=False, index=True)
    vendor_product_id = Column(Integer, ForeignKey("vendor_products.id"), nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=1)
    unit_price = Column(Float, nullable=False, default=0)
    line_total = Column(Float, nullable=False, default=0)

    document = relationship("SalesDocument", back_populates="lines")


class BBPayment(Base):
    __tablename__ = "bb_payments"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("bb_sales_documents.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)  # amount settled against the invoice (cash + WHT)
    wht_amount = Column(Float, default=0.0)  # WHT deducted at source by the customer
    method = Column(String, default="bank")  # bank | cash
    reference = Column(String, nullable=True)
    paid_at = Column(Date, nullable=False)
    journal_entry_id = Column(Integer, ForeignKey("bb_journal_entries.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("SalesDocument", back_populates="payments")


class BBAccount(Base):
    __tablename__ = "bb_accounts"
    __table_args__ = (UniqueConstraint("vendor_id", "code", name="uq_bb_account_code"),)

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    account_type = Column(String, nullable=False)  # asset | liability | equity | income | expense
    system_key = Column(String, nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class JournalEntry(Base):
    __tablename__ = "bb_journal_entries"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    memo = Column(String, nullable=True)
    source_type = Column(String, nullable=True)  # invoice | payment | stock | expense | manual | reversal
    source_id = Column(Integer, nullable=True)
    reversed_entry_id = Column(Integer, ForeignKey("bb_journal_entries.id"), nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lines = relationship(
        "JournalLine",
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="JournalLine.id",
    )


class JournalLine(Base):
    __tablename__ = "bb_journal_lines"

    id = Column(Integer, primary_key=True)
    entry_id = Column(Integer, ForeignKey("bb_journal_entries.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("bb_accounts.id"), nullable=False, index=True)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    description = Column(String, nullable=True)

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("BBAccount")


class BBExpense(Base):
    __tablename__ = "bb_expenses"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    expense_date = Column(Date, nullable=False)
    account_id = Column(Integer, ForeignKey("bb_accounts.id"), nullable=False)
    supplier = Column(String, nullable=True)
    description = Column(String, nullable=True)
    amount = Column(Float, nullable=False)  # net of VAT
    vat_amount = Column(Float, default=0.0)  # input VAT on the supplier invoice
    wht_amount = Column(Float, default=0.0)  # WHT the vendor withheld from the supplier
    total = Column(Float, nullable=False)  # amount + vat
    paid_via = Column(String, default="bank")  # bank | cash | payable
    status = Column(String, default="paid")  # paid | unpaid
    paid_at = Column(Date, nullable=True)
    receipt_url = Column(String, nullable=True)
    journal_entry_id = Column(Integer, ForeignKey("bb_journal_entries.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("BBAccount")


class TaxReturn(Base):
    __tablename__ = "bb_tax_returns"
    __table_args__ = (
        UniqueConstraint("vendor_id", "tax_type", "period_start", name="uq_bb_tax_return_period"),
    )

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    tax_type = Column(String, nullable=False)  # vat | wht | cit
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    figures = Column(JSON, nullable=True)
    amount_payable = Column(Float, default=0.0)
    status = Column(String, default="draft")  # draft | ready | filed
    pdf_url = Column(String, nullable=True)
    csv_url = Column(String, nullable=True)
    filing_provider = Column(String, default="manual")  # manual (TaxPro-Max) | future API partner
    filing_reference = Column(String, nullable=True)
    receipt_url = Column(String, nullable=True)
    filed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VendorFile(Base):
    __tablename__ = "bb_files"

    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    folder = Column(String, nullable=False, default="General")
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    storage_backend = Column(String, default="local")  # local | supabase
    storage_path = Column(String, nullable=True)
    mime = Column(String, nullable=True)
    size = Column(Integer, default=0)
    source_type = Column(String, nullable=True)  # upload | kyc | invoice | quote | expense | tax_return
    source_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
