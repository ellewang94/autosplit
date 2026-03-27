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
import io
from sqlalchemy.orm import Session
from typing import Optional

import pdfplumber

from models.models import Statement, Transaction, MerchantRule, Member, Group
from adapters.chase_parser import parse_chase_pdf, ParsedStatement
from adapters.amex_parser import parse_amex_pdf
from adapters.bofa_parser import parse_bofa_pdf
from adapters.universal_parser import parse_universal_pdf
from adapters.csv_parser import parse_bank_csv
from domain.categories import categorize, suggest_participants, normalize_merchant_key


def _detect_pdf_bank(file_bytes: bytes) -> str:
    """
    Peek at the first page of a PDF to figure out which bank issued it.

    Returns one of: "amex", "bofa", "chase", or "unknown".
    "unknown" triggers the universal parser as a catch-all fallback.

    We check for distinctive phrases that appear on the first page of each
    bank's statements — these are reliable identifiers that won't change often.
    """
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            first_page_text = (pdf.pages[0].extract_text() or "").lower()
    except Exception:
        return "unknown"

    if "american express" in first_page_text or "americanexpress.com" in first_page_text:
        return "amex"
    elif "bank of america" in first_page_text or "bankofamerica.com" in first_page_text:
        return "bofa"
    elif "jpmorgan chase" in first_page_text or "chase.com" in first_page_text or "jpmorganchase" in first_page_text:
        return "chase"
    else:
        # Unknown bank — use the universal heuristic parser
        return "unknown"


def _save_parsed_statement(
    group_id: int,
    file_hash: str,
    parsed: ParsedStatement,
    db: Session,
    card_holder_member_id: Optional[int] = None,
    duplicate_message: str = "This file was already imported.",
    statement_currency: str = "USD",
    exchange_rate: Optional[float] = None,
) -> dict:
    """
    Shared core logic: take a ParsedStatement (from any parser — PDF or CSV)
    and save it to the database with categorization and date filtering applied.

    Extracted into its own function so both import_statement (PDF) and
    import_csv_statement (CSV) can reuse identical logic without duplication.
    """
    # ── Duplicate check ──────────────────────────────────────────────────────
    existing_stmt = db.query(Statement).filter_by(source_hash=file_hash).first()
    if existing_stmt:
        txn_count = db.query(Transaction).filter_by(statement_id=existing_stmt.id).count()
        return {
            "status": "duplicate",
            "statement_id": existing_stmt.id,
            "transaction_count": txn_count,
            "needs_review_count": 0,
            "excluded_by_date_count": 0,
            "message": duplicate_message,
        }

    # ── Save Statement record ─────────────────────────────────────────────────
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
    db.flush()

    # ── Load context for categorization ──────────────────────────────────────
    members = db.query(Member).filter_by(group_id=group_id).all()
    all_member_ids = [m.id for m in members]

    rules = {
        r.merchant_key: r
        for r in db.query(MerchantRule).filter_by(group_id=group_id).all()
    }

    # ── Determine currency conversion settings ────────────────────────────────
    # If the statement was made in a different currency than the group's base
    # (e.g. a Canadian friend uploads a CAD statement into a USD trip), we need
    # to convert every transaction to the base currency so settlement math works.
    group = db.query(Group).filter_by(id=group_id).first()
    base_currency = group.base_currency if group else "USD"
    needs_conversion = (
        statement_currency
        and statement_currency != base_currency
        and exchange_rate
        and exchange_rate > 0
    )

    # ── Save each transaction ─────────────────────────────────────────────────
    saved_count = 0
    needs_review_count = 0

    for parsed_txn in parsed.transactions:
        existing_txn = db.query(Transaction).filter_by(txn_hash=parsed_txn.txn_hash).first()
        if existing_txn:
            continue

        category, cat_confidence = categorize(parsed_txn.description_raw)
        overall_confidence = round(cat_confidence * parsed_txn.parse_confidence, 2)

        merchant_key = normalize_merchant_key(parsed_txn.description_raw)
        rule = rules.get(merchant_key)

        if rule:
            category = rule.default_category or category
            participants = rule.default_participants_json or suggest_participants(category, all_member_ids)
            split_method = rule.default_split_method_json or {"type": "equal"}
        else:
            participants = suggest_participants(category, all_member_ids)
            split_method = {"type": "equal"}

        if participants.get("type") in ("ask", "single") and not participants.get("member_ids"):
            needs_review_count += 1

        # Apply currency conversion if the statement is in a foreign currency.
        # Store the original amount so the UI can show "CA$45.00 (≈$33.50)".
        txn_amount = parsed_txn.amount
        txn_original_amount = None
        txn_currency = statement_currency or base_currency

        if needs_conversion:
            txn_original_amount = parsed_txn.amount           # keep the CAD/JPY/etc amount
            txn_amount = round(parsed_txn.amount * exchange_rate, 2)  # convert to base

        # ── Auto-confirm logic ─────────────────────────────────────────────────
        # If we're ≥90% confident about the category AND the transaction is
        # assigned to all members (no ambiguity about who splits it), there's
        # nothing for the user to review — we mark it "confirmed" immediately.
        #
        # Only transactions that are genuinely ambiguous — "ask" type (shopping,
        # unknown) or "single" type without a named person — stay "unreviewed"
        # and show up in the "Needs Review" queue.
        #
        # This dramatically reduces review friction: a typical dining-heavy
        # trip statement (Starbucks, Uber Eats, restaurants) will come in
        # almost fully confirmed, with only edge cases needing attention.
        auto_confirmed = (
            overall_confidence >= 0.9
            and participants.get("type") == "all"
        )
        txn_status = "confirmed" if auto_confirmed else "unreviewed"

        txn = Transaction(
            statement_id=stmt.id,
            posted_date=parsed_txn.posted_date,
            description_raw=parsed_txn.description_raw,
            amount=txn_amount,           # always in base currency after conversion
            txn_type=parsed_txn.txn_type,
            category=category,
            is_personal=False,
            participants_json=participants,
            split_method_json=split_method,
            overrides_json={},
            parse_confidence=overall_confidence,
            txn_hash=parsed_txn.txn_hash,
            status=txn_status,
            currency=txn_currency,
            original_amount=txn_original_amount,
        )
        db.add(txn)
        saved_count += 1

    # ── Apply trip date range filtering ───────────────────────────────────────
    db.flush()

    excluded_by_date_count = 0
    # `group` was already fetched above for currency — reuse it here
    if group and group.start_date and group.end_date:
        new_txns = db.query(Transaction).filter_by(statement_id=stmt.id).all()
        for txn in new_txns:
            if txn.posted_date < group.start_date or txn.posted_date > group.end_date:
                txn.status = "excluded"
                excluded_by_date_count += 1

    db.commit()

    msg = f"Imported {saved_count} transactions. {needs_review_count} need review."
    if excluded_by_date_count:
        msg += f" {excluded_by_date_count} outside trip dates were auto-excluded."

    return {
        "status": "imported",
        "statement_id": stmt.id,
        "transaction_count": saved_count,
        "needs_review_count": needs_review_count,
        "excluded_by_date_count": excluded_by_date_count,
        "message": msg,
    }


def import_statement(
    group_id: int,
    file_bytes: bytes,
    db: Session,
    card_holder_member_id: Optional[int] = None,
    statement_currency: str = "USD",
    exchange_rate: Optional[float] = None,
) -> dict:
    """
    Parse a bank PDF statement, auto-detect the bank, and save to DB.

    Supported banks: Chase, American Express, Bank of America.
    The bank is detected automatically from the PDF text — no need to tell us.

    Idempotent — re-uploading the same file returns the existing data.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # Auto-detect which bank's parser to use based on the PDF content.
    # Falls back to the universal heuristic parser for any unrecognized bank
    # (Citi, Capital One, Wells Fargo, Discover, US Bank, etc.)
    bank = _detect_pdf_bank(file_bytes)
    if bank == "amex":
        parsed = parse_amex_pdf(file_bytes)
    elif bank == "bofa":
        parsed = parse_bofa_pdf(file_bytes)
    elif bank == "chase":
        parsed = parse_chase_pdf(file_bytes)
    else:
        parsed = parse_universal_pdf(file_bytes)

    return _save_parsed_statement(
        group_id=group_id,
        file_hash=file_hash,
        parsed=parsed,
        db=db,
        card_holder_member_id=card_holder_member_id,
        duplicate_message="This PDF was already imported. Showing existing statement.",
        statement_currency=statement_currency,
        exchange_rate=exchange_rate,
    )


def import_csv_statement(
    group_id: int,
    file_bytes: bytes,
    db: Session,
    card_holder_member_id: Optional[int] = None,
    statement_currency: str = "USD",
    exchange_rate: Optional[float] = None,
) -> dict:
    """
    Parse a bank CSV export (Chase, Amex, BofA, Citi, Capital One, Discover),
    apply merchant rules + auto-categorization, and save to DB.

    Auto-detects the bank format from the CSV headers — the user doesn't need
    to tell us which bank it came from.

    Raises ValueError if the CSV format is unrecognized.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    parsed = parse_bank_csv(file_bytes)
    return _save_parsed_statement(
        group_id=group_id,
        file_hash=file_hash,
        parsed=parsed,
        db=db,
        card_holder_member_id=card_holder_member_id,
        duplicate_message="This CSV was already imported. Showing existing data.",
        statement_currency=statement_currency,
        exchange_rate=exchange_rate,
    )


def create_manual_transaction(
    group_id: int,
    posted_date: str,
    description: str,
    amount: float,
    paid_by_member_id: int,
    db: Session,
    category: Optional[str] = None,
    participants_json: Optional[dict] = None,
    split_method_json: Optional[dict] = None,
    currency: str = "USD",
    original_amount: Optional[float] = None,
    exchange_rate: Optional[float] = None,
) -> dict:
    """
    Add a single manually-entered expense to a group without any bank statement.

    How this works without changing the data model:
    ─────────────────────────────────────────────
    Every Transaction must belong to a Statement (that's how the DB is wired).
    For manual entries we create a "virtual" statement per payer — a container
    that exists purely to hold manual expenses. Think of it as an invisible
    envelope labelled "Stuff [member] paid for manually."

    The virtual statement has a predictable source_hash so we can look it up
    quickly and never create duplicates.

    Because each payer gets their own virtual statement with card_holder set to
    that payer, the existing settlement logic works perfectly with zero changes:
    it already handles multiple statements with different card holders.
    """
    import hashlib

    # ── Find or create the virtual "Manual Expenses" statement for this payer ──
    # source_hash is a stable key so we always find the same statement
    virtual_hash = f"manual:{group_id}:{paid_by_member_id}"

    stmt = db.query(Statement).filter_by(source_hash=virtual_hash).first()
    if not stmt:
        stmt = Statement(
            group_id=group_id,
            source_hash=virtual_hash,
            card_holder_member_id=paid_by_member_id,
            raw_text="Manual expenses",
            statement_date=None,
            period_start=None,
            period_end=None,
        )
        db.add(stmt)
        db.flush()

    # ── Multi-currency conversion ──────────────────────────────────────────────
    # If the expense was charged in a different currency than the group's base currency,
    # we need to convert it so settlement math works correctly.
    #
    # Example: user enters ¥5,000 JPY with an exchange rate of 0.0067
    #   → original_amount = 5000 (we remember the ¥ amount for display)
    #   → amount = 5000 * 0.0067 = $33.50 (this is what gets used in settlement)
    group = db.query(Group).filter_by(id=group_id).first()
    base_currency = group.base_currency if group else "USD"

    if currency and currency != base_currency and exchange_rate:
        # Store the foreign-currency amount before conversion so we can show it in the UI
        original_amount = amount
        # Convert to base currency for settlement calculations
        amount = round(amount * exchange_rate, 2)
    elif currency == base_currency:
        # Same currency — no conversion needed, original_amount stays null
        original_amount = None

    # ── Auto-detect category if not provided ──────────────────────────────────
    if not category:
        category, _ = categorize(description)

    # ── Determine who splits this expense ─────────────────────────────────────
    members = db.query(Member).filter_by(group_id=group_id).all()
    all_member_ids = [m.id for m in members]

    if not participants_json:
        participants_json = suggest_participants(category, all_member_ids)

    if not split_method_json:
        split_method_json = {"type": "equal"}

    # ── Build a unique hash for deduplication ─────────────────────────────────
    # We add "|manual" so the same expense entered via CSV and manually
    # doesn't collide (different sources, different intent)
    key = f"{posted_date}|{description.lower().strip()}|{amount:.2f}|manual:{paid_by_member_id}"
    txn_hash = hashlib.sha256(key.encode()).hexdigest()[:16]

    # Prevent exact duplicate manual entries
    existing = db.query(Transaction).filter_by(txn_hash=txn_hash).first()
    if existing:
        return {
            "transaction_id": existing.id,
            "statement_id": stmt.id,
            "message": "This expense already exists.",
        }

    # ── Save the transaction ──────────────────────────────────────────────────
    txn = Transaction(
        statement_id=stmt.id,
        posted_date=posted_date,
        description_raw=description,
        amount=amount,                   # always in base currency (converted above if needed)
        txn_type="purchase",
        category=category,
        is_personal=False,
        participants_json=participants_json,
        split_method_json=split_method_json,
        overrides_json={},
        parse_confidence=1.0,
        txn_hash=txn_hash,
        # Manual entries start as "confirmed" — the user knows exactly what they're adding
        status="confirmed",
        # Multi-currency: store what currency it was charged in + original amount
        currency=currency or base_currency,
        original_amount=original_amount,  # null if same currency as group base
    )
    db.add(txn)
    db.commit()

    return {
        "transaction_id": txn.id,
        "statement_id": stmt.id,
        "message": f"Added: {description} ({base_currency} {amount:.2f})",
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
