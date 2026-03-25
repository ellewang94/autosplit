"""
Shared test database setup — imported by both conftest.py and individual test files.

This file exists because pytest's conftest.py cannot be imported as a regular
Python module (it's loaded by pytest's internal machinery, not sys.path). So we
put the shared engine and session factory HERE, and both conftest.py and the test
files import from here.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from main import app
from database import get_db


# Shared in-memory SQLite engine for all tests.
# StaticPool: every session reuses the same underlying connection so data
# seeded in a test is visible to the HTTP request handler's session.
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Dependency override: swap the real DB for the in-memory test DB."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Apply override ONCE here — both conftest.py and test files import this module,
# but Python caches module imports so the override is only applied once.
app.dependency_overrides[get_db] = override_get_db

# Shared HTTP test client — uses the app with the overridden DB.
client = TestClient(app)
