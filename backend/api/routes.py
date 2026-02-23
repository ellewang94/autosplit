"""
FastAPI route definitions — the HTTP layer.

These are intentionally thin: each route handler does as little as possible
itself, delegating to the service layer for actual logic. This keeps the
"how does HTTP work" concerns completely separate from "how does splitting work."

Pattern: validate input → call service → return response schema.
"""

import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.models import Group, Member, Statement, Transaction, MerchantRule
from schemas.schemas import (
    GroupCreate, GroupResponse,
    MemberCreate, MemberResponse,
    StatementResponse, TransactionResponse, TransactionUpdate,
    MerchantRuleCreate, MerchantRuleResponse,
    SettlementRequest, SettlementResponse, UploadResponse,
    SaveMerchantRuleRequest,
)
from services.import_service import import_statement, save_merchant_rule
from services.settlement_service import (
    compute_settlement, export_settlement_csv, export_settlement_json
)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/groups", response_model=List[GroupResponse])
def list_groups(db: Session = Depends(get_db)):
    """Return all groups with their members."""
    return db.query(Group).all()


@router.post("/groups", response_model=GroupResponse)
def create_group(body: GroupCreate, db: Session = Depends(get_db)):
    """Create a new expense-sharing group."""
    group = Group(name=body.name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/groups/{group_id}", response_model=GroupResponse)
def get_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.put("/groups/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, body: GroupCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.name = body.name
    db.commit()
    db.refresh(group)
    return group


@router.delete("/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/groups/{group_id}/members", response_model=MemberResponse)
def add_member(group_id: int, body: MemberCreate, db: Session = Depends(get_db)):
    """Add a member to a group."""
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    member = Member(group_id=group_id, name=body.name)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/members/{member_id}", response_model=MemberResponse)
def update_member(member_id: int, body: MemberCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter_by(id=member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.name = body.name
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter_by(id=member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
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
    db: Session = Depends(get_db),
):
    """
    Upload a Chase credit card PDF statement.

    Parses the PDF, auto-categorizes transactions, applies merchant rules,
    and saves everything to the database. Idempotent — re-uploading the
    same file returns the existing statement without duplication.
    """
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    file_bytes = await file.read()

    try:
        result = import_statement(
            group_id=group_id,
            file_bytes=file_bytes,
            db=db,
            card_holder_member_id=card_holder_member_id,
        )
        return UploadResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF parsing failed: {str(e)}")


@router.get("/groups/{group_id}/statements", response_model=List[StatementResponse])
def list_statements(group_id: int, db: Session = Depends(get_db)):
    """List all statements uploaded for a group."""
    stmts = db.query(Statement).filter_by(group_id=group_id).all()
    result = []
    for s in stmts:
        txn_count = db.query(Transaction).filter_by(statement_id=s.id).count()
        item = StatementResponse.model_validate(s)
        item.transaction_count = txn_count
        result.append(item)
    return result


@router.put("/statements/{statement_id}/card-holder")
def set_card_holder(
    statement_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """Set which member is the card holder for this statement."""
    stmt = db.query(Statement).filter_by(id=statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    stmt.card_holder_member_id = body.get("member_id")
    db.commit()
    return {"ok": True}


@router.delete("/statements/{statement_id}")
def delete_statement(statement_id: int, db: Session = Depends(get_db)):
    stmt = db.query(Statement).filter_by(id=statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    db.delete(stmt)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSACTIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/statements/{statement_id}/transactions", response_model=List[TransactionResponse])
def list_transactions(statement_id: int, db: Session = Depends(get_db)):
    """Get all transactions for a statement."""
    return db.query(Transaction).filter_by(statement_id=statement_id).order_by(Transaction.posted_date).all()


@router.get("/groups/{group_id}/transactions", response_model=List[TransactionResponse])
def list_group_transactions(group_id: int, db: Session = Depends(get_db)):
    """Get all transactions across all statements for a group."""
    stmt_ids = [s.id for s in db.query(Statement).filter_by(group_id=group_id).all()]
    if not stmt_ids:
        return []
    return (
        db.query(Transaction)
        .filter(Transaction.statement_id.in_(stmt_ids))
        .order_by(Transaction.posted_date.desc())
        .all()
    )


@router.put("/transactions/{txn_id}", response_model=TransactionResponse)
def update_transaction(txn_id: int, body: TransactionUpdate, db: Session = Depends(get_db)):
    """
    Override transaction fields (category, participants, split method, personal flag).
    Stores the diff in overrides_json for audit trail and merchant rule learning.
    """
    txn = db.query(Transaction).filter_by(id=txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

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

    txn.overrides_json = overrides
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/transactions/save-merchant-rule")
def create_merchant_rule_from_transaction(
    body: SaveMerchantRuleRequest,
    db: Session = Depends(get_db),
):
    """
    Save the current transaction settings as a merchant rule.
    Next import: same merchant → same category/participants/split automatically.
    """
    txn = db.query(Transaction).filter_by(id=body.transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

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
    db: Session = Depends(get_db),
):
    """Batch update all transactions in a statement (e.g., mark all as personal)."""
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
def list_merchant_rules(group_id: int, db: Session = Depends(get_db)):
    return db.query(MerchantRule).filter_by(group_id=group_id).all()


@router.post("/groups/{group_id}/merchant-rules", response_model=MerchantRuleResponse)
def create_merchant_rule(
    group_id: int,
    body: MerchantRuleCreate,
    db: Session = Depends(get_db),
):
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
    db: Session = Depends(get_db),
):
    rule = db.query(MerchantRule).filter_by(id=rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.merchant_key = body.merchant_key
    rule.default_category = body.default_category
    rule.default_participants_json = body.default_participants_json
    rule.default_split_method_json = body.default_split_method_json
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/merchant-rules/{rule_id}")
def delete_merchant_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(MerchantRule).filter_by(id=rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
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
    db: Session = Depends(get_db),
):
    """
    Compute who owes whom.

    payer_member_id: The person who paid the credit card bill.
    statement_id (optional): Limit to one statement; if omitted, settles all.
    """
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
    db: Session = Depends(get_db),
):
    """Export settlement as a downloadable CSV file."""
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
    db: Session = Depends(get_db),
):
    """Export settlement as a downloadable JSON file."""
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
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health")
def health():
    return {"status": "ok", "service": "AutoSplit API"}
