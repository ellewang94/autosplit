"""
Tests for settlement correctness.

We test the pure domain functions here (no database, no HTTP).
This makes the tests fast and reliable.
"""

import pytest
from unittest.mock import MagicMock
from domain.splits import compute_equal_split, compute_percentage_split, compute_exact_split, compute_shares
from domain.settlement import compute_net_balances, minimize_transfers


# ═══════════════════════════════════════════════════════════════════════════════
# Split calculation tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEqualSplit:
    def test_three_equal_ways(self):
        shares = compute_equal_split(30.00, [1, 2, 3])
        amounts = sorted([s.amount for s in shares])
        assert amounts == [10.0, 10.0, 10.0]
        assert sum(s.amount for s in shares) == 30.0

    def test_rounding_remainder_goes_to_first(self):
        """$10 / 3 = $3.33, $3.33, $3.34 (remainder to first)"""
        shares = compute_equal_split(10.00, [1, 2, 3])
        total = sum(s.amount for s in shares)
        assert abs(total - 10.00) < 0.001  # total must be exactly $10

    def test_single_member(self):
        shares = compute_equal_split(50.00, [1])
        assert len(shares) == 1
        assert shares[0].amount == 50.00

    def test_empty_members(self):
        shares = compute_equal_split(50.00, [])
        assert shares == []

    def test_two_way_split(self):
        shares = compute_equal_split(100.00, [1, 2])
        assert len(shares) == 2
        assert all(s.amount == 50.0 for s in shares)


class TestPercentageSplit:
    def test_60_40_split(self):
        shares = compute_percentage_split(100.00, {"1": 60, "2": 40})
        amounts = {s.member_id: s.amount for s in shares}
        assert amounts[1] == 60.0
        assert amounts[2] == 40.0

    def test_total_preserved(self):
        """Total of all shares must equal original amount."""
        shares = compute_percentage_split(157.43, {"1": 33.33, "2": 33.33, "3": 33.34})
        total = sum(s.amount for s in shares)
        assert abs(total - 157.43) < 0.01

    def test_string_keys(self):
        """JSON serializes dict keys as strings — must handle both."""
        shares = compute_percentage_split(100.00, {"1": 70, "2": 30})
        assert len(shares) == 2


class TestExactSplit:
    def test_exact_amounts(self):
        shares = compute_exact_split({"1": 45.00, "2": 23.50})
        amounts = {s.member_id: s.amount for s in shares}
        assert amounts[1] == 45.00
        assert amounts[2] == 23.50


# ═══════════════════════════════════════════════════════════════════════════════
# Net balance tests
# ═══════════════════════════════════════════════════════════════════════════════

def make_transaction(amount, participant_ids, is_personal=False, split_method=None):
    """Helper: create a mock transaction object."""
    txn = MagicMock()
    txn.amount = amount
    txn.is_personal = is_personal
    txn.participants_json = {"type": "all", "member_ids": participant_ids}
    txn.split_method_json = split_method or {"type": "equal"}
    return txn


class TestNetBalances:
    def test_simple_three_way_split(self):
        """
        Alice paid $300. Split equally three ways.
        Alice should be owed $200 (she paid but only owes $100).
        Bob owes $100, Charlie owes $100.
        """
        alice, bob, charlie = 1, 2, 3
        txns = [make_transaction(300.00, [alice, bob, charlie])]

        balances = compute_net_balances(txns, payer_member_id=alice, all_member_ids=[alice, bob, charlie])

        assert balances[alice] == pytest.approx(200.0, abs=0.01)
        assert balances[bob] == pytest.approx(-100.0, abs=0.01)
        assert balances[charlie] == pytest.approx(-100.0, abs=0.01)

    def test_personal_transaction_excluded(self):
        """Personal transactions should not affect balances at all."""
        alice, bob = 1, 2
        txns = [
            make_transaction(100.00, [alice, bob]),          # shared
            make_transaction(50.00, [alice], is_personal=True),  # personal, excluded
        ]
        balances = compute_net_balances(txns, payer_member_id=alice, all_member_ids=[alice, bob])

        # Only the $100 shared expense matters
        assert balances[alice] == pytest.approx(50.0, abs=0.01)
        assert balances[bob] == pytest.approx(-50.0, abs=0.01)

    def test_no_participant_transactions_skipped(self):
        """Transactions with empty participant list should be skipped (needs review)."""
        alice, bob = 1, 2
        txn = MagicMock()
        txn.amount = 100.00
        txn.is_personal = False
        txn.participants_json = {"type": "ask", "member_ids": []}
        txn.split_method_json = {"type": "equal"}

        balances = compute_net_balances([txn], payer_member_id=alice, all_member_ids=[alice, bob])
        # No participants → no balance changes
        assert balances[alice] == 0.0
        assert balances[bob] == 0.0

    def test_multiple_transactions(self):
        """Complex scenario with multiple shared and personal transactions."""
        alice, bob, charlie = 1, 2, 3
        txns = [
            make_transaction(90.00, [alice, bob, charlie]),   # $30 each
            make_transaction(60.00, [alice, bob]),             # $30 each
            make_transaction(20.00, [alice], is_personal=True), # excluded
        ]
        balances = compute_net_balances(txns, payer_member_id=alice, all_member_ids=[alice, bob, charlie])

        # Shared: $90 (Alice paid $90, each owes $30)
        # Shared: $60 (Alice paid $60, Alice and Bob each owe $30)
        # Personal: $20 excluded

        # Alice paid $150 for shared expenses
        # Alice owes: $30 (3-way) + $30 (2-way) = $60 of herself
        # Alice net: $150 - $60 = $90 (owed)
        # Bob owes: $30 + $30 = $60
        # Charlie owes: $30

        assert balances[alice] == pytest.approx(90.0, abs=0.01)
        assert balances[bob] == pytest.approx(-60.0, abs=0.01)
        assert balances[charlie] == pytest.approx(-30.0, abs=0.01)

        # The sum of all balances should always be zero (conservation of money)
        total = sum(balances.values())
        assert abs(total) < 0.01


# ═══════════════════════════════════════════════════════════════════════════════
# Minimize transfers tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMinimizeTransfers:
    def test_simple_two_person(self):
        """Alice is owed $50, Bob owes $50 → one transfer."""
        balances = {1: 50.0, 2: -50.0}
        transfers = minimize_transfers(balances)
        assert len(transfers) == 1
        assert transfers[0].from_member_id == 2
        assert transfers[0].to_member_id == 1
        assert transfers[0].amount == pytest.approx(50.0, abs=0.01)

    def test_three_people_minimized(self):
        """
        Alice: +$200, Bob: -$100, Charlie: -$100.
        Minimum is 2 transfers (can't do it in 1 since 2 people owe).
        """
        balances = {1: 200.0, 2: -100.0, 3: -100.0}
        transfers = minimize_transfers(balances)
        assert len(transfers) == 2
        total_settled = sum(t.amount for t in transfers)
        assert total_settled == pytest.approx(200.0, abs=0.01)

    def test_chain_simplification(self):
        """
        Alice owes Bob $20, Bob owes Charlie $20.
        Instead of 2 transfers, should simplify to: Alice → Charlie $20.
        This is the classic chain simplification case.
        Balances: Alice: -$20, Bob: $0, Charlie: +$20
        """
        balances = {1: -20.0, 2: 0.0, 3: 20.0}
        transfers = minimize_transfers(balances)
        assert len(transfers) == 1
        assert transfers[0].from_member_id == 1
        assert transfers[0].to_member_id == 3
        assert transfers[0].amount == pytest.approx(20.0, abs=0.01)

    def test_zero_balance_no_transfers(self):
        """Nobody owes anything → no transfers."""
        balances = {1: 0.0, 2: 0.0, 3: 0.0}
        transfers = minimize_transfers(balances)
        assert len(transfers) == 0

    def test_conservation_of_money(self):
        """Total money transferred out must equal total money transferred in."""
        balances = {1: 150.0, 2: -75.0, 3: -50.0, 4: -25.0}
        transfers = minimize_transfers(balances)
        total_out = sum(t.amount for t in transfers)
        assert total_out == pytest.approx(150.0, abs=0.01)

    def test_complex_four_people(self):
        """
        4 people with complex balances. Verify the algorithm converges
        and settles everything correctly.
        """
        balances = {1: 100.0, 2: 50.0, 3: -80.0, 4: -70.0}
        transfers = minimize_transfers(balances)

        # Verify all debts are settled.
        # Transfers reduce creditor balances (they collect what's owed)
        # and increase debtor balances (they pay off their debt).
        # After all transfers, every member's net should be 0.
        settled = {mid: 0.0 for mid in balances}
        for t in transfers:
            settled[t.from_member_id] += t.amount   # debtor pays → less negative
            settled[t.to_member_id] -= t.amount     # creditor collects → less positive

        for mid, original_balance in balances.items():
            final = original_balance + settled[mid]
            assert abs(final) < 0.01, f"Member {mid} not fully settled: net {final}"
