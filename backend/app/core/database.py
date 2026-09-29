from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import QueuePool
from .config import settings

# Handle SQLite database URL
database_url = settings.DATABASE_URL
if database_url.startswith("sqlite"):
    engine = create_engine(
        database_url, 
        connect_args={"check_same_thread": False}, 
        pool_pre_ping=True,
        poolclass=QueuePool,
        pool_size=10,  # Maximum number of connections
        max_overflow=20,  # Additional connections beyond pool_size
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_timeout=30  # Timeout for getting connection from pool
    )
else:
    engine = create_engine(
        database_url, 
        pool_pre_ping=True,
        poolclass=QueuePool,
        pool_size=10,  # Maximum number of connections
        max_overflow=20,  # Additional connections beyond pool_size
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_timeout=30,  # Timeout for getting connection from pool
        echo=False  # Set to True for SQL query logging
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_sqlite_schema() -> None:
    """Add columns that create_all() will not add to an existing SQLite database."""
    if not str(settings.DATABASE_URL).startswith("sqlite"):
        return

    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    with engine.begin() as connection:
        if "vendors" in table_names:
            existing = {column["name"] for column in inspector.get_columns("vendors")}
            additions = {
                "personal_name": "VARCHAR",
                "id_type": "VARCHAR",
                "id_number": "VARCHAR",
                "id_document_url": "VARCHAR",
                "business_address": "TEXT",
                "address_verification_bill_url": "VARCHAR",
                "company_certificate_url": "VARCHAR",
                "verification_notes": "TEXT",
                "phone": "VARCHAR",
                "address": "TEXT",
                "domain": "VARCHAR",
                "business_registration_number": "VARCHAR",
                "terms_accepted_at": "DATETIME",
                "submitted_at": "DATETIME",
                "reviewed_at": "DATETIME",
                "reviewed_by": "VARCHAR",
                "verification_revoked_at": "DATETIME",
                "tin": "VARCHAR",
                "vat_certificate_url": "VARCHAR",
                "tax_clearance_url": "VARCHAR",
                "tax_clearance_expires_at": "DATETIME",
                "vat_status": "VARCHAR",
                "vat_review_notes": "TEXT",
                "vat_reviewed_at": "DATETIME",
                "vat_reviewed_by": "VARCHAR",
                "country": "VARCHAR",
            }
            for name, column_type in additions.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE vendors ADD COLUMN {name} {column_type}"))
            connection.execute(text(
                "UPDATE vendors SET vat_status = 'none' WHERE vat_status IS NULL OR TRIM(vat_status) = ''"
            ))
            connection.execute(text(
                "UPDATE vendors SET country = 'NG' WHERE country IS NULL OR TRIM(country) = ''"
            ))

        if "users" in table_names:
            existing_users = {column["name"] for column in inspector.get_columns("users")}
            for name in ("country", "preferred_currency"):
                if name not in existing_users:
                    connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} VARCHAR"))

        if "products" in table_names:
            existing_products = {column["name"] for column in inspector.get_columns("products")}
            if "image_urls" not in existing_products:
                connection.execute(text("ALTER TABLE products ADD COLUMN image_urls JSON"))

        if "vendor_products" in table_names:
            existing_listings = {column["name"] for column in inspector.get_columns("vendor_products")}
            listing_additions = {
                "admin_assessment": "VARCHAR",
                "admin_assessment_notes": "TEXT",
                "admin_assessed_at": "DATETIME",
                "admin_assessed_by": "VARCHAR",
                "unit_cost": "FLOAT",
                "price_mode": "VARCHAR",
                "delivery_mode": "VARCHAR",
            }
            for name, column_type in listing_additions.items():
                if name not in existing_listings:
                    connection.execute(text(f"ALTER TABLE vendor_products ADD COLUMN {name} {column_type}"))
            connection.execute(text(
                """
                UPDATE vendor_products
                SET admin_assessment = 'pending'
                WHERE admin_assessment IS NULL OR TRIM(admin_assessment) = ''
                """
            ))
            connection.execute(text(
                """
                UPDATE vendor_products
                SET price_mode = 'fixed'
                WHERE price_mode IS NULL OR TRIM(price_mode) = ''
                """
            ))
            if "products" in table_names:
                connection.execute(text(
                    """
                    UPDATE vendor_products
                    SET delivery_mode = 'remote'
                    WHERE delivery_mode IS NULL
                      AND product_id IN (
                        SELECT id FROM products
                        WHERE sku IN ('PX-SV-WEB-SITE', 'PX-SV-APP-MOBILE', 'PX-SV-SOFT-CUSTOM')
                      )
                    """
                ))

        if "quotations" in table_names:
            existing_quotes = {column["name"] for column in inspector.get_columns("quotations")}
            quote_additions = {
                "business_id": "INTEGER",
                "client_id": "INTEGER",
                "request_id": "INTEGER",
                "recipient_emails": "JSON",
                "cc_emails": "JSON",
                "template_kind": "VARCHAR",
                "profit_percent": "NUMERIC",
                "document_kind": "VARCHAR",
                "paid_at": "DATETIME",
                "source_number": "VARCHAR",
                "vat_percent": "NUMERIC",
                "valid_days": "INTEGER",
            }
            for name, column_type in quote_additions.items():
                if name not in existing_quotes:
                    connection.execute(text(f"ALTER TABLE quotations ADD COLUMN {name} {column_type}"))
            connection.execute(text(
                "UPDATE quotations SET document_kind = 'quote' WHERE document_kind IS NULL OR TRIM(document_kind) = ''"
            ))

        if "chat_sessions" in table_names:
            existing_chats = {column["name"] for column in inspector.get_columns("chat_sessions")}
            if "business_id" not in existing_chats:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN business_id INTEGER"))

        if "quotation_items" in table_names:
            existing_items = {column["name"] for column in inspector.get_columns("quotation_items")}
            for name, column_type in (("cost_price", "NUMERIC"), ("profit_percent", "NUMERIC"), ("vendor", "JSON")):
                if name not in existing_items:
                    connection.execute(text(f"ALTER TABLE quotation_items ADD COLUMN {name} {column_type}"))

        if "business_clients" in table_names:
            existing_clients = {column["name"] for column in inspector.get_columns("business_clients")}
            if "address" not in existing_clients:
                connection.execute(text("ALTER TABLE business_clients ADD COLUMN address TEXT"))

        if "buyer_businesses" in table_names:
            existing_biz = {column["name"] for column in inspector.get_columns("buyer_businesses")}
            if "vat_percent" not in existing_biz:
                connection.execute(text("ALTER TABLE buyer_businesses ADD COLUMN vat_percent NUMERIC"))

        if "vendors" in table_names and "vendor_products" in table_names:
            connection.execute(text(
                """
                UPDATE vendors
                SET verification_status = 'VERIFIED',
                    verification_notes = 'Grandfathered existing catalog seller. Upload identity documents when possible.'
                WHERE verification_status IN ('pending', 'PENDING', 'verified')
                  AND verification_notes IS NULL
                  AND id_document_url IS NULL
                  AND company_certificate_url IS NULL
                  AND address_verification_bill_url IS NULL
                  AND id IN (SELECT DISTINCT vendor_id FROM vendor_products)
                """
            ))
            connection.execute(text(
                """
                UPDATE vendors
                SET verification_status = 'VERIFIED'
                WHERE verification_status IN ('verified', 'Verified')
                """
            ))
            connection.execute(text(
                """
                UPDATE vendors
                SET verification_revoked_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP)
                WHERE verification_status IN ('REJECTED', 'rejected')
                  AND verification_revoked_at IS NULL
                  AND id IN (SELECT DISTINCT vendor_id FROM vendor_products)
                """
            ))



