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
            }
            for name, column_type in additions.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE vendors ADD COLUMN {name} {column_type}"))

        if "products" in table_names:
            existing_products = {column["name"] for column in inspector.get_columns("products")}
            if "image_urls" not in existing_products:
                connection.execute(text("ALTER TABLE products ADD COLUMN image_urls JSON"))



