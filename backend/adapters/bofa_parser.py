"""
Bank of America Credit Card PDF Parser.

BofA statements have a distinct two-date format per transaction row:
  Transaction Date, Posting Date, Description, Reference#, Account#, Amount

Key features of the BofA PDF layout:
  - Period header: "February 21 - March 20, 2026" (full month names, 4-digit year)
  - Transaction rows have TWO dates: transaction date and posting date (both MM/DD)
  - Each row ends with: 4-digit reference number, 4-digit account suffix, amount
  - Positive amounts = purchases (we want these)
  - Negative amounts = payments and credits (we skip these)
  - Zero amounts = interest lines (we skip these)

Example transaction rows (from "Purchases and Adjustments" section):
  02/27 02/27 SHARETHEMEAL WFPUSA SHARETHEMEAL.DC 8222 7719 15.00
  03/02 03/03 Google FI Mw9Cv8 650-2530000 CA 6079 7719 79.76
  03/06 03/07 Audible*OJ6XM5S53 Amzn.com/billNJ 9445 7719 14.95

Example payment rows (SKIPPED — negative amounts):
  03/11 03/11 GOOGLE *Google One 855-836-3987 CA 4022 7719 -1.81
  03/17 03/17 ONLINE PAYMENT FROM CHK 3532 9201 7719 -310.56

Example interest rows (SKIPPED — zero amounts):
  03/20 03/20 INTEREST CHARGED ON PURCHASES 0.00
"""

import re
import io
import hashlib
from datetime import date, datetime
from typing import Optional, List, Tuple

import pdfplumber

# Reuse the same data classes as chase_parser.py
from adapters.chase_parser import ParsedTransaction, ParsedStatement, _infer_year


# ─── Transaction Line Pattern ─────────────────────────────────────────────────

# Matches a BofA transaction line like:
#   "02/27 02/27 SHARETHEMEAL WFPUSA SHARETHEMEAL.DC 8222 7719 15.00"
#   "03/07 03/07 XFINITY MOBILE 888-936-4968 PA 4153 7719 24.52"
#
# The pattern reads:
#   1. Transaction date: MM/DD
#   2. Posting date: MM/DD  ← we use this as the "posted_date" (consistent with CSV)
#   3. Description: everything between posting date and the two 4-digit numbers
#      (lazy match so it stops before the reference + account number fields)
#   4. Reference number: exactly 4 digits
#   5. Account suffix: exactly 4 digits (last 4 digits of the card number)
#   6. Amount: positive for purchases, negative for payments/credits
TXN_LINE_PATTERN = re.compile(
    r'^(\d{2}/\d{2})\s+'           # transaction date MM/DD
    r'(\d{2}/\d{2})\s+'            # posting date MM/DD (used as posted_date)
    r'(.+?)\s+'                     # description (lazy — stops before ref+acct+amount)
    r'(\d{4})\s+'                   # 4-digit reference number
    r'(\d{4})\s+'                   # 4-digit account suffix
    r'(-?[\d,]+\.\d{2})\s*$'       # amount (negative = payment, positive = purchase)
)


# ─── Period Header Parser ─────────────────────────────────────────────────────

# Month name → number lookup
_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_period_header(text: str) -> Tuple[Optional[date], Optional[date]]:
    """
    Extract the billing period from BofA's header line like:
    "February 21 - March 20, 2026"

    Returns (period_start, period_end) as date objects, or (None, None).

    Handles the Dec→Jan cross-year case:
    "December 15 - January 14, 2027" → Dec 15 2026, Jan 14 2027
    (The year after the comma always belongs to the end month.)
    """
    pattern = re.compile(
        r'(\w+)\s+(\d{1,2})\s*[-–]\s*(\w+)\s+(\d{1,2}),\s*(\d{4})',
        re.IGNORECASE,
    )
    m = pattern.search(text)
    if not m:
        return None, None

    start_month_name = m.group(1).lower()
    start_day = int(m.group(2))
    end_month_name = m.group(3).lower()
    end_day = int(m.group(4))
    end_year = int(m.group(5))

    start_month = _MONTH_NAMES.get(start_month_name)
    end_month = _MONTH_NAMES.get(end_month_name)

    if not start_month or not end_month:
        return None, None

    # If start month is later in the year than end month, the period crosses a
    # year boundary (e.g. December 15 → January 14 means Dec is in the prior year).
    start_year = end_year if start_month <= end_month else end_year - 1

    try:
        period_start = date(start_year, start_month, start_day)
        period_end = date(end_year, end_month, end_day)
        return period_start, period_end
    except ValueError:
        return None, None


def _make_txn_hash(date_str: str, description: str, amount: float) -> str:
    """Deduplication fingerprint."""
    key = f"{date_str}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ─── Main Parser ──────────────────────────────────────────────────────────────

def parse_bofa_pdf(file_bytes: bytes) -> ParsedStatement:
    """
    Parse a Bank of America credit card statement PDF.

    Strategy:
    1. Extract all text from every page
    2. Find the billing period ("February 21 - March 20, 2026") for year inference
    3. Scan every line for the dual-date transaction pattern
    4. Keep positive amounts (purchases), skip negative (payments) and zero (interest)
    5. Return a ParsedStatement with the same shape as parse_chase_pdf()
    """
    full_text = ""

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

    # Extract billing period — we need this before parsing transactions for year inference
    period_start, period_end = _parse_period_header(full_text)

    today = date.today()
    if not period_start:
        period_start = date(today.year, today.month, 1)
    if not period_end:
        period_end = today

    # ── Scan all lines for purchase transactions ──────────────────────────────
    transactions: List[ParsedTransaction] = []
    seen_hashes: set = set()

    for line in full_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        m = TXN_LINE_PATTERN.match(stripped)
        if not m:
            continue

        # We use posting date (group 2) as the authoritative date, consistent with BofA CSV exports
        posting_date_str = m.group(2)   # "02/27"
        description = m.group(3).strip()
        amount_str = m.group(6).replace(",", "")

        try:
            amount = float(amount_str)

            # Skip payments (negative) and interest/zero-amount rows
            if amount <= 0:
                continue

            # Infer the year from MM/DD using the billing period
            # This correctly handles the Dec→Jan year boundary
            month, day = map(int, posting_date_str.split("/"))
            year = _infer_year(month, day, period_start, period_end)
            full_date = f"{year}-{month:02d}-{day:02d}"

            txn_hash = _make_txn_hash(full_date, description, amount)
            if txn_hash in seen_hashes:
                continue
            seen_hashes.add(txn_hash)

            transactions.append(ParsedTransaction(
                posted_date=full_date,
                description_raw=description,
                amount=amount,
                txn_type="purchase",
                parse_confidence=1.0,
                txn_hash=txn_hash,
            ))

        except (ValueError, ZeroDivisionError):
            continue

    # Sort by date
    transactions.sort(key=lambda t: t.posted_date)

    # Use period_end as the statement date (analogous to the closing date)
    return ParsedStatement(
        statement_date=period_end.isoformat(),
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        transactions=transactions,
        raw_text=full_text,
    )
