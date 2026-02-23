"""
Split calculation logic — pure math, zero side effects.

This module answers the question: "Given this transaction amount
and a split method, how much does each person owe?"

Three split methods are supported:
1. Equal — divide evenly (handles rounding remainder)
2. Percentage — each person pays their stated percentage
3. Exact — manually specify each person's dollar amount
"""

from dataclasses import dataclass
from typing import List, Dict


@dataclass
class SplitShare:
    """One person's share of a transaction."""
    member_id: int
    amount: float  # how much THIS person owes


def _fix_rounding(shares: List[SplitShare], total: float) -> List[SplitShare]:
    """
    After dividing, floating-point math can leave a tiny rounding error.
    Example: $10 / 3 = $3.33 * 3 = $9.99, leaving $0.01 unaccounted for.
    We fix this by giving the remainder to the first person.
    """
    if not shares:
        return shares
    computed_total = sum(s.amount for s in shares)
    diff = round(total - computed_total, 2)
    if abs(diff) > 0:
        shares[0].amount = round(shares[0].amount + diff, 2)
    return shares


def compute_equal_split(amount: float, member_ids: List[int]) -> List[SplitShare]:
    """
    Split the amount evenly among all members.
    Example: $30 split 3 ways → $10 each
    """
    if not member_ids:
        return []
    per_person = round(amount / len(member_ids), 2)
    shares = [SplitShare(member_id=mid, amount=per_person) for mid in member_ids]
    return _fix_rounding(shares, amount)


def compute_percentage_split(amount: float, percentages: Dict) -> List[SplitShare]:
    """
    Split by percentage. percentages keys may be int or string (JSON serialization quirk).
    Example: {"1": 60, "2": 40} on $100 → $60 for member 1, $40 for member 2
    """
    shares = []
    for member_id, pct in percentages.items():
        shares.append(SplitShare(
            member_id=int(member_id),
            amount=round(amount * float(pct) / 100.0, 2),
        ))
    return _fix_rounding(shares, amount)


def compute_exact_split(exact_amounts: Dict) -> List[SplitShare]:
    """
    Each person pays a specific dollar amount.
    Example: {"1": 45.00, "2": 23.50} — user manually entered these.
    """
    return [
        SplitShare(member_id=int(mid), amount=float(amt))
        for mid, amt in exact_amounts.items()
    ]


def compute_shares(amount: float, split_method: dict, participant_ids: List[int]) -> List[SplitShare]:
    """
    Main dispatcher — routes to the correct split function based on method type.

    split_method format:
        {"type": "equal"}
        {"type": "percentage", "percentages": {"1": 60, "2": 40}}
        {"type": "exact", "amounts": {"1": 45.00, "2": 23.50}}

    participant_ids is only used for "equal" splits.
    """
    method_type = split_method.get("type", "equal")

    if method_type == "equal":
        return compute_equal_split(amount, participant_ids)
    elif method_type == "percentage":
        return compute_percentage_split(amount, split_method.get("percentages", {}))
    elif method_type == "exact":
        return compute_exact_split(split_method.get("amounts", {}))
    else:
        # Unknown method → fall back to equal
        return compute_equal_split(amount, participant_ids)
