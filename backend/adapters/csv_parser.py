"""
Bank CSV Parser — auto-detects the bank format and parses transactions.

When you download your transactions from a bank's website (not the PDF statement,
but the "Export / Download Activity" option), you get a CSV file. Every major bank
offers this, but they all use slightly different column names and conventions.

This adapter handles all of them with one function: parse_bank_csv().

HOW AUTO-DETECTION WORKS:
  We look at the first row (the header) of the CSV and match it to a known bank
  format. Think of it like recognizing a face — each bank has a distinctive set
  of column names that identify it uniquely.

SUPPORTED BANKS:
  - Chase          ("Transaction Date, Post Date, Description, Category, Type, Amount, Memo")
  - American Express ("Date, Description, Amount" or "Date, Reference, Amount")
  - Bank of America  ("Posted Date, Reference Number, Payee, Address, Amount")
  - Citi             ("Status, Date, Description, Debit, Credit")
  - Capital One      ("Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit")
  - Discover         ("Trans. Date, Post Date, Description, Amount, Category")
  - Generic fallback (tries to find date/description/amount columns by name)

AMOUNT CONVENTIONS BY BANK:
  Banks are inconsistent about whether purchases are positive or negative:
  - Chase:      negative for purchases  (-42.50)
  - Amex:       positive for purchases  (+42.50)
  - BofA:       negative for purchases  (-42.50)
  - Citi:       split into Debit (purchases, positive) + Credit (payments, positive)
  - Capital One: split into Debit + Credit (same as Citi)
  - Discover:   positive for purchases  (+42.50)

We normalize everything to positive amounts (like the PDF parser does).
Payments and credits are skipped — we only want purchases.
"""

import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Optional, List

# Re-use the same data classes as the Chase PDF parser so the import service
# doesn't need to know which parser was used — they all speak the same language.
from adapters.chase_parser import ParsedTransaction, ParsedStatement


# ─── Bank format definitions ──────────────────────────────────────────────────
# Each format specifies which columns hold date/description/amount and how to
# interpret the amount sign. We match formats by checking if the required
# column names appear in the CSV header row.

BANK_FORMATS = [
    {
        "bank": "Chase",
        # Chase CSV has: Card, Transaction Date, Post Date, Description, Category, Type, Amount, Memo
        # We require Post Date to distinguish from generic formats
        "required_cols": ["Transaction Date", "Post Date", "Description", "Amount"],
        "date_col": "Transaction Date",
        "desc_col": "Description",
        # Chase: negative = purchase, positive = payment — we flip the sign
        "amount_col": "Amount",
        "debit_col": None,
        "credit_col": None,
        "amount_is_negative_for_purchases": True,
    },
    {
        "bank": "American Express",
        # Amex CSV has: Date, Description, Amount (+ optional extended detail columns)
        # Key distinction from Chase: "Date" not "Transaction Date"; no "Post Date"
        # Key distinction from Citi: has "Amount", no "Debit"/"Credit" split
        "required_cols": ["Date", "Description", "Amount"],
        "date_col": "Date",
        "desc_col": "Description",
        "amount_col": "Amount",
        "debit_col": None,
        "credit_col": None,
        # Amex: POSITIVE = purchase, negative = payment/credit (confirmed from real exports)
        # This is the OPPOSITE of Chase — Amex exports charges as positive numbers.
        "amount_is_negative_for_purchases": False,
    },
    {
        "bank": "Bank of America",
        "required_cols": ["Posted Date", "Payee", "Amount"],
        "date_col": "Posted Date",
        "desc_col": "Payee",
        "amount_col": "Amount",
        "debit_col": None,
        "credit_col": None,
        # BofA: negative = purchase (same as Chase)
        "amount_is_negative_for_purchases": True,
    },
    {
        "bank": "Citi",
        # Citi splits into Debit (purchases) and Credit (payments) columns
        "required_cols": ["Date", "Description", "Debit", "Credit"],
        "date_col": "Date",
        "desc_col": "Description",
        "amount_col": None,
        "debit_col": "Debit",    # Purchases appear here (positive)
        "credit_col": "Credit",  # Payments appear here (positive, we skip these)
        "amount_is_negative_for_purchases": False,
    },
    {
        "bank": "Capital One",
        # Capital One also uses Debit/Credit split
        "required_cols": ["Transaction Date", "Description", "Debit", "Credit"],
        "date_col": "Transaction Date",
        "desc_col": "Description",
        "amount_col": None,
        "debit_col": "Debit",
        "credit_col": "Credit",
        "amount_is_negative_for_purchases": False,
    },
    {
        "bank": "Discover",
        # Discover: "Trans. Date" (with period abbreviation) is the unique fingerprint —
        # no other major bank uses this exact column name
        "required_cols": ["Trans. Date", "Description", "Amount"],
        "date_col": "Trans. Date",
        "desc_col": "Description",
        "amount_col": "Amount",
        "debit_col": None,
        "credit_col": None,
        # Discover: negative = purchase, positive = payment (confirmed from real exports)
        "amount_is_negative_for_purchases": True,
    },
]


def _detect_bank_format(headers: list[str]) -> Optional[dict]:
    """
    Given a list of column names from the CSV header row, find the matching
    bank format. Returns None if we can't identify the bank.

    We strip whitespace from headers before matching because some banks
    export headers with leading/trailing spaces.
    """
    clean = [h.strip() for h in headers]

    for fmt in BANK_FORMATS:
        # Check if every required column is present in this CSV's headers
        if all(req in clean for req in fmt["required_cols"]):
            return fmt

    return None


def _detect_generic_format(headers: list[str]) -> Optional[dict]:
    """
    Fallback format detection for CSVs that don't match any known bank.

    This handles:
    - Our own app's transaction export (Date, Merchant, Category, Amount, ...)
    - Any other CSV with sensibly-named columns

    Strategy: scan each header name and see if it "sounds like" a date column,
    a description column, or an amount column. Think of it like a relaxed name-
    matching game — "Merchant" doesn't exactly say "Description" but it clearly
    means the same thing.

    Returns a synthetic format dict (same shape as BANK_FORMATS entries) if we
    can find at least a date column, a description column, and an amount column.
    Returns None if any of the three can't be found.
    """
    # Keywords that tell us what a column contains — order matters within each
    # group because we pick the first match.
    DATE_KEYWORDS        = ["date"]
    DESC_KEYWORDS        = ["description", "merchant", "payee", "narration",
                            "memo", "vendor", "name", "details", "particulars"]
    AMOUNT_KEYWORDS      = ["amount", "debit", "charge", "transaction"]
    # "credit" could also hold the amount, but it's ambiguous (Citi uses it for
    # payments). We avoid it here and fall through to None if only credit exists.

    clean = [h.strip() for h in headers]
    clean_lower = [h.lower() for h in clean]

    date_col = desc_col = amount_col = None

    # Walk the headers once and claim each role for the first header that fits.
    for original, lower in zip(clean, clean_lower):
        if date_col is None:
            for kw in DATE_KEYWORDS:
                if kw in lower:
                    date_col = original
                    break
        if desc_col is None:
            for kw in DESC_KEYWORDS:
                if kw in lower:
                    desc_col = original
                    break
        if amount_col is None:
            for kw in AMOUNT_KEYWORDS:
                if kw in lower:
                    amount_col = original
                    break

    # We need all three to proceed — if any is missing, give up
    if not (date_col and desc_col and amount_col):
        return None

    # Build a format dict that looks just like a BANK_FORMATS entry so the
    # rest of parse_bank_csv() can treat it identically.
    return {
        "bank": "Generic",
        "required_cols": [date_col, desc_col, amount_col],
        "date_col": date_col,
        "desc_col": desc_col,
        "amount_col": amount_col,
        "debit_col": None,
        "credit_col": None,
        # We'll auto-detect the sign convention from the actual data below.
        # For now we mark this as None — parse_bank_csv() handles None specially.
        "amount_is_negative_for_purchases": None,
    }


def _parse_date(raw: str) -> Optional[str]:
    """
    Parse a date string into ISO format (YYYY-MM-DD).

    Banks use various date formats:
      MM/DD/YYYY  → Chase, Amex, BofA, Discover
      YYYY-MM-DD  → Capital One
      MM-DD-YYYY  → Occasional variant

    Returns None if we can't parse the date (we'll skip that row).
    """
    raw = raw.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> Optional[float]:
    """
    Parse an amount string to a float, stripping currency symbols and commas.
    Returns None if the cell is empty or unparseable.

    Examples:
      "$1,234.56" → 1234.56
      "-42.50"    → -42.50
      "42.50"     → 42.50
      ""          → None
    """
    if not raw or not raw.strip():
        return None
    # Remove $, commas, spaces — keep digits, dots, minus signs
    cleaned = re.sub(r'[^\d.\-]', '', raw.strip())
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _make_txn_hash(posted_date: str, description: str, amount: float) -> str:
    """
    Fingerprint a transaction so we can detect duplicates if the same CSV
    is uploaded twice. Same logic as the Chase parser.
    """
    key = f"{posted_date}|{description.lower().strip()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def parse_bank_csv(file_bytes: bytes) -> ParsedStatement:
    """
    Parse a bank CSV export and return a ParsedStatement.

    This is the main entry point — it auto-detects the bank format,
    parses every row, and returns the same ParsedStatement structure
    that the Chase PDF parser returns. The import service doesn't need
    to know the difference.

    Raises ValueError if:
    - The file can't be decoded as text
    - The CSV headers don't match any known bank format
    """
    # Decode bytes → text. Try UTF-8 first (most banks), fall back to latin-1
    # (some older bank exports use this for special characters like ©)
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")

    # Remove BOM (Byte Order Mark) — some banks add \ufeff at the start
    text = text.lstrip("\ufeff")

    # Some banks (notably Citi) include a blank or metadata row BEFORE the actual
    # column headers. We scan through the first few rows to find the real header —
    # the first row whose columns match a known bank format.
    #
    # Strategy: try up to 5 rows as candidate headers. Stop at the first match.
    lines = [l for l in text.splitlines() if l.strip()]  # drop blank lines
    fmt = None
    header_index = 0

    for i, line in enumerate(lines[:5]):
        candidate_headers = [h.strip() for h in next(csv.reader([line]))]
        # First try strict bank-specific detection (Chase, Amex, BofA, etc.)
        detected = _detect_bank_format(candidate_headers)
        if detected:
            fmt = detected
            header_index = i
            break
        # Then try the relaxed generic fallback (any CSV with date/desc/amount columns)
        detected_generic = _detect_generic_format(candidate_headers)
        if detected_generic:
            fmt = detected_generic
            header_index = i
            break

    if fmt is None:
        # Try reading the raw first non-blank line's headers for the error message
        first_headers = [h.strip() for h in next(csv.reader([lines[0]]))] if lines else []
        raise ValueError(
            f"Could not identify the bank format from the CSV headers: {first_headers}. "
            "Supported banks: Chase, American Express, Bank of America, Citi, Capital One, Discover. "
            "For other CSVs, make sure the file has columns whose names include 'date', "
            "'description'/'merchant'/'payee', and 'amount'."
        )

    # Re-parse from the detected header row onwards
    relevant_text = "\n".join(lines[header_index:])
    reader = csv.DictReader(io.StringIO(relevant_text))

    if reader.fieldnames is None:
        raise ValueError("CSV file appears to be empty.")

    fieldnames = [f.strip() for f in reader.fieldnames]
    if fmt is None:
        raise ValueError(
            f"Could not identify the bank format from the CSV headers: {fieldnames}. "
            "Supported banks: Chase, American Express, Bank of America, Citi, Capital One, Discover."
        )

    transactions: list[ParsedTransaction] = []
    skipped = 0

    for row in reader:
        # Strip whitespace from all values (some banks export with extra spaces)
        row = {k.strip(): v.strip() if v else "" for k, v in row.items()}

        # ── Parse date ─────────────────────────────────────────────────────
        raw_date = row.get(fmt["date_col"], "")
        posted_date = _parse_date(raw_date)
        if not posted_date:
            skipped += 1
            continue  # Skip rows with unparseable dates (e.g. header repeats)

        # ── Parse description ──────────────────────────────────────────────
        description = row.get(fmt["desc_col"], "").strip()
        if not description:
            skipped += 1
            continue

        # ── Parse amount ───────────────────────────────────────────────────
        if fmt["debit_col"] and fmt["credit_col"]:
            # Citi / Capital One: Debit = purchase, Credit = payment
            # We only import purchases (debit column), skip payments
            debit_raw = row.get(fmt["debit_col"], "")
            credit_raw = row.get(fmt["credit_col"], "")

            debit = _parse_amount(debit_raw)
            credit = _parse_amount(credit_raw)

            if debit is None and credit is None:
                skipped += 1
                continue

            if debit is not None and debit > 0:
                # It's a purchase — use the debit amount
                amount = debit
            elif credit is not None and credit > 0:
                # It's a payment/refund — skip it
                skipped += 1
                continue
            else:
                skipped += 1
                continue

        else:
            # Single amount column (Chase, Amex, BofA, Discover, or Generic)
            amount_raw = row.get(fmt["amount_col"], "")
            amount = _parse_amount(amount_raw)

            if amount is None:
                skipped += 1
                continue

            if fmt["amount_is_negative_for_purchases"] is None:
                # Generic format: we don't know the sign convention in advance,
                # so we auto-detect it from each row.
                #
                # Rule of thumb: if the value is positive, treat it as a purchase.
                # If it's negative, also treat it as a purchase (flip to positive).
                # Zero-amount rows are meaningless — skip them.
                #
                # Why this works for our own export: all amounts are positive
                # purchases (payments/refunds were already excluded when we built
                # the export). For truly unknown CSVs this is the safest default —
                # negative amounts almost always mean something was charged.
                if amount == 0:
                    skipped += 1
                    continue
                amount = abs(amount)  # Normalise — always store as positive
            elif fmt["amount_is_negative_for_purchases"]:
                # Chase / BofA: purchases are negative, payments are positive
                # We want purchases only → keep negative values, flip sign
                if amount >= 0:
                    skipped += 1  # Payment/credit — skip
                    continue
                amount = abs(amount)  # Flip to positive
            else:
                # Amex / Discover: purchases are already positive
                # Negative values are refunds/credits — skip them
                if amount <= 0:
                    skipped += 1
                    continue

        # ── Build transaction ──────────────────────────────────────────────
        txn_hash = _make_txn_hash(posted_date, description, amount)

        transactions.append(ParsedTransaction(
            posted_date=posted_date,
            description_raw=description,
            amount=amount,
            txn_type="purchase",
            parse_confidence=1.0,  # CSV data is clean — no PDF extraction noise
            txn_hash=txn_hash,
        ))

    if not transactions and skipped > 0:
        raise ValueError(
            f"No transactions could be parsed from this CSV. "
            f"{skipped} rows were skipped. Check that the file is a transaction export "
            f"(not an account summary) from a supported bank."
        )

    # CSVs don't have a statement period baked in — we use the date range of
    # the transactions themselves as a proxy
    if transactions:
        dates = [t.posted_date for t in transactions]
        period_start = min(dates)
        period_end = max(dates)
    else:
        period_start = period_end = None

    return ParsedStatement(
        statement_date=None,        # CSVs don't have a single statement date
        period_start=period_start,
        period_end=period_end,
        transactions=transactions,
        raw_text=f"CSV import ({fmt['bank']}, {len(transactions)} transactions)",
        bank_name=fmt["bank"],      # e.g. "Chase", "American Express", "Citi"
    )
