"""
Settlement computation — the heart of AutoSplit.

This module answers: "Given all our shared transactions, who owes who what?"

The algorithm has two steps:
1. Compute net balance for each member
   (positive = they're owed money, negative = they owe money)
2. Run the greedy min-cash-flow algorithm to minimize the number of transfers

Why minimize transfers? If Alice owes Bob $20 and Bob owes Charlie $20,
instead of two transfers, we can do one: Alice → Charlie $20.

The greedy approach: always settle the biggest debt against the biggest credit.
It's not always globally optimal but in practice produces excellent results.
"""

from dataclasses import dataclass
from typing import List, Dict, Any
from .splits import compute_shares


@dataclass
class Transfer:
    """One directed payment: "from_member_id pays to_member_id this amount."""""
    from_member_id: int
    to_member_id: int
    amount: float  # always positive


@dataclass
class MemberBalance:
    """Net financial position of one member."""
    member_id: int
    balance: float  # positive = owed money; negative = owes money


def compute_net_balances(
    transactions: List[Any],
    payer_member_id: int,
    all_member_ids: List[int],
) -> Dict[int, float]:
    """
    Compute net balance for each member.

    The card holder (payer_member_id) paid ALL charges on the statement.
    For each non-personal transaction, we figure out what each participant owes.
    The payer is owed all those amounts; participants owe their shares.

    Returns: {member_id: net_balance}
      - Positive balance → member is owed money (they over-paid)
      - Negative balance → member owes money (they under-paid)
    """
    # Start everyone at zero
    balances: Dict[int, float] = {mid: 0.0 for mid in all_member_ids}

    for txn in transactions:
        # Skip personal transactions — not shared expenses
        if txn.is_personal:
            continue

        participants = txn.participants_json or {}
        participant_ids = participants.get("member_ids", [])

        # Skip transactions with no participants assigned yet
        if not participant_ids:
            continue

        split_method = txn.split_method_json or {"type": "equal"}
        shares = compute_shares(txn.amount, split_method, participant_ids)

        # The card holder paid the full transaction amount
        # → their balance goes UP by the full amount
        balances[payer_member_id] = balances.get(payer_member_id, 0.0) + txn.amount

        # Each participant owes their share
        # → their balance goes DOWN by their share
        for share in shares:
            balances[share.member_id] = balances.get(share.member_id, 0.0) - share.amount

    # Round to cents to avoid floating-point ghost values like 0.000000001
    return {k: round(v, 2) for k, v in balances.items()}


def minimize_transfers(balances: Dict[int, float]) -> List[Transfer]:
    """
    Greedy minimum cash-flow algorithm.

    Given net balances (+ = owed, - = owes), compute the minimum set of
    transfers to settle all debts.

    Strategy:
    - Sort creditors (owed money) and debtors (owe money) by amount descending
    - Each round: largest debtor pays largest creditor as much as possible
    - Repeat until everyone is settled

    Example:
      Alice: +$50, Bob: -$30, Charlie: -$20
      → Bob pays Alice $30, Charlie pays Alice $20 (2 transfers)

    Example with simplification:
      Alice: +$20, Bob: -$20, Charlie: -$20, Dave: +$20
      → Bob pays Dave $20, Charlie pays Alice $20 (2 transfers, not 4)
    """
    # Separate into creditors (owed money) and debtors (owe money)
    # Use lists of [member_id, amount] so we can mutate the amounts
    creditors = [[mid, bal] for mid, bal in balances.items() if bal > 0.01]
    debtors = [[mid, -bal] for mid, bal in balances.items() if bal < -0.01]

    # Sort largest first — greedy approach
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])

    transfers = []
    i, j = 0, 0  # pointers into creditors and debtors lists

    while i < len(creditors) and j < len(debtors):
        creditor_id, credit = creditors[i]
        debtor_id, debt = debtors[j]

        # The debtor pays the minimum of (what they owe, what the creditor is owed)
        amount = round(min(credit, debt), 2)

        if amount > 0.01:
            transfers.append(Transfer(
                from_member_id=debtor_id,
                to_member_id=creditor_id,
                amount=amount,
            ))

        # Reduce the remaining amounts
        creditors[i][1] = round(credit - amount, 2)
        debtors[j][1] = round(debt - amount, 2)

        # Move pointer if that party is fully settled
        if creditors[i][1] < 0.01:
            i += 1
        if debtors[j][1] < 0.01:
            j += 1

    return transfers
