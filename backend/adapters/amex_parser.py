"""
American Express Credit Card PDF Parser.

Amex statements have a very different layout from Chase PDFs.
Key differences:
  - Dates are MM/DD/YY (two-digit year, not four)
  - Amounts are prefixed with "$" and suffixed with "⧫" for Pay Over Time charges
  - Payments and credits are printed with a MINUS sign (-$614.63)
  - Charges/purchases are printed as positive ($9.00, $210.00, etc.)
  - The statement has "Closing Date MM/DD/YY" near the top

What we import:
  - All lines that look like: "MM/DD/YY DESCRIPTION $AMOUNT[⧫]"
  - This captures "New Charges" and "Fees" naturally
  - Payments/credits have "-$amount" so they don't match our positive-amount pattern

Example charge lines:
  02/14/26 BACKHAUS BURLINGAME CA $9.00⧫
  03/08/26 TST* HAPA BISTRO 00235066 SAN BRUNO CA $210.00⧫
  03/09/26 Late Payment Fee $29.00
  03/15/26 ANNUAL FEE $695.00⧫

Example credit lines (SKIPPED — negative sign):
  03/13/26* ONLINE PAYMENT - THANK YOU -$614.63
  03/01/26 AMEX CLEAR PLUS CREDIT -$209.00⧫
"""

import re
import io
import hashlib
from datetime import date, datetime, timedelta
from typing import Optional, List

import pdfplumber

# Reuse the same data classes as chase_parser.py — same API, different parser
from adapters.chase_parser import ParsedTransaction, ParsedStatement, _infer_year


# ─── Transaction Line Pattern ─────────────────────────────────────────────────

# Matches a charge line like:
#   "02/14/26 BACKHAUS BURLINGAME CA $9.00⧫"
#   "03/08/26* TST* HAPA BISTRO 00235066 SAN BRUNO CA $210.00⧫"
#   "03/09/26 Late Payment Fee $29.00"
#
# The "*" after the date is an optional Amex "posting date" indicator — ignore it.
# The "⧫" after the amount marks Pay Over Time charges — we capture but ignore it.
# We intentionally do NOT match lines with negative amounts (-$614.63 = payments).
TXN_LINE_PATTERN = re.compile(
    r'^(\d{2}/\d{2}/\d{2})\*?\s+'     # MM/DD/YY date (optional * = posting indicator)
    r'(.+)\s+'                          # description (greedy, backtracks to find $amount)
    r'\$(\d[\d,]*\.\d{2})(?:\u29eb)?\s*$'  # positive $ amount; ⧫ (U+29EB) = optional
)


# ─── Header Parsers ───────────────────────────────────────────────────────────

def _parse_closing_date(text: str) -> Optional[date]:
    """
    Extract the statement closing date from text like "Closing Date03/15/26".
    Amex prints this with no space between the label and the date.
    """
    m = re.search(r'Closing\s*Date\s*(\d{2}/\d{2}/\d{2})', text)
    if m:
        try:
            return datetime.strptime(m.group(1), "%m/%d/%y").date()
        except ValueError:
            pass
    return None


def _make_txn_hash(date_str: str, description: str, amount: float) -> str:
    """Deduplication fingerprint — same as chase_parser but in this module."""
    key = f"{date_str}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ─── Main Parser ──────────────────────────────────────────────────────────────

def parse_amex_pdf(file_bytes: bytes) -> ParsedStatement:
    """
    Parse an American Express credit card statement PDF.

    Strategy:
    1. Extract all text from every page
    2. Find the closing date (to infer the year for MM/DD/YY dates)
    3. Scan every line for the charge pattern (positive $ amount)
    4. Skip anything with a negative amount (payments, credits)
    5. Return a ParsedStatement with the same shape as parse_chase_pdf()
    """
    full_text = ""

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

    # Find the statement closing date — used as period_end and for year inference
    closing_date = _parse_closing_date(full_text)
    today = date.today()
    if not closing_date:
        # Fallback: use today as closing date if we can't find it
        closing_date = today

    # Estimate period_start = closing_date minus one full billing cycle (31 days).
    # This is approximate — Amex doesn't print the period start explicitly.
    # We use it only for year inference on the Dec→Jan boundary.
    period_start = closing_date - timedelta(days=31)
    period_end = closing_date

    # ── Scan all lines for charge transactions ────────────────────────────────
    transactions: List[ParsedTransaction] = []
    seen_hashes: set = set()

    for line in full_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        m = TXN_LINE_PATTERN.match(stripped)
        if not m:
            continue

        date_str = m.group(1)   # "02/14/26"
        description = m.group(2).strip()
        amount_str = m.group(3).replace(",", "")

        try:
            # Parse the two-digit year correctly using Python's %y format
            # Python interprets 00-68 as 2000-2068 and 69-99 as 1969-1999
            txn_date = datetime.strptime(date_str, "%m/%d/%y").date()
            month = txn_date.month
            day = txn_date.day
            amount = float(amount_str)

            if amount <= 0:
                continue  # Skip anything that slipped through as zero or negative

            # Use _infer_year to handle Dec→Jan boundary correctly
            # (e.g. closing date is Jan 9, but a Dec 28 charge was in the previous year)
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

    return ParsedStatement(
        statement_date=closing_date.isoformat(),
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        transactions=transactions,
        raw_text=full_text,
        bank_name="American Express",
    )
