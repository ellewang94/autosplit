"""
Tests for the bulk transaction update endpoint.

We use FastAPI's TestClient with an in-memory SQLite database so tests
are isolated — each test gets a clean slate and never touches the real DB.

What we're testing:
1. Bulk category update only affects the selected transaction IDs
2. Bulk status="excluded" causes settlement to skip those transactions
3. Partial update (only participants_json) leaves category/status untouched
4. Wrong group ID → no updates (security check)
"""

import pytest

# Shared test database and client — see tests/shared.py for the setup details.
# The autouse `reset_database` fixture in conftest.py handles table creation/teardown.
from shared import client, TestSessionLocal
from models.models import Group, Member, Statement, Transaction


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def test_data():
    """
    Build a group with 2 members and 5 transactions in the test database.
    Returns a dict of IDs needed by the tests.
    """
    db = TestSessionLocal()
    try:
        # Create group (no trip dates — plain shared expense setup)
        group = Group(name="Test Group", start_date=None, end_date=None)
        db.add(group)
        db.flush()

        # Two members
        alice = Member(group_id=group.id, name="Alice")
        bob = Member(group_id=group.id, name="Bob")
        db.add_all([alice, bob])
        db.flush()

        # One statement (needed as a parent for transactions)
        stmt = Statement(
            group_id=group.id,
            source_hash="test_hash_bulk",
            statement_date="2026-01-15",
            period_start="2026-01-01",
            period_end="2026-01-31",
            card_holder_member_id=alice.id,
        )
        db.add(stmt)
        db.flush()

        # 5 transactions — all start with category="other", status="unreviewed"
        txns = []
        for i in range(5):
            txn = Transaction(
                statement_id=stmt.id,
                posted_date=f"2026-01-0{i + 1}",
                description_raw=f"MERCHANT {i + 1}",
                amount=float((i + 1) * 10),       # $10, $20, $30, $40, $50
                txn_type="purchase",
                category="other",                  # default category
                is_personal=False,
                participants_json={"type": "all", "member_ids": [alice.id, bob.id]},
                split_method_json={"type": "equal"},
                overrides_json={},
                parse_confidence=1.0,
                txn_hash=f"bulk_test_hash_{i}",
                status="unreviewed",               # default status
            )
            db.add(txn)
            txns.append(txn)

        db.commit()

        return {
            "group_id": group.id,
            "alice_id": alice.id,
            "bob_id": bob.id,
            "stmt_id": stmt.id,
            "txn_ids": [t.id for t in txns],
        }
    finally:
        db.close()


# ── Tests ────────────────────────────────────────────────────────────────────

class TestBulkCategoryUpdate:
    def test_only_selected_transactions_are_updated(self, test_data):
        """
        Bulk-update the first 3 transactions with category="dining".
        The last 2 should still have category="other".
        """
        group_id = test_data["group_id"]
        all_ids = test_data["txn_ids"]
        update_ids = all_ids[:3]   # first 3 → "dining"
        keep_ids = all_ids[3:]     # last 2 → still "other"

        resp = client.put(
            f"/api/groups/{group_id}/transactions/bulk-update",
            json={"transaction_ids": update_ids, "category": "dining"},
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 3

        # Confirm the updated 3 changed
        db = TestSessionLocal()
        try:
            for tid in update_ids:
                txn = db.query(Transaction).filter_by(id=tid).first()
                assert txn.category == "dining", f"Transaction {tid} should be 'dining'"

            # Confirm the untouched 2 stayed the same
            for tid in keep_ids:
                txn = db.query(Transaction).filter_by(id=tid).first()
                assert txn.category == "other", f"Transaction {tid} should still be 'other'"
        finally:
            db.close()


class TestBulkStatusExcluded:
    def test_excluded_transactions_are_skipped_by_settlement(self, test_data):
        """
        Bulk-update all 5 transactions to status="excluded".
        Settlement should compute $0 total (nothing shared).
        """
        group_id = test_data["group_id"]
        all_ids = test_data["txn_ids"]

        # Exclude everything
        resp = client.put(
            f"/api/groups/{group_id}/transactions/bulk-update",
            json={"transaction_ids": all_ids, "status": "excluded"},
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 5

        # Settlement should now show $0 because all transactions are excluded
        settle_resp = client.post(
            f"/api/groups/{group_id}/settlement",
            json={"payer_member_id": test_data["alice_id"]},
        )
        assert settle_resp.status_code == 200
        data = settle_resp.json()
        assert data["total_shared_expenses"] == 0.0, \
            "All excluded → settlement should be $0"

    def test_confirmed_transactions_are_included_in_settlement(self, test_data):
        """
        Confirmed transactions should count toward settlement normally.
        This ensures "confirmed" is just a label, not a filter.
        """
        group_id = test_data["group_id"]
        all_ids = test_data["txn_ids"]

        # Mark all as "confirmed"
        resp = client.put(
            f"/api/groups/{group_id}/transactions/bulk-update",
            json={"transaction_ids": all_ids, "status": "confirmed"},
        )
        assert resp.status_code == 200

        # Settlement should include all of them (not zero)
        settle_resp = client.post(
            f"/api/groups/{group_id}/settlement",
            json={"payer_member_id": test_data["alice_id"]},
        )
        assert settle_resp.status_code == 200
        data = settle_resp.json()
        # $10+$20+$30+$40+$50 = $150 total
        assert data["total_shared_expenses"] == pytest.approx(150.0, abs=0.01), \
            "Confirmed transactions should all be included in settlement"


class TestBulkPartialUpdate:
    def test_only_participants_updated_category_untouched(self, test_data):
        """
        Bulk-update only participants_json — category and status must not change.
        This tests the "only apply non-None fields" behavior.
        """
        group_id = test_data["group_id"]
        update_ids = test_data["txn_ids"][:3]

        resp = client.put(
            f"/api/groups/{group_id}/transactions/bulk-update",
            json={
                "transaction_ids": update_ids,
                "participants_json": {
                    "type": "custom",
                    "member_ids": [test_data["alice_id"]],  # Just Alice now
                },
                # category and status intentionally omitted
            },
        )
        assert resp.status_code == 200

        db = TestSessionLocal()
        try:
            for tid in update_ids:
                txn = db.query(Transaction).filter_by(id=tid).first()
                # Participants should be updated
                assert txn.participants_json["member_ids"] == [test_data["alice_id"]], \
                    "Participants should be updated"
                # Category should not have changed
                assert txn.category == "other", \
                    "Category should be untouched when not included in bulk update"
                # Status should not have changed
                assert txn.status == "unreviewed", \
                    "Status should be untouched when not included in bulk update"
        finally:
            db.close()


class TestBulkSecurityCheck:
    def test_wrong_group_id_updates_nothing(self, test_data):
        """
        Calling bulk-update for a different group_id should not update any transactions.
        The endpoint verifies ownership before applying any changes.
        """
        correct_group_id = test_data["group_id"]
        wrong_group_id = correct_group_id + 9999  # A group that doesn't own these transactions

        resp = client.put(
            f"/api/groups/{wrong_group_id}/transactions/bulk-update",
            json={
                "transaction_ids": test_data["txn_ids"],
                "category": "hacked",
            },
        )
        # After auth was added, _require_group returns 404 for non-existent groups.
        # This is stricter than the old behavior (which returned 200 + 0 updates)
        # but is the correct, safe behavior — don't reveal that the group doesn't exist.
        assert resp.status_code == 404

        # The actual transactions in the correct group should be unchanged
        db = TestSessionLocal()
        try:
            for tid in test_data["txn_ids"]:
                txn = db.query(Transaction).filter_by(id=tid).first()
                assert txn.category == "other", \
                    "Transaction should NOT have been updated by a wrong-group request"
        finally:
            db.close()
