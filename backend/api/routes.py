"""
FastAPI route definitions — the HTTP layer.

These are intentionally thin: each route handler does as little as possible
itself, delegating to the service layer for actual logic. This keeps the
"how does HTTP work" concerns completely separate from "how does splitting work."

Pattern: validate input → call service → return response schema.
"""

import json
import uuid as _uuid_module
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.models import Group, Member, Statement, Transaction, MerchantRule, Feedback, TripShare
from schemas.schemas import (
    GroupCreate, GroupResponse,
    MemberCreate, MemberResponse,
    StatementResponse, TransactionResponse, TransactionUpdate, BulkTransactionUpdate,
    MerchantRuleCreate, MerchantRuleResponse,
    SettlementRequest, SettlementResponse, UploadResponse,
    SaveMerchantRuleRequest,
    ManualTransactionCreate, ManualTransactionResponse,
    FeedbackCreate, FeedbackResponse,
    TripShareCreate, TripShareResponse, PublicTripView, PublicMember, PublicTransfer,
)
from services.import_service import import_statement, import_csv_statement, save_merchant_rule, create_manual_transaction
from services.settlement_service import (
    compute_settlement, export_settlement_csv, export_settlement_json
)
from auth import get_current_user_id

router = APIRouter()


# ── Helper: verify the user owns a group ─────────────────────────────────────
# Every route that touches a specific group calls this first. If the group
# doesn't exist OR belongs to a different user, we return 404 (not 403 —
# we don't want to confirm to an attacker that a group ID exists).
def _require_group(group_id: int, user_id: str, db: Session) -> Group:
    group = db.query(Group).filter(
        Group.id == group_id,
        # Allow access if owner_id matches OR if owner_id is null (legacy local groups)
        (Group.owner_id == user_id) | (Group.owner_id == None)  # noqa: E711
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Trip not found")
    return group


def _require_statement(statement_id: int, user_id: str, db: Session) -> Statement:
    """
    Verify the statement exists AND belongs to a group the user owns.
    Raises 404 if either condition fails (don't confirm the ID exists to attackers).
    """
    stmt = db.query(Statement).filter_by(id=statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    _require_group(stmt.group_id, user_id, db)  # ownership check
    return stmt


def _require_transaction(txn_id: int, user_id: str, db: Session) -> Transaction:
    """
    Verify the transaction exists AND belongs to a statement in a group the user owns.
    Raises 404 if any link in the chain breaks.
    """
    txn = db.query(Transaction).filter_by(id=txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    stmt = db.query(Statement).filter_by(id=txn.statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _require_group(stmt.group_id, user_id, db)  # ownership check
    return txn


# ═══════════════════════════════════════════════════════════════════════════════
# GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/groups", response_model=List[GroupResponse])
def list_groups(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return all groups belonging to the signed-in user."""
    # Filter to only this user's groups (OR legacy groups with no owner)
    return db.query(Group).filter(
        (Group.owner_id == user_id) | (Group.owner_id == None)  # noqa: E711
    ).all()


@router.post("/groups", response_model=GroupResponse)
def create_group(
    body: GroupCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Create a new trip — automatically assigned to the signed-in user."""
    group = Group(
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        base_currency=body.base_currency,
        owner_id=user_id,   # Tag this trip to the user who created it
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/groups/{group_id}", response_model=GroupResponse)
def get_group(
    group_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return _require_group(group_id, user_id, db)


@router.put("/groups/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: int,
    body: GroupCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    group = _require_group(group_id, user_id, db)
    group.name = body.name
    group.start_date = body.start_date
    group.end_date = body.end_date
    db.commit()
    db.refresh(group)
    return group


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    group = _require_group(group_id, user_id, db)
    db.delete(group)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/members", response_model=MemberResponse)
def add_member(
    group_id: int, body: MemberCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Add a member to the user's group."""
    _require_group(group_id, user_id, db)
    member = Member(group_id=group_id, name=body.name)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/members/{member_id}", response_model=MemberResponse)
def update_member(
    member_id: int, body: MemberCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    member = db.query(Member).filter_by(id=member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    _require_group(member.group_id, user_id, db)  # verify ownership
    member.name = body.name
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}")
def delete_member(
    member_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    member = db.query(Member).filter_by(id=member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    _require_group(member.group_id, user_id, db)  # verify ownership
    db.delete(member)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# STATEMENTS (PDF UPLOAD)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/statements/upload", response_model=UploadResponse)
async def upload_statement(
    group_id: int,
    file: UploadFile = File(...),
    card_holder_member_id: Optional[int] = Form(None),
    statement_currency: str = Form("USD"),
    exchange_rate: Optional[float] = Form(None),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_group(group_id, user_id, db)

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    file_bytes = await file.read()

    try:
        result = import_statement(
            group_id=group_id,
            file_bytes=file_bytes,
            db=db,
            card_holder_member_id=card_holder_member_id,
            statement_currency=statement_currency,
            exchange_rate=exchange_rate,
        )
        return UploadResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF parsing failed: {str(e)}")


@router.post("/groups/{group_id}/statements/upload-csv", response_model=UploadResponse)
async def upload_csv_statement(
    group_id: int,
    file: UploadFile = File(...),
    card_holder_member_id: Optional[int] = Form(None),
    statement_currency: str = Form("USD"),
    exchange_rate: Optional[float] = Form(None),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_group(group_id, user_id, db)

    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    file_bytes = await file.read()

    try:
        result = import_csv_statement(
            group_id=group_id,
            file_bytes=file_bytes,
            db=db,
            card_holder_member_id=card_holder_member_id,
            statement_currency=statement_currency,
            exchange_rate=exchange_rate,
        )
        return UploadResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"CSV parsing failed: {str(e)}")


@router.get("/groups/{group_id}/statements", response_model=List[StatementResponse])
def list_statements(
    group_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all statements uploaded for a group."""
    _require_group(group_id, user_id, db)
    stmts = db.query(Statement).filter_by(group_id=group_id).all()
    result = []
    for s in stmts:
        txn_count = db.query(Transaction).filter_by(statement_id=s.id).count()
        item = StatementResponse.model_validate(s)
        item.transaction_count = txn_count
        item.is_manual = (s.source_hash or '').startswith('manual:')
        result.append(item)
    return result


@router.put("/statements/{statement_id}/card-holder")
def set_card_holder(
    statement_id: int,
    body: dict,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Set which member is the card holder for this statement."""
    stmt = _require_statement(statement_id, user_id, db)  # verifies existence + ownership
    stmt.card_holder_member_id = body.get("member_id")
    db.commit()
    return {"ok": True}


@router.delete("/statements/{statement_id}")
def delete_statement(
    statement_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    stmt = _require_statement(statement_id, user_id, db)  # verifies existence + ownership
    db.delete(stmt)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSACTIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/transactions/manual", response_model=ManualTransactionResponse)
def add_manual_transaction(group_id: int, body: ManualTransactionCreate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """
    Manually add a single expense to a group — no bank statement upload needed.

    Great for cash expenses, expenses from cards not uploaded yet, or
    anything a group member wants to log on the fly.

    The expense is attached to a virtual 'Manual Expenses' statement for the
    specified payer, so the settlement logic can correctly attribute who paid.
    """
    _require_group(group_id, user_id, db)
    member = db.query(Member).filter_by(id=body.paid_by_member_id, group_id=group_id).first()
    if not member:
        raise HTTPException(status_code=400, detail="Payer is not a member of this group.")

    result = create_manual_transaction(
        group_id=group_id,
        posted_date=body.posted_date,
        description=body.description,
        amount=body.amount,
        paid_by_member_id=body.paid_by_member_id,
        db=db,
        category=body.category,
        participants_json=body.participants_json,
        split_method_json=body.split_method_json,
        # Pass through multi-currency fields (defaults to USD / no conversion if omitted)
        currency=body.currency,
        original_amount=body.original_amount,
        exchange_rate=body.exchange_rate,
    )
    return result


@router.get("/statements/{statement_id}/transactions", response_model=List[TransactionResponse])
def list_transactions(
    statement_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get all transactions for a statement."""
    _require_statement(statement_id, user_id, db)  # verifies existence + ownership
    return db.query(Transaction).filter_by(statement_id=statement_id).order_by(Transaction.posted_date).all()


@router.get("/groups/{group_id}/transactions", response_model=List[TransactionResponse])
def list_group_transactions(group_id: int, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Get all transactions across all statements for a group."""
    _require_group(group_id, user_id, db)
    stmt_ids = [s.id for s in db.query(Statement).filter_by(group_id=group_id).all()]
    if not stmt_ids:
        return []
    return (
        db.query(Transaction)
        .filter(Transaction.statement_id.in_(stmt_ids))
        .order_by(Transaction.posted_date.desc())
        .all()
    )


@router.get("/groups/{group_id}/transactions/export-csv")
def export_transactions_csv(group_id: int, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """
    Export ALL transactions for a group as a CSV file.

    Unlike the settlement export (which only shows who owes whom),
    this gives a full line-by-line breakdown: every transaction with its
    date, merchant, category, amount, participants, and status.

    Great for sharing with the group as a receipt, or opening in Google Sheets
    to do your own analysis.
    """
    group = _require_group(group_id, user_id, db)

    # Build a member id → name lookup so we can show names instead of IDs
    member_names = {m.id: m.name for m in group.members}

    # Fetch all transactions for this group, oldest first (chronological makes
    # more sense for a spreadsheet than newest-first)
    stmt_ids = [s.id for s in db.query(Statement).filter_by(group_id=group_id).all()]
    if not stmt_ids:
        transactions = []
    else:
        transactions = (
            db.query(Transaction)
            .filter(Transaction.statement_id.in_(stmt_ids))
            .order_by(Transaction.posted_date.asc())
            .all()
        )

    def csv_cell(value: str) -> str:
        """
        Safely wrap a value for CSV — if it contains a comma, quote, or newline,
        wrap it in double-quotes and escape any internal double-quotes.
        """
        s = str(value)
        if ',' in s or '"' in s or '\n' in s:
            s = '"' + s.replace('"', '""') + '"'
        return s

    def format_participants(txn: Transaction) -> str:
        """
        Turn participants_json into a human-readable string:
          - "Elle / Tom / Sarah"  for assigned transactions
          - "Needs Review"        for unassigned ones
          - "Excluded"            for excluded ones
        """
        if txn.status == 'excluded':
            return 'Excluded'
        p = txn.participants_json
        if not p:
            return 'Needs Review'
        ids = p.get('member_ids', [])
        if not ids:
            return 'Needs Review'
        # Resolve IDs to names, fall back to "#ID" if member was deleted
        return ' / '.join(member_names.get(mid, f'#{mid}') for mid in ids)

    def format_status(txn: Transaction) -> str:
        """Convert internal status codes to plain-English labels."""
        if txn.status == 'excluded':
            return 'Excluded'
        p = txn.participants_json
        if p and p.get('member_ids'):
            return 'Assigned'
        return 'Needs Review'

    # Build CSV rows — header first, then one row per transaction
    rows = [['Date', 'Merchant', 'Category', 'Amount', 'Participants', 'Status']]
    for txn in transactions:
        rows.append([
            txn.posted_date,
            txn.description_raw,
            txn.category or 'unknown',
            f'{txn.amount:.2f}',
            format_participants(txn),
            format_status(txn),
        ])

    csv_content = '\n'.join(','.join(csv_cell(cell) for cell in row) for row in rows)

    # Use group name in the filename so it's easy to identify in Downloads
    safe_name = group.name.replace(' ', '_').replace('/', '-')
    filename = f'{safe_name}_transactions.csv'

    return StreamingResponse(
        iter([csv_content]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@router.delete("/transactions/{txn_id}")
def delete_transaction(
    txn_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Permanently delete a single transaction.

    Best used for manually-entered expenses you want to remove.
    For uploaded statement transactions, 'excluding' is usually safer —
    deleting means the same transaction would re-appear if you re-uploaded the file.
    """
    txn = _require_transaction(txn_id, user_id, db)  # verifies existence + ownership
    db.delete(txn)
    db.commit()
    return {"ok": True}


@router.put("/transactions/{txn_id}", response_model=TransactionResponse)
def update_transaction(
    txn_id: int,
    body: TransactionUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Override transaction fields (category, participants, split method, personal flag).
    Stores the diff in overrides_json for audit trail and merchant rule learning.
    """
    txn = _require_transaction(txn_id, user_id, db)  # verifies existence + ownership

    overrides = txn.overrides_json or {}

    # Core fields — editable to fix bad imports or manual entry mistakes
    if body.amount is not None:
        overrides["amount"] = {"old": txn.amount, "new": body.amount}
        txn.amount = body.amount

    if body.posted_date is not None:
        overrides["posted_date"] = {"old": txn.posted_date, "new": body.posted_date}
        txn.posted_date = body.posted_date

    if body.description_raw is not None:
        overrides["description_raw"] = {"old": txn.description_raw, "new": body.description_raw}
        txn.description_raw = body.description_raw

    if body.category is not None:
        overrides["category"] = {"old": txn.category, "new": body.category}
        txn.category = body.category

    if body.is_personal is not None:
        overrides["is_personal"] = {"old": txn.is_personal, "new": body.is_personal}
        txn.is_personal = body.is_personal

    if body.participants_json is not None:
        overrides["participants"] = {"old": txn.participants_json, "new": body.participants_json}
        txn.participants_json = body.participants_json

    if body.split_method_json is not None:
        overrides["split_method"] = {"old": txn.split_method_json, "new": body.split_method_json}
        txn.split_method_json = body.split_method_json

    txn.overrides_json = overrides
    db.commit()
    db.refresh(txn)
    return txn


@router.put("/groups/{group_id}/transactions/bulk-update")
def bulk_update_transactions(
    group_id: int,
    body: BulkTransactionUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Bulk-update multiple transactions at once — the core trip workflow.

    Security: verifies every transaction ID belongs to a statement in this group
    before updating anything. This prevents one group from editing another's data.

    Only applies fields that are explicitly set in the request (not None).
    For example, if only `category` is provided, participants are left untouched.

    Returns: {"updated": count}
    """
    _require_group(group_id, user_id, db)  # verify the user owns this group

    # Collect all valid statement IDs for this group
    stmt_ids = {
        s.id for s in db.query(Statement).filter_by(group_id=group_id).all()
    }

    # Fetch only the transactions that (a) are in the request and (b) belong to this group
    transactions = (
        db.query(Transaction)
        .filter(Transaction.id.in_(body.transaction_ids))
        .all()
    )

    updated_count = 0

    for txn in transactions:
        # Security check: reject any transaction that doesn't belong to this group
        if txn.statement_id not in stmt_ids:
            continue  # Skip silently — could also raise 403, but skip is safer for bulk

        # Track the diff of what changed (audit trail, same pattern as single-update)
        overrides = txn.overrides_json or {}

        if body.category is not None:
            overrides["category"] = {"old": txn.category, "new": body.category}
            txn.category = body.category

        if body.is_personal is not None:
            overrides["is_personal"] = {"old": txn.is_personal, "new": body.is_personal}
            txn.is_personal = body.is_personal

        if body.participants_json is not None:
            overrides["participants"] = {"old": txn.participants_json, "new": body.participants_json}
            txn.participants_json = body.participants_json

        if body.split_method_json is not None:
            overrides["split_method"] = {"old": txn.split_method_json, "new": body.split_method_json}
            txn.split_method_json = body.split_method_json

        if body.status is not None:
            overrides["status"] = {"old": txn.status, "new": body.status}
            txn.status = body.status

        txn.overrides_json = overrides
        updated_count += 1

    # One commit for all changes — more efficient than committing per-transaction
    db.commit()

    return {"updated": updated_count}


@router.post("/transactions/save-merchant-rule")
def create_merchant_rule_from_transaction(
    body: SaveMerchantRuleRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Save the current transaction settings as a merchant rule.
    Next import: same merchant → same category/participants/split automatically.
    """
    txn = _require_transaction(body.transaction_id, user_id, db)  # verifies existence + ownership

    stmt = db.query(Statement).filter_by(id=txn.statement_id).first()
    group_id = stmt.group_id

    result = save_merchant_rule(
        group_id=group_id,
        transaction_id=body.transaction_id,
        db=db,
        merchant_key_override=body.merchant_key,
    )
    return result


# Batch update: set all transactions in a statement to is_personal=False or True
@router.post("/statements/{statement_id}/batch-update")
def batch_update_transactions(
    statement_id: int,
    body: dict,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Batch update all transactions in a statement (e.g., mark all as personal)."""
    _require_statement(statement_id, user_id, db)  # verifies existence + ownership
    txns = db.query(Transaction).filter_by(statement_id=statement_id).all()
    for txn in txns:
        if "is_personal" in body:
            txn.is_personal = body["is_personal"]
        if "category" in body:
            txn.category = body["category"]
    db.commit()
    return {"updated": len(txns)}


# ═══════════════════════════════════════════════════════════════════════════════
# MERCHANT RULES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/groups/{group_id}/merchant-rules", response_model=List[MerchantRuleResponse])
def list_merchant_rules(
    group_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_group(group_id, user_id, db)
    return db.query(MerchantRule).filter_by(group_id=group_id).all()


@router.post("/groups/{group_id}/merchant-rules", response_model=MerchantRuleResponse)
def create_merchant_rule(
    group_id: int,
    body: MerchantRuleCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_group(group_id, user_id, db)  # verify ownership before creating

    # Upsert
    rule = db.query(MerchantRule).filter_by(
        group_id=group_id, merchant_key=body.merchant_key
    ).first()
    if rule:
        rule.default_category = body.default_category
        rule.default_participants_json = body.default_participants_json
        rule.default_split_method_json = body.default_split_method_json
    else:
        rule = MerchantRule(
            group_id=group_id,
            **body.model_dump(),
        )
        db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/merchant-rules/{rule_id}", response_model=MerchantRuleResponse)
def update_merchant_rule(
    rule_id: int,
    body: MerchantRuleCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rule = db.query(MerchantRule).filter_by(id=rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    _require_group(rule.group_id, user_id, db)  # verify the rule belongs to user's group
    rule.merchant_key = body.merchant_key
    rule.default_category = body.default_category
    rule.default_participants_json = body.default_participants_json
    rule.default_split_method_json = body.default_split_method_json
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/merchant-rules/{rule_id}")
def delete_merchant_rule(
    rule_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rule = db.query(MerchantRule).filter_by(id=rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    _require_group(rule.group_id, user_id, db)  # verify the rule belongs to user's group
    db.delete(rule)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# SETTLEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/settlement", response_model=SettlementResponse)
def get_settlement(
    group_id: int,
    body: SettlementRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Compute who owes whom.

    payer_member_id: The person who paid the credit card bill.
    statement_id (optional): Limit to one statement; if omitted, settles all.
    """
    _require_group(group_id, user_id, db)
    try:
        return compute_settlement(
            group_id=group_id,
            payer_member_id=body.payer_member_id,
            db=db,
            statement_id=body.statement_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/groups/{group_id}/settlement/export-csv")
def export_csv(
    group_id: int,
    body: SettlementRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Export settlement as a downloadable CSV file."""
    _require_group(group_id, user_id, db)
    try:
        settlement = compute_settlement(
            group_id=group_id,
            payer_member_id=body.payer_member_id,
            db=db,
            statement_id=body.statement_id,
        )
        csv_content = export_settlement_csv(settlement)
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=settlement.csv"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/groups/{group_id}/settlement/export-json")
def export_json_file(
    group_id: int,
    body: SettlementRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Export settlement as a downloadable JSON file."""
    _require_group(group_id, user_id, db)
    try:
        settlement = compute_settlement(
            group_id=group_id,
            payer_member_id=body.payer_member_id,
            db=db,
            statement_id=body.statement_id,
        )
        data = export_settlement_json(settlement)
        json_str = json.dumps(data, indent=2)
        return StreamingResponse(
            iter([json_str]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=settlement.json"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# FEEDBACK
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(body: FeedbackCreate, db: Session = Depends(get_db)):
    """
    Save user feedback from the in-app widget.

    Accepts a feedback type (bug/feature/other), a message, and an optional
    email address. The page field tells us where in the app the user was.
    """
    item = Feedback(
        feedback_type=body.feedback_type,
        message=body.message,
        email=body.email or None,
        page=body.page or None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# ═══════════════════════════════════════════════════════════════════════════════
# TRIP SHARES  (the viral loop — share a read-only view with your friends)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/share", response_model=TripShareResponse)
def create_or_get_share(
    group_id: int,
    body: TripShareCreate,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Create a shareable read-only link for this trip's settlement.

    If a share already exists for this group, returns it instead of creating
    a duplicate. Only the trip owner can create the share.

    The returned share_url is the full URL anyone can open without logging in.
    """
    _require_group(group_id, user_id, db)  # must own the group to share it

    # Check if a share already exists for this group
    existing = db.query(TripShare).filter_by(group_id=group_id).first()
    if existing:
        # Update the payer in case they changed it on the settlement page
        existing.payer_member_id = body.payer_member_id
        db.commit()
        db.refresh(existing)
        share = existing
    else:
        # Generate a unique UUID as the share code (random, unguessable)
        share = TripShare(
            share_code=str(_uuid_module.uuid4()),
            group_id=group_id,
            created_by=user_id,
            payer_member_id=body.payer_member_id,
        )
        db.add(share)
        db.commit()
        db.refresh(share)

    # Build the full share URL from the request's base URL, or from FRONTEND_URL env var
    # (In production, the backend URL differs from the frontend URL, so we use FRONTEND_URL)
    frontend_url = os.getenv("FRONTEND_URL", str(request.base_url).rstrip("/"))
    share_url = f"{frontend_url}/share/{share.share_code}"

    return TripShareResponse(
        share_code=share.share_code,
        share_url=share_url,
        created_at=share.created_at,
        view_count=share.view_count or 0,
    )


@router.delete("/groups/{group_id}/share")
def revoke_share(
    group_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Revoke the share link for a trip. The link will stop working immediately.
    Only the trip owner can do this.
    """
    _require_group(group_id, user_id, db)

    share = db.query(TripShare).filter_by(group_id=group_id).first()
    if share:
        db.delete(share)
        db.commit()

    return {"ok": True}


@router.get("/share/{share_code}", response_model=PublicTripView)
def get_public_share(
    share_code: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint — NO auth required.

    Returns enough data to render a read-only trip settlement summary.
    Anyone with the link can view this. We intentionally never expose
    raw transaction descriptions (privacy) — just the settlement math.

    Also increments the view_count so the trip owner can see how many
    people have opened their share link.
    """
    # Look up the share
    share = db.query(TripShare).filter_by(share_code=share_code).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or has been revoked.")

    # Fetch the group
    group = db.query(Group).filter_by(id=share.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Trip not found.")

    # Fetch members (names only — no private user data)
    members = db.query(Member).filter_by(group_id=share.group_id).all()
    member_lookup = {m.id: m.name for m in members}

    # Determine the payer for this settlement computation
    # Use the stored payer_member_id, falling back to the first member if not set
    payer_id = share.payer_member_id
    if not payer_id or payer_id not in member_lookup:
        if members:
            payer_id = members[0].id
        else:
            # No members = can't compute settlement
            raise HTTPException(status_code=400, detail="Trip has no members.")

    # Compute the settlement using the service layer (same math as the owner sees)
    try:
        settlement = compute_settlement(
            group_id=share.group_id,
            payer_member_id=payer_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Count total transactions in the trip (for context — "split 47 transactions")
    stmt_ids = [s.id for s in db.query(Statement).filter_by(group_id=share.group_id).all()]
    if stmt_ids:
        txn_count = db.query(Transaction).filter(
            Transaction.statement_id.in_(stmt_ids),
            Transaction.status != "excluded",
        ).count()
    else:
        txn_count = 0

    # Increment view count (fire-and-forget — if this fails, don't crash the page)
    try:
        share.view_count = (share.view_count or 0) + 1
        db.commit()
    except Exception:
        db.rollback()

    # Build public-safe transfer list (no raw transaction details)
    public_transfers = [
        PublicTransfer(
            from_member_name=t.from_member_name,
            to_member_name=t.to_member_name,
            amount=t.amount,
            message=t.message,
            payment_request=t.payment_request,
        )
        for t in settlement.transfers
    ]

    return PublicTripView(
        trip_name=group.name,
        start_date=group.start_date,
        end_date=group.end_date,
        members=[PublicMember(id=m.id, name=m.name) for m in members],
        currency=settlement.currency,
        total_shared_expenses=settlement.total_shared_expenses,
        transfers=public_transfers,
        transaction_count=txn_count,
        view_count=share.view_count or 0,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health")
def health():
    return {"status": "ok", "service": "AutoSplit API"}
