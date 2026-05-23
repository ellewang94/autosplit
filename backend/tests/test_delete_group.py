"""
Regression test for DELETE /groups/{id} — deleting a trip must remove ALL of its
data, leaving no orphaned child rows behind.

WHY THIS TEST EXISTS
--------------------
The original delete endpoint relied solely on SQLAlchemy's ORM cascade, but the
Group model only cascaded three children: members, statements, merchant_rules.
Two other tables also point at a group and were NOT cascaded:
    - recurring_expenses
    - trip_shares
In production (PostgreSQL, which enforces foreign keys) that made the whole
delete fail with a 500, because the group row was still referenced by those
tables. In the test suite (SQLite, which ignores foreign keys by default) the
same bug surfaces a different way: the delete "succeeds" but leaves orphaned
rows in recurring_expenses and trip_shares.

Rather than depend on which database we're on, we assert the invariant that
matters in both: after deleting a trip, NO rows for that group remain anywhere.
"""

import pytest

# Shared in-memory test DB + HTTP client (see tests/shared.py).
from shared import client, TestSessionLocal
from models.models import (
    Group, Member, Statement, Transaction, RecurringExpense, TripShare,
)


@pytest.fixture
def trip_with_all_child_data():
    """
    Build a trip that touches every table referencing a group:
      - a member
      - a recurring-expense template   (NOT cascaded by the old code)
      - a shareable link               (NOT cascaded by the old code — the real culprit)
      - a manual expense               (statement + transaction; ARE cascaded — regression guard)

    Returns a dict with the group id and the statement ids created, so the test
    can confirm afterwards that none of them survive the delete.
    """
    db = TestSessionLocal()
    try:
        group = Group(name="Mexico", base_currency="USD")
        db.add(group)
        db.flush()  # assigns group.id without committing

        member = Member(group_id=group.id, name="Elle")
        db.add(member)
        db.flush()

        # Recurring template — referenced groups.id, but not in the old cascade.
        db.add(RecurringExpense(
            group_id=group.id,
            name="Airbnb",
            amount=200.0,
            paid_by_member_id=member.id,
            start_date="2026-05-23",
        ))
        # Share link — the table that most often blocked the delete in production.
        db.add(TripShare(
            group_id=group.id,
            share_code="test-share-code-123",
            created_by="test-user",
        ))
        db.commit()
        gid, mid = group.id, member.id
    finally:
        db.close()

    # Add a manual expense through the real API so a statement + transaction exist.
    resp = client.post(f"/api/groups/{gid}/transactions/manual", json={
        "posted_date": "2026-05-24",
        "description": "Casa Tortillas dinner",
        "amount": 100.0,
        "paid_by_member_id": mid,
    })
    assert resp.status_code == 200, resp.text

    # Capture the statement id(s) created for this group so we can prove the
    # transactions under them are gone after the delete.
    db = TestSessionLocal()
    try:
        stmt_ids = [s.id for s in db.query(Statement).filter_by(group_id=gid).all()]
    finally:
        db.close()
    assert stmt_ids, "expected a virtual statement to be created for the manual expense"

    return {"group_id": gid, "statement_ids": stmt_ids}


def test_delete_trip_removes_all_child_data(trip_with_all_child_data):
    """Deleting a trip must succeed AND leave zero rows across every child table."""
    gid = trip_with_all_child_data["group_id"]
    stmt_ids = trip_with_all_child_data["statement_ids"]

    resp = client.delete(f"/api/groups/{gid}")
    assert resp.status_code == 200, resp.text

    db = TestSessionLocal()
    try:
        # The trip itself is gone.
        assert db.query(Group).filter_by(id=gid).count() == 0
        # Children that the old cascade already handled.
        assert db.query(Member).filter_by(group_id=gid).count() == 0
        assert db.query(Statement).filter_by(group_id=gid).count() == 0
        assert db.query(Transaction).filter(
            Transaction.statement_id.in_(stmt_ids)
        ).count() == 0
        # Children the old cascade MISSED — these are the regression we are guarding.
        assert db.query(RecurringExpense).filter_by(group_id=gid).count() == 0, \
            "recurring_expenses left orphaned after trip delete"
        assert db.query(TripShare).filter_by(group_id=gid).count() == 0, \
            "trip_shares left orphaned after trip delete"
    finally:
        db.close()
