"""
Shared test configuration — pytest auto-loads this before any test in this directory.

The actual database engine and client are defined in shared.py. We add the tests/
directory to sys.path here so that conftest.py and all test files can import from
shared.py with a plain `from shared import ...` statement.
"""

import sys, os
# Make the tests/ directory importable so `from shared import ...` works everywhere
sys.path.insert(0, os.path.dirname(__file__))

import pytest
from shared import engine
from models.models import Base


# ── Autouse fixture: clean slate for every test ───────────────────────────────
# `autouse=True` means pytest runs this for EVERY test in the tests/ directory,
# not just tests that explicitly request it as a parameter.

@pytest.fixture(autouse=True)
def reset_database():
    """
    Create all tables before each test, drop them after.

    This guarantees full isolation: test A cannot leave dirty state that
    causes test B to fail. The cost is a tiny table-creation overhead per
    test, which is negligible for SQLite in-memory databases.
    """
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
