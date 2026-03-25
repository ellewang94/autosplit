"""
Tests for the manual expense entry flow and single-transaction CRUD.

Manual expenses are the "no statement" path: a user types in an expense directly
instead of uploading a PDF/CSV. Internally, we store these in a "virtual" Statement
container whose source_hash is "manual:{group_id}:{member_id}".

What we test here:
1. A manually-entered expense is saved to the DB and returned correctly
2. The virtual statement is reused (not duplicated) on subsequent manual entries
3. Duplicate manual entries are detected and rejected
4. The is_manual flag in the statement list API correctly identifies virtual stmts
5. Single transaction update (PUT /transactions/{id}) edits the stored fields
6. Delete transaction (DELETE /transactions/{id}) removes it permanently
7. Currency conversion: entering ¥5,000 at rate 0.0067 → $33.50 stored

We use FastAPI's TestClient with an in-memory DB so no file system is touched.
"""

import pytest

# Shared test DB and HTTP client — see tests/shared.py for the setup details.
# The autouse `reset_database` fixture in conftest.py handles table creation/teardown.
from shared import client, TestSessionLocal
from models.models import Group, Member, Statement, Transaction


# ── Test setup ────────────────────────────────────────────────────────────────


@pytest.fixture
def group_with_members():
    """
    Create a group with 3 members. Returns the IDs we need in tests.
    The group has a base_currency of USD and no trip dates.
    """
    db = TestSessionLocal()
    try:
        group = Group(name="Japan Trip 2026", base_currency="USD")
        db.add(group)
        db.flush()

        alice = Member(group_id=group.id, name="Alice")
        bob   = Member(group_id=group.id, name="Bob")
        carol = Member(group_id=group.id, name="Carol")
        db.add_all([alice, bob, carol])
        db.commit()

        return {
            "group_id": group.id,
            "alice_id": alice.id,
            "bob_id": bob.id,
            "carol_id": carol.id,
        }
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Manual Expense Creation
# ═══════════════════════════════════════════════════════════════════════════════

class TestManualExpenseCreation:

    def test_creates_transaction_successfully(self, group_with_members):
        """A valid manual expense should create a transaction and return its ID."""
        gid = group_with_members["group_id"]
        resp = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Dinner at Nobu",
            "amount": 124.50,
            "paid_by_member_id": group_with_members["alice_id"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "transaction_id" in data
        assert data["transaction_id"] > 0

    def test_transaction_stored_correctly(self, group_with_members):
        """After creation, the transaction should be retrievable with the right values."""
        gid = group_with_members["group_id"]
        client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Dinner at Nobu",
            "amount": 124.50,
            "paid_by_member_id": group_with_members["alice_id"],
        })

        # Pull the full transaction list and find our entry
        txns_resp = client.get(f"/api/groups/{gid}/transactions")
        assert txns_resp.status_code == 200
        txns = txns_resp.json()

        nobu = next((t for t in txns if "Nobu" in t["description_raw"]), None)
        assert nobu is not None
        assert nobu["amount"] == 124.50
        assert nobu["posted_date"] == "2026-01-15"
        assert nobu["status"] == "confirmed"  # manual entries start as confirmed

    def test_virtual_statement_reused_for_same_payer(self, group_with_members):
        """
        The second manual expense from the same payer should reuse the same
        virtual Statement — not create a new one.
        """
        gid = group_with_members["group_id"]
        alice_id = group_with_members["alice_id"]

        # First expense
        r1 = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Breakfast",
            "amount": 25.00,
            "paid_by_member_id": alice_id,
        })
        # Second expense — same payer
        r2 = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-16",
            "description": "Lunch",
            "amount": 40.00,
            "paid_by_member_id": alice_id,
        })

        assert r1.status_code == 200
        assert r2.status_code == 200
        # Both should share the same statement_id
        assert r1.json()["statement_id"] == r2.json()["statement_id"]

    def test_different_payers_get_separate_virtual_statements(self, group_with_members):
        """
        Alice and Bob each paying creates two separate virtual statements —
        one per payer. This lets the settlement logic credit each person correctly.
        """
        gid = group_with_members["group_id"]

        r_alice = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Alice paid for groceries",
            "amount": 50.00,
            "paid_by_member_id": group_with_members["alice_id"],
        })
        r_bob = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-16",
            "description": "Bob paid for taxis",
            "amount": 30.00,
            "paid_by_member_id": group_with_members["bob_id"],
        })

        assert r_alice.status_code == 200
        assert r_bob.status_code == 200
        # Different payers → different virtual statements
        assert r_alice.json()["statement_id"] != r_bob.json()["statement_id"]

    def test_duplicate_entry_rejected(self, group_with_members):
        """
        Submitting the exact same expense twice returns the existing transaction ID
        instead of creating a duplicate. The message says "already exists".
        """
        gid = group_with_members["group_id"]
        payload = {
            "posted_date": "2026-01-15",
            "description": "Sushi dinner",
            "amount": 85.00,
            "paid_by_member_id": group_with_members["alice_id"],
        }
        r1 = client.post(f"/api/groups/{gid}/transactions/manual", json=payload)
        r2 = client.post(f"/api/groups/{gid}/transactions/manual", json=payload)

        assert r1.json()["transaction_id"] == r2.json()["transaction_id"]
        assert "already exists" in r2.json()["message"]

    def test_auto_categorization_applied(self, group_with_members):
        """
        If no category is provided, the backend auto-categorizes from the description.
        'Netflix' should auto-categorize as 'subscriptions'.
        """
        gid = group_with_members["group_id"]
        client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Netflix monthly",
            "amount": 15.99,
            "paid_by_member_id": group_with_members["alice_id"],
        })
        txns = client.get(f"/api/groups/{gid}/transactions").json()
        netflix = next((t for t in txns if "Netflix" in t["description_raw"]), None)
        assert netflix is not None
        assert netflix["category"] == "subscriptions"

    def test_custom_category_respected(self, group_with_members):
        """If the user supplies a category, it should override auto-detection."""
        gid = group_with_members["group_id"]
        client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Something unknown",
            "amount": 42.00,
            "paid_by_member_id": group_with_members["alice_id"],
            "category": "entertainment",
        })
        txns = client.get(f"/api/groups/{gid}/transactions").json()
        txn = next((t for t in txns if "unknown" in t["description_raw"].lower()), None)
        assert txn is not None
        assert txn["category"] == "entertainment"


# ═══════════════════════════════════════════════════════════════════════════════
# Manual Expense — Multi-Currency
# ═══════════════════════════════════════════════════════════════════════════════

class TestManualExpenseCurrency:
    """
    The group's base_currency is USD. When a user enters ¥5,000 JPY with
    exchange_rate=0.0067, the stored amount should be $33.50 (USD equivalent)
    and original_amount should preserve the ¥5,000.
    """

    def test_jpy_converted_to_usd(self, group_with_members):
        gid = group_with_members["group_id"]
        resp = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Ramen shop",
            "amount": 5000,         # ¥5,000
            "currency": "JPY",
            "exchange_rate": 0.0067, # 1 JPY = 0.0067 USD
            "paid_by_member_id": group_with_members["alice_id"],
        })
        assert resp.status_code == 200

        txns = client.get(f"/api/groups/{gid}/transactions").json()
        ramen = next((t for t in txns if "Ramen" in t["description_raw"]), None)
        assert ramen is not None
        # Amount stored in USD (converted)
        assert abs(ramen["amount"] - 33.50) < 0.01
        # Original JPY amount preserved for display
        assert ramen["original_amount"] == 5000
        assert ramen["currency"] == "JPY"

    def test_same_currency_no_conversion(self, group_with_members):
        """
        Entering USD into a USD group should store the amount as-is.
        original_amount should be None (no conversion happened).
        """
        gid = group_with_members["group_id"]
        resp = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Coffee",
            "amount": 5.50,
            "currency": "USD",  # Same as group base currency
            "paid_by_member_id": group_with_members["alice_id"],
        })
        assert resp.status_code == 200

        txns = client.get(f"/api/groups/{gid}/transactions").json()
        coffee = next((t for t in txns if "Coffee" in t["description_raw"]), None)
        assert coffee is not None
        assert coffee["amount"] == 5.50
        assert coffee["original_amount"] is None  # No conversion needed


# ═══════════════════════════════════════════════════════════════════════════════
# Statement List — is_manual Flag
# ═══════════════════════════════════════════════════════════════════════════════

class TestIsManualFlag:
    """
    The statement list should distinguish between real uploaded statements
    and the virtual 'Manual Expenses' containers created for manual entries.

    The frontend uses is_manual=True to hide virtual statements from the
    "already imported" section and the settlement config UI.
    """

    def test_manual_statement_has_is_manual_true(self, group_with_members):
        gid = group_with_members["group_id"]
        # Create a manual expense → generates a virtual statement
        client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Taxi",
            "amount": 20.00,
            "paid_by_member_id": group_with_members["alice_id"],
        })

        stmts = client.get(f"/api/groups/{gid}/statements").json()
        manual_stmts = [s for s in stmts if s["is_manual"]]
        real_stmts   = [s for s in stmts if not s["is_manual"]]

        assert len(manual_stmts) == 1   # One virtual container (Alice's)
        assert len(real_stmts) == 0     # No real uploads in this test


# ═══════════════════════════════════════════════════════════════════════════════
# Single Transaction Update (PUT /transactions/{id})
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransactionUpdate:
    """
    Users should be able to fix parsing errors on any transaction:
    wrong amount, wrong date, wrong description.
    Only the fields sent in the request should change — others stay the same.
    """

    @pytest.fixture
    def transaction(self, group_with_members):
        """Create a manual expense and return its transaction data."""
        gid = group_with_members["group_id"]
        r = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Wrong amount expense",
            "amount": 100.00,
            "paid_by_member_id": group_with_members["alice_id"],
        })
        txn_id = r.json()["transaction_id"]
        txns = client.get(f"/api/groups/{gid}/transactions").json()
        return next(t for t in txns if t["id"] == txn_id)

    def test_update_amount(self, transaction):
        """Fix a wrong amount."""
        txn_id = transaction["id"]
        resp = client.put(f"/api/transactions/{txn_id}", json={"amount": 50.00})
        assert resp.status_code == 200
        assert resp.json()["amount"] == 50.00

    def test_update_description(self, transaction):
        """Fix a wrong merchant name."""
        txn_id = transaction["id"]
        resp = client.put(f"/api/transactions/{txn_id}", json={"description_raw": "Corrected description"})
        assert resp.status_code == 200
        assert resp.json()["description_raw"] == "Corrected description"

    def test_update_date(self, transaction):
        """Fix a wrong date."""
        txn_id = transaction["id"]
        resp = client.put(f"/api/transactions/{txn_id}", json={"posted_date": "2026-01-20"})
        assert resp.status_code == 200
        assert resp.json()["posted_date"] == "2026-01-20"

    def test_update_category(self, transaction):
        """Change the category without touching anything else."""
        txn_id = transaction["id"]
        original_amount = transaction["amount"]

        resp = client.put(f"/api/transactions/{txn_id}", json={"category": "travel"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["category"] == "travel"
        # Amount should be untouched
        assert data["amount"] == original_amount

    def test_partial_update_leaves_other_fields(self, transaction):
        """
        A key behavior: only the sent field should change.
        Everything else — amount, date, status, participants — must stay the same.
        """
        txn_id = transaction["id"]
        original = transaction

        # Update only description
        client.put(f"/api/transactions/{txn_id}", json={"description_raw": "New description"})

        # Re-fetch and verify
        txns_resp = client.get(f"/api/groups/{original['statement_id']}/statements")  # not ideal, but:
        # Simpler: re-fetch via update endpoint (it returns the updated transaction)
        resp = client.put(f"/api/transactions/{txn_id}", json={"description_raw": "New description"})
        data = resp.json()

        # Core fields should be intact
        assert data["amount"] == original["amount"]
        assert data["posted_date"] == original["posted_date"]
        assert data["status"] == original["status"]

    def test_update_nonexistent_transaction_returns_404(self, group_with_members):
        resp = client.put("/api/transactions/99999", json={"amount": 50.00})
        assert resp.status_code == 404

    def test_overrides_json_logs_changes(self, transaction):
        """
        The overrides_json field should track what was changed (old → new values).
        This creates an audit trail — useful for debugging and transparency.
        """
        txn_id = transaction["id"]
        resp = client.put(f"/api/transactions/{txn_id}", json={"amount": 75.00})
        assert resp.status_code == 200
        overrides = resp.json().get("overrides_json", {})
        # The amount change should be logged
        assert "amount" in overrides
        assert overrides["amount"]["new"] == 75.00


# ═══════════════════════════════════════════════════════════════════════════════
# Delete Transaction (DELETE /transactions/{id})
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransactionDelete:
    """
    Users should be able to permanently delete a transaction.
    This is a hard delete — the row is removed from the DB entirely.
    Settlement recalculates correctly after deletion.
    """

    @pytest.fixture
    def transaction(self, group_with_members):
        gid = group_with_members["group_id"]
        r = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "To be deleted",
            "amount": 50.00,
            "paid_by_member_id": group_with_members["alice_id"],
        })
        return {"id": r.json()["transaction_id"], "group_id": gid}

    def test_delete_returns_ok(self, transaction):
        resp = client.delete(f"/api/transactions/{transaction['id']}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_transaction_gone_after_delete(self, transaction):
        """The transaction should no longer appear in the group's transaction list."""
        txn_id = transaction["id"]
        gid = transaction["group_id"]

        client.delete(f"/api/transactions/{txn_id}")

        txns = client.get(f"/api/groups/{gid}/transactions").json()
        ids = [t["id"] for t in txns]
        assert txn_id not in ids

    def test_delete_nonexistent_returns_404(self, group_with_members):
        resp = client.delete("/api/transactions/99999")
        assert resp.status_code == 404

    def test_settlement_recalculates_after_delete(self, group_with_members):
        """
        Create two expenses, delete one, then run settlement.
        Only the remaining expense should count.
        """
        gid = group_with_members["group_id"]
        alice_id = group_with_members["alice_id"]
        bob_id   = group_with_members["bob_id"]

        # Expense 1: $100 shared between Alice and Bob (Alice paid)
        r1 = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-15",
            "description": "Dinner shared",
            "amount": 100.00,
            "paid_by_member_id": alice_id,
            "participants_json": {"type": "all", "member_ids": [alice_id, bob_id]},
        })
        # Expense 2: $200 shared between Alice and Bob (Alice paid) — we'll delete this one
        r2 = client.post(f"/api/groups/{gid}/transactions/manual", json={
            "posted_date": "2026-01-16",
            "description": "Expensive dinner to delete",
            "amount": 200.00,
            "paid_by_member_id": alice_id,
            "participants_json": {"type": "all", "member_ids": [alice_id, bob_id]},
        })

        # Delete the second expense
        client.delete(f"/api/transactions/{r2.json()['transaction_id']}")

        # Settle — only the $100 expense should count
        settle = client.post(f"/api/groups/{gid}/settlement", json={
            "payer_member_id": alice_id
        }).json()

        # $100 split 2 ways → Bob owes Alice $50, total shared = $100
        assert settle["total_shared_expenses"] == pytest.approx(100.0, abs=0.01)
