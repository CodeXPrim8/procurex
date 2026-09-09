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



