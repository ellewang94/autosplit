"""
Chase Credit Card PDF Parser.

This is the "adapter" layer — it knows how to read Chase-specific PDFs
and translate them into generic ParsedTransaction objects. If we ever add
Bank of America or Amex support, we'd write new files here (not change this one).

The key challenges with Chase PDFs:
1. Dates are MM/DD with no year — we must infer the year from the statement period
2. The Dec→Jan boundary: a Jan statement might have Dec transactions
3. Transactions are in a specific "PURCHASE" section — we ignore everything else
4. pdfplumber extracts text that may have formatting artifacts

Approach: extract full text, find the PURCHASE section, apply regex per line.
We also try pdfplumber's table extractor as a fallback.
"""

import re
import hashlib
import io
from datetime import date, datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, List, Tuple

import pdfplumber


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class ParsedTransaction:
    """A single transaction extracted from the PDF."""
    posted_date: str        # ISO format: "2026-01-15"
    description_raw: str    # Exactly as printed on the statement
    amount: float
    txn_type: str = "purchase"
    parse_confidence: float = 1.0
    txn_hash: str = ""      # fingerprint for idempotency


@dataclass
class ParsedStatement:
    """Everything we extracted from one PDF upload."""
    statement_date: Optional[str]  # ISO format or None
    period_start: Optional[str]    # ISO format or None
    period_end: Optional[str]      # ISO format or None
    transactions: List[ParsedTransaction] = field(default_factory=list)
    raw_text: str = ""


# ─── Date Helpers ─────────────────────────────────────────────────────────────

def _parse_date_flexible(s: str) -> Optional[date]:
    """Parse a date string in MM/DD/YY or MM/DD/YYYY format."""
    for fmt in ["%m/%d/%y", "%m/%d/%Y"]:
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _parse_date_range(text: str) -> Tuple[Optional[date], Optional[date]]:
    """
    Find the statement period from text like "01/09/26 - 02/08/26".
    Chase statements usually print this near the top of the first page.
    """
    # Matches: MM/DD/YY - MM/DD/YY or MM/DD/YYYY - MM/DD/YYYY
    pattern = r'(\d{2}/\d{2}/\d{2,4})\s*[-–to]+\s*(\d{2}/\d{2}/\d{2,4})'
    match = re.search(pattern, text)
    if not match:
        return None, None
    return _parse_date_flexible(match.group(1)), _parse_date_flexible(match.group(2))


def _parse_statement_date(text: str) -> Optional[date]:
    """Extract the statement/closing date from header text."""
    # Chase prints "Statement Date 02/08/26" or "Closing Date: 02/08/26"
    patterns = [
        r'(?:Statement|Closing)\s+[Dd]ate[:\s]+(\d{2}/\d{2}/\d{2,4})',
        r'(?:STATEMENT|CLOSING)\s+DATE[:\s]+(\d{2}/\d{2}/\d{2,4})',
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return _parse_date_flexible(m.group(1))
    return None


def _infer_year(month: int, day: int, period_start: date, period_end: date) -> int:
    """
    Given a transaction's MM/DD and the statement period, figure out the correct year.

    This is the tricky Dec/Jan boundary case:
    - Statement period: Dec 10 – Jan 9 (crosses year boundary)
    - A transaction dated "01/05" is in January of the NEW year
    - A transaction dated "12/15" is in December of the OLD year

    Strategy: try the year of period_end first, then period_start.
    Pick whichever makes the date fall inside (or close to) the statement period.
    """
    candidates = []

    # Try both years (period_start.year and period_end.year may differ)
    for year in sorted(set([period_start.year, period_end.year])):
        try:
            d = date(year, month, day)
            candidates.append(d)
        except ValueError:
            pass  # Invalid date (e.g., Feb 30) — skip

    if not candidates:
        return period_end.year

    # Add a generous 10-day buffer around the period to catch edge cases
    buffer_start = period_start - timedelta(days=10)
    buffer_end = period_end + timedelta(days=10)

    # Prefer a date that falls within the buffered period
    for candidate in candidates:
        if buffer_start <= candidate <= buffer_end:
            return candidate.year

    # If none fall in range, pick the one closest to the midpoint of the period
    midpoint = period_start + (period_end - period_start) / 2
    best = min(candidates, key=lambda d: abs((d - midpoint).days))
    return best.year


def _make_txn_hash(date_str: str, description: str, amount: float) -> str:
    """
    Create a short hash fingerprint for deduplication.
    Same date + same merchant + same amount = same hash = don't import twice.
    """
    key = f"{date_str}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ─── Main Parser ──────────────────────────────────────────────────────────────

# Pattern for a standard Chase transaction line:
# "01/15    AMAZON.COM*1A2B3C    SEATTLE WA    $45.00"
# or without dollar sign:
# "01/15    WHOLE FOODS MARKET 123    NEW YORK NY    123.45"
TXN_LINE_PATTERN = re.compile(
    r'^(\d{2}/\d{2})\s{2,}'      # MM/DD followed by 2+ spaces
    r'(.+?)\s{2,}'                # merchant name (greedy, stops at 2+ spaces)
    r'\$?([\d,]+\.\d{2})\s*$'    # amount (optional $, commas allowed)
)

# Alternative: some Chase layouts use a single space before the amount
TXN_LINE_PATTERN_LOOSE = re.compile(
    r'^(\d{2}/\d{2})\s+'          # MM/DD + whitespace
    r'(.+?)\s+'                    # merchant name
    r'\$?([\d,]+\.\d{2})\s*$'    # amount
)

# Section header markers — we start capturing when we hit PURCHASE(S)
PURCHASE_SECTION_MARKERS = re.compile(
    r'PURCHASE[S]?\s*$|ACCOUNT\s+ACTIVITY|purchases\s+and\s+other\s+charges',
    re.IGNORECASE
)

# We stop capturing when we hit these sections
STOP_SECTION_MARKERS = re.compile(
    r'^(FEES\s+CHARGED|INTEREST\s+CHARGED|PAYMENT|CASH\s+ADVANCE|'
    r'ACCOUNT\s+SUMMARY|IMPORTANT\s+NOTICE|PLEASE\s+SEE|MINIMUM\s+PAYMENT)',
    re.IGNORECASE
)


def _parse_text_transactions(
    text: str,
    period_start: date,
    period_end: date,
) -> List[ParsedTransaction]:
    """
    Extract transactions from raw text using regex.
    Only captures lines within the PURCHASE section.
    """
    transactions = []
    lines = text.split('\n')
    in_purchase_section = False
    seen_hashes: set = set()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Check if we're entering the purchase section
        if PURCHASE_SECTION_MARKERS.search(stripped):
            in_purchase_section = True
            continue

        # Check if we're leaving the purchase section
        if in_purchase_section and STOP_SECTION_MARKERS.match(stripped):
            # Only exit if it looks like a section header (short, no date prefix)
            if len(stripped) < 60 and not re.match(r'^\d{2}/\d{2}', stripped):
                in_purchase_section = False
                continue

        if not in_purchase_section:
            continue

        # Try strict pattern first, then loose pattern
        match = TXN_LINE_PATTERN.match(stripped)
        confidence = 1.0
        if not match:
            match = TXN_LINE_PATTERN_LOOSE.match(stripped)
            confidence = 0.85

        if not match:
            continue

        date_str = match.group(1)
        description = match.group(2).strip()
        amount_str = match.group(3).replace(',', '')

        # Skip if description looks like a section header or total line
        if re.match(r'(total|subtotal|balance|payment|fee)', description, re.IGNORECASE):
            continue

        try:
            month, day = map(int, date_str.split('/'))
            amount = float(amount_str)
            if amount <= 0:
                continue

            year = _infer_year(month, day, period_start, period_end)
            full_date = f"{year}-{month:02d}-{day:02d}"
            txn_hash = _make_txn_hash(full_date, description, amount)

            # Avoid duplicates within this parse run
            if txn_hash in seen_hashes:
                continue
            seen_hashes.add(txn_hash)

            transactions.append(ParsedTransaction(
                posted_date=full_date,
                description_raw=description,
                amount=amount,
                txn_type="purchase",
                parse_confidence=confidence,
                txn_hash=txn_hash,
            ))
        except (ValueError, ZeroDivisionError):
            continue

    return transactions


def _parse_table_transactions(
    tables: list,
    period_start: date,
    period_end: date,
) -> List[ParsedTransaction]:
    """
    Attempt to extract transactions from pdfplumber's table extraction.
    Chase statements often render as tables internally.

    Each row might look like: ['01/15', 'AMAZON.COM', '45.00']
    or: ['01/15', 'AMAZON.COM', '01/15', '45.00'] (with a "posted date" column)
    """
    transactions = []
    seen_hashes: set = set()

    for table in tables:
        for row in (table or []):
            if not row or len(row) < 2:
                continue

            # The first cell should be a date MM/DD or MM/DD/YY
            first_cell = (row[0] or '').strip()
            date_match = re.match(r'^(\d{2}/\d{2})(?:/\d{2,4})?$', first_cell)
            if not date_match:
                continue

            date_str = date_match.group(1)

            # Find the amount cell — it's usually the last non-empty cell
            amount_cell = None
            for cell in reversed(row):
                if cell and re.match(r'^\$?[\d,]+\.\d{2}$', (cell or '').strip()):
                    amount_cell = cell.strip().replace('$', '').replace(',', '')
                    break

            if not amount_cell:
                continue

            # Description is everything between date and amount
            # Concatenate middle cells
            description_parts = []
            for cell in row[1:]:
                if cell and cell.strip() != amount_cell and not re.match(r'^\d{2}/\d{2}', (cell or '')):
                    description_parts.append(cell.strip())
            description = ' '.join(p for p in description_parts if p)

            if not description:
                continue

            try:
                month, day = map(int, date_str.split('/'))
                amount = float(amount_cell)
                if amount <= 0:
                    continue

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
                    parse_confidence=0.9,
                    txn_hash=txn_hash,
                ))
            except (ValueError, ZeroDivisionError):
                continue

    return transactions


def parse_chase_pdf(file_bytes: bytes) -> ParsedStatement:
    """
    Main entry point: parse a Chase credit card statement PDF.

    Extraction strategy:
    1. Extract all text from every page (combined)
    2. Find the statement period (for year inference)
    3. Try text-based parsing first (more reliable for Chase format)
    4. Also try table-based parsing (catches structured data better)
    5. Merge results, deduplicate by hash

    Returns a ParsedStatement with all found transactions.
    """
    full_text = ""
    all_table_txns: List[ParsedTransaction] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

            # Try table extraction on each page
            try:
                tables = page.extract_tables()
                if tables:
                    # We'll process after we know the date range
                    all_table_txns.append(("__tables__", tables))
            except Exception:
                pass

    # Extract statement period from full text
    period_start, period_end = _parse_date_range(full_text)
    statement_date = _parse_statement_date(full_text)

    # If we couldn't find dates, use fallback (today's month)
    today = date.today()
    if not period_start:
        period_start = date(today.year, today.month, 1)
    if not period_end:
        period_end = today
    if not statement_date:
        statement_date = period_end

    # Parse transactions from text
    text_transactions = _parse_text_transactions(full_text, period_start, period_end)

    # Parse from tables (if any)
    table_transactions = []
    for item in all_table_txns:
        if item[0] == "__tables__":
            table_transactions.extend(
                _parse_table_transactions(item[1], period_start, period_end)
            )

    # Merge: text parsing takes priority; add table results not already found
    existing_hashes = {t.txn_hash for t in text_transactions}
    merged = list(text_transactions)
    for txn in table_transactions:
        if txn.txn_hash not in existing_hashes:
            merged.append(txn)
            existing_hashes.add(txn.txn_hash)

    # Sort by date
    merged.sort(key=lambda t: t.posted_date)

    return ParsedStatement(
        statement_date=statement_date.isoformat() if statement_date else None,
        period_start=period_start.isoformat() if period_start else None,
        period_end=period_end.isoformat() if period_end else None,
        transactions=merged,
        raw_text=full_text,
    )
