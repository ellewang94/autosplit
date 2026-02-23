"""
Settlement Service — computes who owes whom and how much.

This orchestrates the domain-level settlement math with real database data.
The domain/settlement.py module is pure math; this module fetches the data
from the database and formats the results for the API response.
"""

from sqlalchemy.orm import Session
from typing import Optional

from models.models import Transaction, Member, Statement
from domain.settlement import compute_net_balances, minimize_transfers
from schemas.schemas import BalanceItem, TransferItem, SettlementResponse


def compute_settlement(
    group_id: int,
    payer_member_id: int,
    db: Session,
    statement_id: Optional[int] = None,
) -> SettlementResponse:
    """
    Compute settlement for a group.

    payer_member_id: The person who holds the credit card and paid the bill.
                     All charges flowed through them; others owe them back.
    statement_id:    If provided, only settle transactions from that statement.
                     If None, settle ALL transactions in the group.

    Returns a SettlementResponse with:
    - Net balances per member
    - Minimized list of transfers ("Bob pays Alice $X")
    - Human-readable + copyable payment request messages
    """

    # ── Fetch members ────────────────────────────────────────────────────────
    members = db.query(Member).filter_by(group_id=group_id).all()
    member_lookup = {m.id: m.name for m in members}
    all_member_ids = [m.id for m in members]

    if not members:
        raise ValueError("Group has no members")
    if payer_member_id not in member_lookup:
        raise ValueError(f"Member {payer_member_id} is not in group {group_id}")

    # ── Fetch transactions ───────────────────────────────────────────────────
    if statement_id is not None:
        # Only this statement
        stmt = db.query(Statement).filter_by(id=statement_id, group_id=group_id).first()
        if not stmt:
            raise ValueError(f"Statement {statement_id} not found in group {group_id}")
        transactions = db.query(Transaction).filter_by(statement_id=statement_id).all()
    else:
        # All statements in the group
        stmt_ids = [
            s.id for s in db.query(Statement).filter_by(group_id=group_id).all()
        ]
        if not stmt_ids:
            transactions = []
        else:
            transactions = (
                db.query(Transaction)
                .filter(Transaction.statement_id.in_(stmt_ids))
                .all()
            )

    # Filter out personal transactions and those with no participants
    shared_transactions = [
        t for t in transactions
        if not t.is_personal
        and t.participants_json
        and t.participants_json.get("member_ids")
    ]

    # ── Compute net balances ─────────────────────────────────────────────────
    balances = compute_net_balances(shared_transactions, payer_member_id, all_member_ids)

    # ── Run min-flow algorithm ───────────────────────────────────────────────
    transfers = minimize_transfers(balances)

    # ── Build response ───────────────────────────────────────────────────────
    payer_name = member_lookup[payer_member_id]

    balance_items = [
        BalanceItem(
            member_id=mid,
            member_name=member_lookup.get(mid, f"Member {mid}"),
            balance=bal,
        )
        for mid, bal in sorted(balances.items(), key=lambda x: x[1])
    ]

    transfer_items = []
    for t in transfers:
        from_name = member_lookup.get(t.from_member_id, f"Member {t.from_member_id}")
        to_name = member_lookup.get(t.to_member_id, f"Member {t.to_member_id}")
        amount_str = f"${t.amount:.2f}"

        transfer_items.append(TransferItem(
            from_member_id=t.from_member_id,
            from_member_name=from_name,
            to_member_id=t.to_member_id,
            to_member_name=to_name,
            amount=t.amount,
            message=f"{from_name} owes {to_name} {amount_str}",
            payment_request=(
                f"Hey {from_name}! You owe {to_name} {amount_str} for shared expenses "
                f"this month. Please send it whenever you get a chance. Thanks!"
            ),
        ))

    total_shared = sum(
        t.amount for t in shared_transactions
    )

    return SettlementResponse(
        group_id=group_id,
        payer_member_id=payer_member_id,
        balances=balance_items,
        transfers=transfer_items,
        total_shared_expenses=round(total_shared, 2),
    )


def export_settlement_csv(settlement: SettlementResponse) -> str:
    """Generate a CSV string from settlement data."""
    lines = [
        "Type,From,To,Amount,Message",
        "",
        "# BALANCES",
    ]
    for b in settlement.balances:
        status = "owed" if b.balance >= 0 else "owes"
        lines.append(f"Balance,{b.member_name},,{abs(b.balance):.2f},{b.member_name} {status} ${abs(b.balance):.2f}")

    lines.append("")
    lines.append("# TRANSFERS")
    for t in settlement.transfers:
        lines.append(f"Transfer,{t.from_member_name},{t.to_member_name},{t.amount:.2f},{t.message}")

    return "\n".join(lines)


def export_settlement_json(settlement: SettlementResponse) -> dict:
    """Return settlement as a clean dict for JSON export."""
    return {
        "group_id": settlement.group_id,
        "total_shared_expenses": settlement.total_shared_expenses,
        "balances": [
            {"member": b.member_name, "net_balance": b.balance}
            for b in settlement.balances
        ],
        "transfers": [
            {
                "from": t.from_member_name,
                "to": t.to_member_name,
                "amount": t.amount,
                "message": t.message,
                "payment_request": t.payment_request,
            }
            for t in settlement.transfers
        ],
    }
