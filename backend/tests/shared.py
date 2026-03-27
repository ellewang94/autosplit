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
from auth import get_current_user_id


# ── Test user ID ──────────────────────────────────────────────────────────────
# All test groups and trips are created under this fake user ID.
# It's a fixed UUID-like string so tests can create groups with owner_id set
# to this value and the auth check will pass.
TEST_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"


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


def override_get_current_user_id():
    """
    Auth override for tests — skip JWT verification entirely.
    Returns a fixed fake user ID so all auth checks pass without a real token.
    """
    return TEST_USER_ID


# Apply both overrides ONCE here.
# The database override swaps in-memory SQLite for the real DB.
# The auth override bypasses JWT validation so tests don't need real tokens.
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user_id] = override_get_current_user_id

# Shared HTTP test client — uses the app with the overridden DB and auth.
client = TestClient(app)
