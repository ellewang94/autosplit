"""
Import Service — orchestrates the PDF upload flow.

This is the "use case" layer. It coordinates between:
- The Chase PDF adapter (parsing)
- The domain layer (categorization, participant suggestions)
- The database (saving results)

A "use case" is a specific thing the user wants to do: "upload a statement."
Keeping this separate from the API routes means we can test it without HTTP.
"""

import hashlib
from sqlalchemy.orm import Session
from typing import Optional

from models.models import Statement, Transaction, MerchantRule, Member
from adapters.chase_parser import parse_chase_pdf
from domain.categories import categorize, suggest_participants, normalize_merchant_key


def import_statement(
    group_id: int,
    file_bytes: bytes,
    db: Session,
    card_holder_member_id: Optional[int] = None,
) -> dict:
    """
    Parse a Chase PDF, apply merchant rules + auto-categorization, and save to DB.

    Returns a dict with status info:
      {"status": "imported", "statement_id": 5, "transaction_count": 42, ...}
      {"status": "duplicate", "statement_id": 3, ...}

    Idempotency: we hash the entire file. If we've seen this exact file before,
    we return the existing statement without re-importing.
    """

    # ── Step 1: Check for duplicate upload ──────────────────────────────────
    # SHA-256 of the entire file bytes = unique fingerprint
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    existing_stmt = db.query(Statement).filter_by(source_hash=file_hash).first()
    if existing_stmt:
        txn_count = db.query(Transaction).filter_by(statement_id=existing_stmt.id).count()
        return {
            "status": "duplicate",
            "statement_id": existing_stmt.id,
            "transaction_count": txn_count,
            "needs_review_count": 0,
            "message": "This PDF was already imported. Showing existing statement.",
        }

    # ── Step 2: Parse the PDF ────────────────────────────────────────────────
    parsed = parse_chase_pdf(file_bytes)

    # ── Step 3: Save the Statement record ───────────────────────────────────
    stmt = Statement(
        group_id=group_id,
        statement_date=parsed.statement_date,
        period_start=parsed.period_start,
        period_end=parsed.period_end,
        source_hash=file_hash,
        raw_text=parsed.raw_text,
        card_holder_member_id=card_holder_member_id,
    )
    db.add(stmt)
    db.flush()  # Gets stmt.id without committing — like saving a draft

    # ── Step 4: Load context for categorization ──────────────────────────────
    # Get all group members so we can suggest "all members" for shared expenses
    members = db.query(Member).filter_by(group_id=group_id).all()
    all_member_ids = [m.id for m in members]

    # Load existing merchant rules so we can auto-apply known overrides
    rules = {
        r.merchant_key: r
        for r in db.query(MerchantRule).filter_by(group_id=group_id).all()
    }

    # ── Step 5: Save each parsed transaction ────────────────────────────────
    saved_count = 0
    needs_review_count = 0

    for parsed_txn in parsed.transactions:
        # Per-transaction idempotency: if we somehow see the same hash, skip it
        # (This can happen if the file hash changed but transaction content is same)
        existing_txn = db.query(Transaction).filter_by(txn_hash=parsed_txn.txn_hash).first()
        if existing_txn:
            continue

        # Auto-categorize from merchant description
        category, cat_confidence = categorize(parsed_txn.description_raw)
        overall_confidence = round(cat_confidence * parsed_txn.parse_confidence, 2)

        # Check if we have a saved merchant rule for this merchant
        merchant_key = normalize_merchant_key(parsed_txn.description_raw)
        rule = rules.get(merchant_key)

        if rule:
            # Apply saved rule — user's preference from a previous import
            category = rule.default_category or category
            participants = rule.default_participants_json or suggest_participants(category, all_member_ids)
            split_method = rule.default_split_method_json or {"type": "equal"}
        else:
            # Auto-suggest based on category
            participants = suggest_participants(category, all_member_ids)
            split_method = {"type": "equal"}

        # Track how many transactions need human review
        if participants.get("type") in ("ask", "single") and not participants.get("member_ids"):
            needs_review_count += 1

        txn = Transaction(
            statement_id=stmt.id,
            posted_date=parsed_txn.posted_date,
            description_raw=parsed_txn.description_raw,
            amount=parsed_txn.amount,
            txn_type=parsed_txn.txn_type,
            category=category,
            is_personal=False,
            participants_json=participants,
            split_method_json=split_method,
            overrides_json={},
            parse_confidence=overall_confidence,
            txn_hash=parsed_txn.txn_hash,
        )
        db.add(txn)
        saved_count += 1

    db.commit()

    return {
        "status": "imported",
        "statement_id": stmt.id,
        "transaction_count": saved_count,
        "needs_review_count": needs_review_count,
        "message": f"Imported {saved_count} transactions. {needs_review_count} need review.",
    }


def save_merchant_rule(
    group_id: int,
    transaction_id: int,
    db: Session,
    merchant_key_override: Optional[str] = None,
) -> dict:
    """
    Save the current settings of a transaction as a merchant rule.

    Next time a transaction from this merchant is imported, it will
    automatically get the same category, participants, and split method.
    """
    txn = db.query(Transaction).filter_by(id=transaction_id).first()
    if not txn:
        raise ValueError(f"Transaction {transaction_id} not found")

    # Compute merchant key from the raw description
    merchant_key = merchant_key_override or normalize_merchant_key(txn.description_raw)

    # Upsert the rule (update if exists, create if not)
    rule = db.query(MerchantRule).filter_by(
        group_id=group_id, merchant_key=merchant_key
    ).first()

    if rule:
        rule.default_category = txn.category
        rule.default_participants_json = txn.participants_json
        rule.default_split_method_json = txn.split_method_json
    else:
        rule = MerchantRule(
            group_id=group_id,
            merchant_key=merchant_key,
            default_category=txn.category,
            default_participants_json=txn.participants_json,
            default_split_method_json=txn.split_method_json,
        )
        db.add(rule)

    db.commit()
    return {"merchant_key": merchant_key, "rule_id": rule.id}
