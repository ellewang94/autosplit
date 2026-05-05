"""
Recurring-expense catch-up generator.

Templates live in the recurring_expenses table. On every transactions-list
fetch we run this catch-up: for each active template in the group, generate
any missing past instances up to today and bump last_generated_date.

Why lazy generation (instead of a cron):
- Zero new infra. We use the request that's already happening.
- Self-healing: a backend cold-start doesn't miss anything; the next read
  fills in the gap.
- Predictable: no race condition with a scheduled job. The user only ever
  sees a fully-caught-up state.

Limits:
- Caps at 24 generations per template per call. Prevents a runaway loop
  if start_date is set to 1900 by mistake.
- We use the manual-statement container as the parent for generated rows,
  so they're indistinguishable from manually-entered transactions in the
  UI (intentional — they show up as normal expenses).
"""

import calendar
import hashlib
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from models.models import RecurringExpense, Transaction, Statement


_MAX_GENERATIONS_PER_CALL = 24


def _parse_iso(s: str) -> date:
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))


def _next_due_after(prev: date, day_of_month: int) -> date:
    """
    The next date a 'monthly on day_of_month' schedule produces, AFTER `prev`.
    Day-of-month is capped at 28 by the API so we don't need fall-back-to-
    last-day logic, but we still clamp defensively.
    """
    target_day = max(1, min(day_of_month, 28))
    # Move to the month after `prev`'s month (or same month if before target_day)
    if prev.day < target_day:
        # Same month, just adjust the day
        return prev.replace(day=target_day)
    # Next month
    if prev.month == 12:
        return date(prev.year + 1, 1, target_day)
    return date(prev.year, prev.month + 1, target_day)


def _ensure_manual_statement_for_payer(group_id: int, paid_by_member_id: int, db: Session) -> Statement:
    """
    Find or create the per-(group, payer) virtual manual statement that
    holds expenses paid by a specific person. Mirrors what
    create_manual_transaction does in import_service so settlement math
    treats recurring expenses identically to manual ones.

    Each payer gets their own statement keyed by source_hash so the
    settlement layer's `statement_payers` map looks up the correct
    member without any extra wiring.
    """
    virtual_hash = f"manual:{group_id}:{paid_by_member_id}"
    stmt = db.query(Statement).filter_by(source_hash=virtual_hash).first()
    if stmt:
        return stmt
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
    return stmt


def generate_due_for_group(group_id: int, db: Session, today: Optional[date] = None) -> List[Transaction]:
    """
    Generate any missing recurring transactions for this group up to `today`.

    Returns the list of newly-generated Transaction rows (empty if nothing
    was due). Idempotent: subsequent calls with no new dates produce nothing.
    """
    today = today or date.today()
    templates = (
        db.query(RecurringExpense)
        .filter_by(group_id=group_id, active=True)
        .all()
    )
    created: List[Transaction] = []

    for tpl in templates:
        # Where do we resume from? If we've never generated, start from start_date;
        # otherwise from the day after last_generated_date.
        if tpl.last_generated_date:
            cursor = _parse_iso(tpl.last_generated_date)
        else:
            cursor = _parse_iso(tpl.start_date) - timedelta(days=1)

        manual_stmt = None  # lazy — only create if we actually generate
        loops = 0

        while loops < _MAX_GENERATIONS_PER_CALL:
            next_due = _next_due_after(cursor, tpl.day_of_month)
            if next_due > today:
                break  # not due yet
            # Don't generate a date earlier than the template's start_date
            start = _parse_iso(tpl.start_date)
            if next_due < start:
                cursor = next_due
                continue

            if manual_stmt is None:
                manual_stmt = _ensure_manual_statement_for_payer(tpl.group_id, tpl.paid_by_member_id, db)

            posted_date_str = next_due.isoformat()

            # Build a stable hash so repeated catch-up runs never duplicate
            # the same instance (defense in depth alongside last_generated_date).
            key = f"recurring:{tpl.id}:{posted_date_str}"
            txn_hash = hashlib.sha256(key.encode()).hexdigest()[:16]

            existing = db.query(Transaction).filter_by(txn_hash=txn_hash).first()
            if not existing:
                txn = Transaction(
                    statement_id=manual_stmt.id,
                    posted_date=posted_date_str,
                    description_raw=tpl.name,
                    amount=tpl.amount,
                    currency=tpl.currency or "USD",
                    txn_type="purchase",
                    category=tpl.category,
                    is_personal=False,
                    participants_json=tpl.participants_json,
                    split_method_json=tpl.split_method_json or {"type": "equal"},
                    overrides_json={},
                    parse_confidence=1.0,
                    txn_hash=txn_hash,
                    status="confirmed",  # recurring expenses are pre-approved by the user
                )
                db.add(txn)
                db.flush()
                created.append(txn)

            tpl.last_generated_date = posted_date_str
            cursor = next_due
            loops += 1

    if created or any(t.last_generated_date for t in templates):
        db.commit()
    return created
