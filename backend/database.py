"""
Database connection setup for AutoSplit.

We're using SQLite — a lightweight file-based database that lives in a
single file (autosplit.db) right in the backend folder. No server needed.
SQLAlchemy is the "translator" between our Python code and the database.
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models.models import Base

# Use an absolute path so the DB file is always in the backend/ directory
# regardless of which directory the Python process was started from.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_BACKEND_DIR}/autosplit.db")

# ── Database connection setup ──────────────────────────────────────────────────
# We support two database backends:
#   - SQLite: the default for local development (no setup needed)
#   - PostgreSQL: used in production via Supabase (set DATABASE_URL env var)
#
# The connection arguments differ slightly between the two databases.
# SQLite needs check_same_thread=False; PostgreSQL doesn't need this but
# benefits from a connection pool (handled automatically by SQLAlchemy).

_IS_POSTGRES = DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")

if _IS_POSTGRES:
    # PostgreSQL: use connection pooling for better performance under load.
    # pool_pre_ping=True: check if connections are alive before using them —
    # prevents errors after Supabase closes idle connections.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False,
    )
else:
    # SQLite: check_same_thread=False is required for FastAPI's async behavior.
    # check_same_thread=False is required for SQLite when used with FastAPI
    # (FastAPI runs async, SQLite's default setting is too strict for that)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,  # Set to True to see SQL queries in logs (useful for debugging)
    )

# SessionLocal is a factory for creating database sessions.
# Think of a session like a shopping cart — you collect changes, then "commit" them all at once.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """
    FastAPI dependency that provides a database session to each request.
    Uses a try/finally to always close the session, even if something crashes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables if they don't exist yet."""
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """
    Add new columns to existing tables without destroying existing data.

    This is called at startup. SQLite doesn't support full ALTER TABLE the way
    Postgres does, but it does support ADD COLUMN. We wrap each in try/except so
    running this multiple times is safe — it just ignores "column already exists" errors.

    Think of this like patching a house: you can add a new room without tearing down
    the whole building and rebuilding it from scratch.
    """
    with engine.connect() as conn:
        # Columns to add: (table_name, column_name, column_definition)
        new_columns = [
            # Groups table — settlement currency for the whole trip
            ("groups", "base_currency", "VARCHAR DEFAULT 'USD' NOT NULL"),
            # Groups table — cloud auth: which user owns this trip
            ("groups", "owner_id", "VARCHAR"),  # Supabase UUID; nullable for legacy local groups
            # Groups table — invite link token for collaborative access
            ("groups",  "invite_code", "VARCHAR UNIQUE"),
            # Members table — links a member slot to a specific AutoSplit user account
            ("members", "user_id",     "VARCHAR"),
            # Transactions table — multi-currency support
            ("transactions", "currency",         "VARCHAR DEFAULT 'USD' NOT NULL"),
            ("transactions", "original_amount",  "FLOAT"),  # nullable, null = same as base
        ]

        for table, column, definition in new_columns:
            try:
                # text() wraps raw SQL strings — SQLAlchemy requires this for security
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                conn.commit()
            except Exception:
                # Most likely error: "duplicate column name" — totally fine, just skip it
                conn.rollback()

        # Create the trip_shares table if it doesn't exist yet.
        # We can't use ALTER TABLE for a whole new table, so we use CREATE TABLE IF NOT EXISTS.
        # This is safe to run every startup — the IF NOT EXISTS clause prevents duplicates.
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS trip_shares (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    share_code VARCHAR UNIQUE NOT NULL,
                    group_id INTEGER NOT NULL REFERENCES groups(id),
                    created_by VARCHAR NOT NULL,
                    payer_member_id INTEGER,
                    created_at DATETIME,
                    view_count INTEGER NOT NULL DEFAULT 0
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_trip_shares_share_code ON trip_shares(share_code)"))
            conn.commit()
        except Exception:
            conn.rollback()
