"""
Tests for multi-payer settlement.

On a group trip, multiple people put shared expenses on their own credit cards.
- Alice's card → Alice should be credited for everything she charged
- Bob's card → Bob should be credited for everything he charged

We pass a `statement_payers` dict ({statement_id: member_id}) into
compute_net_balances so it knows who paid for each statement.

These are pure domain tests — no HTTP, no database, just math.
"""

import pytest
from unittest.mock import MagicMock
from domain.settlement import compute_net_balances, minimize_transfers


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_transaction(amount, participant_ids, statement_id=1, is_personal=False, split_method=None):
    """
    Create a mock transaction with a statement_id.
    The statement_id is what the multi-payer logic uses to look up who paid.
    """
    txn = MagicMock()
    txn.amount = amount
    txn.is_personal = is_personal
    txn.statement_id = statement_id
    txn.participants_json = {"type": "all", "member_ids": participant_ids}
    txn.split_method_json = split_method or {"type": "equal"}
    return txn


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestMultiPayerSettlement:
    """
    Scenario: Japan trip with two credit cards.

    Statement A (id=1): Alice's card — $300 transaction, split 3 ways
    Statement B (id=2): Bob's card   — $150 transaction, split 3 ways
    Members: Alice (1), Bob (2), Charlie (3)

    Math per transaction:
      Statement A: each member owes $100 (= $300 / 3)
        Alice credit: +$300 | Alice share: -$100 | net: +$200
        Bob share: -$100 | Charlie share: -$100

      Statement B: each member owes $50 (= $150 / 3)
        Bob credit: +$150 | Bob share: -$50 | net: +$100
        Alice share: -$50 | Charlie share: -$50

    Combined:
      Alice:   +$200 - $50 = +$150  (owed)
      Bob:     -$100 + $100 = $0    (even)
      Charlie: -$100 - $50 = -$150  (owes)
    """

    def setup_method(self):
        """Set up member and statement IDs used across all tests."""
        self.alice, self.bob, self.charlie = 1, 2, 3
        self.stmt_a, self.stmt_b = 1, 2
        self.all_members = [self.alice, self.bob, self.charlie]

        # This is the key feature being tested:
        # each statement maps to the member who held that card
        self.statement_payers = {
            self.stmt_a: self.alice,  # Alice's card paid for statement A
            self.stmt_b: self.bob,    # Bob's card paid for statement B
        }

    def test_correct_balances_with_two_cards(self):
        """
        The key test: Alice and Bob each get credited for their own card.
        Charlie owes both of them.
        """
        txns = [
            make_transaction(300.00, self.all_members, statement_id=self.stmt_a),
            make_transaction(150.00, self.all_members, statement_id=self.stmt_b),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,  # fallback (not used — both stmts have payers)
            all_member_ids=self.all_members,
            statement_payers=self.statement_payers,
        )

        assert balances[self.alice] == pytest.approx(150.0, abs=0.01), \
            "Alice paid $300, owes $150 of shared → net +$150"
        assert balances[self.bob] == pytest.approx(0.0, abs=0.01), \
            "Bob paid $150, owes $150 of shared → net $0"
        assert balances[self.charlie] == pytest.approx(-150.0, abs=0.01), \
            "Charlie paid nothing, owes $150 total → net -$150"

    def test_balances_sum_to_zero(self):
        """Conservation of money: the total of all balances must always be exactly zero."""
        txns = [
            make_transaction(300.00, self.all_members, statement_id=self.stmt_a),
            make_transaction(150.00, self.all_members, statement_id=self.stmt_b),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,
            all_member_ids=self.all_members,
            statement_payers=self.statement_payers,
        )

        total = sum(balances.values())
        assert abs(total) < 0.01, \
            f"All balances must sum to zero (conservation of money). Got: {total}"

    def test_transfers_fully_settle_all_debts(self):
        """
        After minimize_transfers, applying the transfers should bring every member to $0.
        This verifies end-to-end: balances are correct AND the settlement algorithm works.
        """
        txns = [
            make_transaction(300.00, self.all_members, statement_id=self.stmt_a),
            make_transaction(150.00, self.all_members, statement_id=self.stmt_b),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,
            all_member_ids=self.all_members,
            statement_payers=self.statement_payers,
        )

        transfers = minimize_transfers(balances)

        # Simulate applying all transfers and verify everyone ends at $0
        net = dict(balances)  # copy
        for t in transfers:
            net[t.from_member_id] += t.amount   # debtor pays off their debt
            net[t.to_member_id] -= t.amount     # creditor collects

        for mid, final in net.items():
            assert abs(final) < 0.01, \
                f"Member {mid} not fully settled after transfers; remaining balance: {final}"

    def test_charlie_owes_alice_after_settlement(self):
        """
        With these numbers, Charlie should end up owing Alice $150
        and Bob is settled (net zero). One transfer expected.
        """
        txns = [
            make_transaction(300.00, self.all_members, statement_id=self.stmt_a),
            make_transaction(150.00, self.all_members, statement_id=self.stmt_b),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,
            all_member_ids=self.all_members,
            statement_payers=self.statement_payers,
        )
        transfers = minimize_transfers(balances)

        # There should be exactly one transfer: Charlie → Alice $150
        assert len(transfers) == 1
        assert transfers[0].from_member_id == self.charlie
        assert transfers[0].to_member_id == self.alice
        assert transfers[0].amount == pytest.approx(150.0, abs=0.01)

    def test_fallback_payer_used_for_unmapped_statement(self):
        """
        If a statement's ID is not in statement_payers, the fallback
        payer_member_id is credited. This ensures backward compatibility
        with statements that don't have a card holder assigned.
        """
        # Statement 99 has no entry in statement_payers → Alice (fallback) gets credit
        txns = [
            make_transaction(120.00, self.all_members, statement_id=99),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,           # Alice is the fallback
            all_member_ids=self.all_members,
            statement_payers=self.statement_payers,  # only has stmts 1 and 2
        )

        # $120 / 3 = $40 each; Alice paid $120 → net = $120 - $40 = +$80
        assert balances[self.alice] == pytest.approx(80.0, abs=0.01), \
            "Alice (fallback payer) should be credited for the unmapped statement"
        assert balances[self.bob] == pytest.approx(-40.0, abs=0.01)
        assert balances[self.charlie] == pytest.approx(-40.0, abs=0.01)

    def test_none_statement_payers_is_backward_compatible(self):
        """
        Calling compute_net_balances with statement_payers=None should behave
        exactly like the original single-payer mode.
        """
        txns = [
            make_transaction(300.00, self.all_members, statement_id=self.stmt_a),
        ]

        balances = compute_net_balances(
            txns,
            payer_member_id=self.alice,
            all_member_ids=self.all_members,
            statement_payers=None,  # Single-payer mode (no dict)
        )

        # Classic behavior: Alice paid $300, split 3 ways → Alice net +$200
        assert balances[self.alice] == pytest.approx(200.0, abs=0.01)
        assert balances[self.bob] == pytest.approx(-100.0, abs=0.01)
        assert balances[self.charlie] == pytest.approx(-100.0, abs=0.01)

    def test_many_statements_many_payers(self):
        """
        4 members, 4 statements, each member holds one card.
        Every member pays an equal amount ($100), split 4 ways.
        Net result: everyone should be at $0 (perfectly balanced trip).
        """
        alice, bob, charlie, dana = 1, 2, 3, 4
        all_members = [alice, bob, charlie, dana]

        # Each member's card: $100 spent on a transaction split 4 ways ($25 each)
        # Payer credit: +$100, own share: -$25 → net per person: +$75
        # But everyone is both a payer and a participant → should net to $0
        txns = [
            make_transaction(100.00, all_members, statement_id=1),  # Alice's card
            make_transaction(100.00, all_members, statement_id=2),  # Bob's card
            make_transaction(100.00, all_members, statement_id=3),  # Charlie's card
            make_transaction(100.00, all_members, statement_id=4),  # Dana's card
        ]

        statement_payers = {1: alice, 2: bob, 3: charlie, 4: dana}

        balances = compute_net_balances(
            txns,
            payer_member_id=alice,
            all_member_ids=all_members,
            statement_payers=statement_payers,
        )

        # Each person: paid $100, owes $100 (4 cards × $25 each) → net = $0
        for mid in all_members:
            assert abs(balances[mid]) < 0.01, \
                f"Member {mid} should be at $0 (perfectly balanced trip)"

        # Total sum should also be zero
        assert abs(sum(balances.values())) < 0.01
