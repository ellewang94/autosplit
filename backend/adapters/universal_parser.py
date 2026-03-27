"""
Universal Bank PDF Parser — handles any bank not specifically supported.

Rather than writing a dedicated parser for every US bank (there are hundreds),
this module uses heuristics to find transactions in ANY bank's PDF statement.

HOW IT WORKS:
  Every bank statement PDF has the same basic structure:
  - Each transaction lives on its own line
  - The line starts with a date (in one of a few standard formats)
  - The line ends with a dollar amount
  - The merchant description sits between the date and amount

  We scan every line in the PDF text looking for that pattern.
  Lines that look like balances, totals, or payments are filtered out.

BANKS THIS COVERS (beyond Chase/Amex/BofA which have dedicated parsers):
  - Citi (Citibank)
  - Capital One
  - Wells Fargo
  - US Bank
  - Discover
  - Synchrony (Amazon, PayPal, Walmart, etc.)
  - Barclays
  - Any other US or international card

LIMITATIONS:
  - Won't work on scanned image PDFs (no text to extract)
  - May miss transactions from PDFs with unusual column layouts
  - Very structured multi-column PDFs sometimes need a dedicated parser

DATE FORMATS HANDLED:
  MM/DD/YYYY  → most modern US banks (Citi, Capital One, Wells Fargo)
  MM/DD/YY    → Amex-style (usually caught by amex_parser before falling here)
  MM/DD       → BofA/Chase-style (uses statement period for year inference)
  YYYY-MM-DD  → rare but some banks use ISO format
"""

import re
import io
import hashlib
from datetime import date, datetime, timedelta
from typing import Optional, List, Tuple

import pdfplumber

from adapters.chase_parser import ParsedTransaction, ParsedStatement, _infer_year


# ─── Transaction Line Patterns ────────────────────────────────────────────────
# We try each pattern in order — more specific first.
# Each pattern captures: (date_string, description, amount_string)
#
# Key design choices:
# - (.+) is GREEDY — it grabs everything, then backtracks to find the final amount
#   This means "last number on the line" = amount, which is almost always right
# - \$? makes the $ optional (some banks omit it in PDF text extraction)
# - We only match POSITIVE amounts — negative amounts are credits/payments (skipped)

# Full 4-digit year: "01/15/2026 AMAZON.COM $45.00"
PATTERN_YYYY = re.compile(
    r'^(\d{2}/\d{2}/\d{4})\*?\s+'
    r'(.+)\s+'
    r'\$?([\d,]+\.\d{2})\s*$'
)

# 2-digit year: "01/15/26 AMAZON.COM $45.00"
PATTERN_YY = re.compile(
    r'^(\d{2}/\d{2}/\d{2})\*?\s+'
    r'(.+)\s+'
    r'\$?([\d,]+\.\d{2})\s*$'
)

# No year: "01/15 AMAZON.COM 45.00"
# Requires year inference from statement period.
# More conservative: needs at least 3 chars of description before amount.
PATTERN_NO_YEAR = re.compile(
    r'^(\d{2}/\d{2})\s+'
    r'(.{3,})\s+'             # description must be at least 3 chars (prevents false matches)
    r'\$?([\d,]+\.\d{2})\s*$'
)

# ISO date: "2026-01-15 AMAZON.COM 45.00"
PATTERN_ISO = re.compile(
    r'^(\d{4}-\d{2}-\d{2})\*?\s+'
    r'(.+)\s+'
    r'\$?([\d,]+\.\d{2})\s*$'
)

# All patterns grouped with their date format strings
# Each tuple: (compiled regex, strptime format, needs_year_inference)
ALL_PATTERNS = [
    (PATTERN_YYYY,    "%m/%d/%Y", False),
    (PATTERN_YY,      "%m/%d/%y", False),
    (PATTERN_ISO,     "%Y-%m-%d", False),
    (PATTERN_NO_YEAR, None,       True),   # needs year inference
]


# ─── Skip Filters ─────────────────────────────────────────────────────────────
# Lines whose descriptions match these patterns are NOT transactions —
# they're summaries, payment instructions, or balance lines.

SKIP_DESCRIPTION = re.compile(
    r'^('
    r'minimum payment|payment due|amount due|'
    r'total (due|new|purchases|payments|credits|charges|fees)|'
    r'(new|previous|current|statement|opening|closing|outstanding) balance|'
    r'interest charged|finance charge|'
    r'credit limit|available credit|available balance|'
    r'cash advance limit|'
    r'balance transfer|'
    r'year.to.date|ytd total'
    r')',
    re.IGNORECASE
)

# Amounts above this threshold are almost certainly account balances, not purchases.
# (A single transaction of $50,000+ is unusual enough to be a false positive risk)
MAX_REASONABLE_TRANSACTION = 15_000.00


# ─── Statement Period Detection ───────────────────────────────────────────────
# We try every known period format across all US banks.
# This is used when dates in the PDF have no year (MM/DD format).

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _find_statement_period(text: str) -> Tuple[Optional[date], Optional[date]]:
    """
    Try many known date range formats to find the statement's billing period.

    Returns (period_start, period_end) — or (None, None) if nothing found.
    Both values are date objects, not strings.

    We try formats used by Chase, Amex, BofA, and generic patterns so this
    works as a universal header reader for any bank.
    """
    # ── Pattern 1: Chase-style "MM/DD/YY - MM/DD/YY" or "MM/DD/YYYY - MM/DD/YYYY"
    m = re.search(
        r'(\d{2}/\d{2}/\d{2,4})\s*[-–to]+\s*(\d{2}/\d{2}/\d{2,4})',
        text
    )
    if m:
        d1 = _try_parse_date(m.group(1))
        d2 = _try_parse_date(m.group(2))
        if d1 and d2:
            return d1, d2

    # ── Pattern 2: BofA-style "February 21 - March 20, 2026"
    m = re.search(
        r'(\w+)\s+(\d{1,2})\s*[-–]\s*(\w+)\s+(\d{1,2}),\s*(\d{4})',
        text,
        re.IGNORECASE,
    )
    if m:
        sm = _MONTH_NAMES.get(m.group(1).lower())
        sd = int(m.group(2))
        em = _MONTH_NAMES.get(m.group(3).lower())
        ed = int(m.group(4))
        ey = int(m.group(5))
        if sm and em:
            sy = ey if sm <= em else ey - 1
            try:
                return date(sy, sm, sd), date(ey, em, ed)
            except ValueError:
                pass

    # ── Pattern 3: Amex-style "Closing Date MM/DD/YY"
    m = re.search(r'(?:closing|statement)\s*date[:\s]*(\d{2}/\d{2}/\d{2,4})', text, re.IGNORECASE)
    if m:
        d = _try_parse_date(m.group(1))
        if d:
            return d - timedelta(days=31), d

    # ── Pattern 4: Generic "Statement Period: MM/DD/YYYY - MM/DD/YYYY"
    m = re.search(
        r'(?:statement period|billing period|activity period)[:\s]+(\d{2}/\d{2}/\d{4})\s*[-–to]+\s*(\d{2}/\d{2}/\d{4})',
        text, re.IGNORECASE
    )
    if m:
        d1 = _try_parse_date(m.group(1))
        d2 = _try_parse_date(m.group(2))
        if d1 and d2:
            return d1, d2

    return None, None


def _try_parse_date(s: str) -> Optional[date]:
    """Try multiple date format strings and return the first that succeeds."""
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _make_txn_hash(date_str: str, description: str, amount: float) -> str:
    """Deduplication fingerprint."""
    key = f"{date_str}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ─── Main Parser ──────────────────────────────────────────────────────────────

def parse_universal_pdf(file_bytes: bytes) -> ParsedStatement:
    """
    Parse any bank's credit card statement PDF using heuristic pattern matching.

    This is the "catch-all" parser — it runs after the specific bank parsers
    have determined they don't recognize the bank. It handles Citi, Capital One,
    Wells Fargo, Discover, US Bank, and any other bank.

    Returns a ParsedStatement. May return fewer transactions than a dedicated
    parser if the PDF has an unusual layout, but covers the vast majority of cases.
    """
    full_text = ""

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

    # Find the statement period — needed for year inference on MM/DD format dates
    period_start, period_end = _find_statement_period(full_text)
    today = date.today()
    if not period_start:
        period_start = today - timedelta(days=31)
    if not period_end:
        period_end = today

    # ── Scan every line for transaction patterns ───────────────────────────────
    transactions: List[ParsedTransaction] = []
    seen_hashes: set = set()

    for line in full_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        txn = _try_parse_line(stripped, period_start, period_end)
        if txn and txn.txn_hash not in seen_hashes:
            transactions.append(txn)
            seen_hashes.add(txn.txn_hash)

    # Sort by date
    transactions.sort(key=lambda t: t.posted_date)

    return ParsedStatement(
        statement_date=period_end.isoformat(),
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        transactions=transactions,
        raw_text=full_text,
    )


def _try_parse_line(
    line: str,
    period_start: date,
    period_end: date,
) -> Optional[ParsedTransaction]:
    """
    Try to parse a single text line as a transaction.
    Returns None if the line doesn't look like a transaction.
    """
    for pattern, date_fmt, needs_year_inference in ALL_PATTERNS:
        m = pattern.match(line)
        if not m:
            continue

        date_str = m.group(1)
        description = m.group(2).strip()
        amount_str = m.group(3).replace(",", "")

        # ── Filter: skip non-transaction descriptions ──────────────────────────
        if not description or len(description) < 3:
            continue
        if SKIP_DESCRIPTION.match(description):
            continue

        # ── Parse amount ───────────────────────────────────────────────────────
        try:
            amount = float(amount_str)
        except ValueError:
            continue

        if amount <= 0:
            continue  # Skip credits, refunds, zero-amount rows
        if amount > MAX_REASONABLE_TRANSACTION:
            continue  # Likely a balance summary, not a purchase

        # ── Parse date and infer year if needed ────────────────────────────────
        try:
            if needs_year_inference:
                # MM/DD format — use the statement period to figure out the year
                month, day = map(int, date_str.split("/"))
                year = _infer_year(month, day, period_start, period_end)
                full_date = f"{year}-{month:02d}-{day:02d}"
            else:
                # Full date — parse directly
                parsed_date = datetime.strptime(date_str, date_fmt).date()
                full_date = parsed_date.isoformat()
        except (ValueError, TypeError):
            continue

        txn_hash = _make_txn_hash(full_date, description, amount)

        return ParsedTransaction(
            posted_date=full_date,
            description_raw=description,
            amount=amount,
            txn_type="purchase",
            # Universal parser is less confident than dedicated parsers since
            # we don't know the exact format — signal this to the import service
            # so uncertain transactions get flagged for user review.
            parse_confidence=0.85,
            txn_hash=txn_hash,
        )

    return None
