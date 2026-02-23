"""
Database connection setup for AutoSplit.

We're using SQLite — a lightweight file-based database that lives in a
single file (autosplit.db) right in the backend folder. No server needed.
SQLAlchemy is the "translator" between our Python code and the database.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.models import Base

# Use an absolute path so the DB file is always in the backend/ directory
# regardless of which directory the Python process was started from.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_BACKEND_DIR}/autosplit.db")

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
