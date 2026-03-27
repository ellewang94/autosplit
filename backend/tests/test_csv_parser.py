"""
Tests for the Bank CSV Parser.

The CSV parser is a critical import path — if it misidentifies a bank format or
parses amounts wrong, users get garbled transaction data that's very hard to debug.

These tests cover:
1. Bank format detection (each supported bank has unique column names)
2. Amount sign handling (banks disagree on whether purchases are + or -)
3. Debit/Credit column banks (Citi, Capital One)
4. Generic/fallback format detection (our own CSV export re-import)
5. Duplicate detection (same CSV uploaded twice → same hash)
6. Edge cases: BOM characters, mixed sign rows, empty cells

We test parse_bank_csv() directly with in-memory byte strings — no files needed.
"""

import pytest
from adapters.csv_parser import (
    parse_bank_csv,
    _detect_bank_format,
    _detect_generic_format,
    _parse_date,
    _parse_amount,
    _make_txn_hash,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def csv_bytes(*lines):
    """Join lines into bytes the way a real CSV file export would look."""
    return "\n".join(lines).encode("utf-8")


# ═══════════════════════════════════════════════════════════════════════════════
# Bank Format Detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestBankFormatDetection:
    """
    Each bank's CSV has a distinctive set of column headers.
    The detector must pick the right format — or refuse gracefully.
    """

    def test_chase_detected(self):
        headers = ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "Chase"

    def test_amex_detected(self):
        # Amex: no Post Date, no Transaction prefix — just "Date"
        headers = ["Date", "Description", "Amount"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "American Express"

    def test_bof_a_detected(self):
        headers = ["Posted Date", "Reference Number", "Payee", "Address", "Amount"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "Bank of America"

    def test_citi_detected(self):
        headers = ["Status", "Date", "Description", "Debit", "Credit"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "Citi"

    def test_capital_one_detected(self):
        headers = ["Transaction Date", "Posted Date", "Card No.", "Description", "Category", "Debit", "Credit"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "Capital One"

    def test_discover_detected(self):
        # "Trans. Date" with period is Discover's fingerprint
        headers = ["Trans. Date", "Post Date", "Description", "Amount", "Category"]
        fmt = _detect_bank_format(headers)
        assert fmt is not None
        assert fmt["bank"] == "Discover"

    def test_unknown_headers_returns_none(self):
        headers = ["Timestamp", "Vendor", "Charge", "Balance"]
        fmt = _detect_bank_format(headers)
        assert fmt is None  # No exact match → should return None (not crash)

    def test_headers_with_extra_whitespace(self):
        """Banks sometimes export headers with leading/trailing spaces."""
        headers = ["  Transaction Date  ", "  Post Date  ", "  Description  ", "  Amount  "]
        fmt = _detect_bank_format(headers)
        # Should still detect Chase despite the whitespace padding
        assert fmt is not None
        assert fmt["bank"] == "Chase"


class TestGenericFormatDetection:
    """
    The fallback generic detector uses keyword matching.
    It should handle our own app's CSV export and other flexible formats.
    """

    def test_our_export_format_detected(self):
        """Our own transaction export has: Date, Merchant, Category, Amount, Participants, Status"""
        headers = ["Date", "Merchant", "Category", "Amount", "Participants", "Status"]
        fmt = _detect_generic_format(headers)
        assert fmt is not None
        assert fmt["date_col"] == "Date"
        assert fmt["desc_col"] == "Merchant"
        assert fmt["amount_col"] == "Amount"

    def test_payee_maps_to_description(self):
        headers = ["Date", "Payee", "Debit Amount"]
        fmt = _detect_generic_format(headers)
        assert fmt is not None
        assert fmt["desc_col"] == "Payee"

    def test_insufficient_columns_returns_none(self):
        """If we can't find date + description + amount, return None."""
        headers = ["Vendor", "Charge"]  # No date column
        fmt = _detect_generic_format(headers)
        assert fmt is None


# ═══════════════════════════════════════════════════════════════════════════════
# Date and Amount Parsing
# ═══════════════════════════════════════════════════════════════════════════════

class TestDateParsing:
    def test_slash_format_MM_DD_YYYY(self):
        assert _parse_date("01/15/2026") == "2026-01-15"

    def test_iso_format(self):
        assert _parse_date("2026-01-15") == "2026-01-15"

    def test_unparseable_returns_none(self):
        assert _parse_date("not a date") is None

    def test_empty_returns_none(self):
        assert _parse_date("") is None

    def test_with_whitespace(self):
        """Dates are often surrounded by spaces in exported CSVs."""
        assert _parse_date("  01/15/2026  ") == "2026-01-15"


class TestAmountParsing:
    def test_plain_float(self):
        assert _parse_amount("42.50") == 42.50

    def test_negative_float(self):
        assert _parse_amount("-42.50") == -42.50

    def test_with_dollar_sign(self):
        assert _parse_amount("$42.50") == 42.50

    def test_with_commas(self):
        assert _parse_amount("$1,234.56") == 1234.56

    def test_empty_returns_none(self):
        assert _parse_amount("") is None

    def test_blank_cell_returns_none(self):
        assert _parse_amount("   ") is None


# ═══════════════════════════════════════════════════════════════════════════════
# Full CSV Parsing — Bank Formats
# ═══════════════════════════════════════════════════════════════════════════════

class TestChaseCsvParsing:
    """
    Chase CSV: negative = purchase, positive = payment.
    We should import only negative rows and flip the sign to positive.
    """

    def _make_csv(self, *rows):
        """Create a Chase-format CSV with the given data rows."""
        header = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo"
        return csv_bytes(header, *rows)

    def test_basic_purchase_imported(self):
        csv = self._make_csv(
            "01/15/2026,01/16/2026,WHOLE FOODS MARKET,Groceries,Sale,-89.50,"
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 89.50
        assert "WHOLE FOODS" in result.transactions[0].description_raw

    def test_payment_is_skipped(self):
        """
        Positive amounts in Chase CSVs are payments — we skip them.
        We include one real purchase so the parser doesn't raise ValueError
        (which only fires when EVERY row is skipped — no purchases at all).
        """
        csv = self._make_csv(
            "01/10/2026,01/11/2026,PAYMENT THANK YOU,,Payment,500.00,",  # skipped
            "01/15/2026,01/16/2026,STARBUCKS,Dining,Sale,-5.50,",        # kept
        )
        result = parse_bank_csv(csv)
        # Only the purchase should be imported
        assert len(result.transactions) == 1
        assert "STARBUCKS" in result.transactions[0].description_raw

    def test_multiple_purchases(self):
        csv = self._make_csv(
            "01/15/2026,01/16/2026,AMAZON.COM,Shopping,Sale,-45.00,",
            "01/16/2026,01/17/2026,NETFLIX.COM,Entertainment,Sale,-15.99,",
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 2
        amounts = sorted([t.amount for t in result.transactions])
        assert amounts == [15.99, 45.00]

    def test_period_computed_from_transaction_dates(self):
        """CSVs have no statement date — we derive the period from min/max transaction dates."""
        # Chase format: 7 columns (Transaction Date, Post Date, Description, Category, Type, Amount, Memo)
        csv = self._make_csv(
            "01/05/2026,01/06/2026,MERCHANT A,Shopping,Sale,-45.00,",
            "01/20/2026,01/21/2026,MERCHANT B,Shopping,Sale,-30.00,",
        )
        result = parse_bank_csv(csv)
        assert result.period_start == "2026-01-05"
        assert result.period_end == "2026-01-20"

    def test_amount_with_dollar_sign(self):
        """Some Chase exports include $ in the amount cell."""
        csv = self._make_csv(
            "01/15/2026,01/16/2026,STARBUCKS,Dining,Sale,-$5.50,"
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 5.50


class TestCitiCsvParsing:
    """
    Citi uses separate Debit and Credit columns.
    Debit = purchase (positive value), Credit = payment (positive value, skip it).
    """

    def _make_csv(self, *rows):
        header = "Status,Date,Description,Debit,Credit"
        return csv_bytes(header, *rows)

    def test_debit_row_imported(self):
        csv = self._make_csv(
            "Cleared,01/15/2026,TRADER JOES,45.00,"
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 45.00

    def test_credit_row_skipped(self):
        """
        Citi credit column = payment — should be skipped.
        Include a real debit purchase so the parser can return a result.
        """
        csv = self._make_csv(
            "Cleared,01/10/2026,PAYMENT RECEIVED,,500.00",  # credit (skipped)
            "Cleared,01/15/2026,STARBUCKS,5.50,",           # debit (kept)
        )
        result = parse_bank_csv(csv)
        # Only the debit (purchase) row should be imported
        assert len(result.transactions) == 1
        assert "STARBUCKS" in result.transactions[0].description_raw

    def test_mixed_rows(self):
        csv = self._make_csv(
            "Cleared,01/15/2026,WHOLE FOODS,89.50,",
            "Cleared,01/10/2026,AUTOPAY,,500.00",
            "Cleared,01/16/2026,AMAZON,45.00,",
        )
        result = parse_bank_csv(csv)
        # Only 2 debit (purchase) rows, payment skipped
        assert len(result.transactions) == 2


class TestAmexCsvParsing:
    """
    Amex (confirmed from real exports): POSITIVE = purchase, NEGATIVE = payment/credit.
    This is the OPPOSITE of Chase — Amex exports charges as positive numbers.
    """

    def _make_csv(self, *rows):
        header = "Date,Description,Amount"
        return csv_bytes(header, *rows)

    def test_purchase_imported(self):
        """Amex purchases are positive — imported as-is."""
        csv = self._make_csv("01/15/2026,NOBU RESTAURANT,124.50")
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 124.50

    def test_refund_skipped_and_purchase_imported(self):
        """
        Negative amounts in Amex = payments/credits — we skip them.
        Include a real purchase (positive) so the parser can return a result.
        """
        csv = self._make_csv(
            "01/12/2026,ONLINE PAYMENT - THANK YOU,-500.00",  # negative = payment (skipped)
            "01/15/2026,STARBUCKS,5.50",                       # positive = purchase (kept)
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert "STARBUCKS" in result.transactions[0].description_raw


class TestDiscoverCsvParsing:
    """
    Discover uses "Trans. Date" (with period).
    Confirmed from real exports: NEGATIVE = purchase (same as Chase/Amex).
    """

    def _make_csv(self, *rows):
        header = "Trans. Date,Post Date,Description,Amount,Category"
        return csv_bytes(header, *rows)

    def test_purchase_imported(self):
        """Discover purchases are negative — we flip to positive."""
        csv = self._make_csv("01/15/2026,01/16/2026,WALMART STORE,-55.23,Merchandise")
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 55.23


# ═══════════════════════════════════════════════════════════════════════════════
# Edge Cases and Robustness
# ═══════════════════════════════════════════════════════════════════════════════

class TestCsvEdgeCases:
    def test_bom_character_stripped(self):
        """
        Some banks (notably Excel-exported CSVs) add a BOM (\ufeff) at the start.
        This can make header detection fail if not stripped first.
        """
        csv_with_bom = "\ufeffTransaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/15/2026,01/16/2026,STARBUCKS,Dining,Sale,-5.50,".encode("utf-8")
        result = parse_bank_csv(csv_with_bom)
        assert len(result.transactions) == 1

    def test_unknown_format_raises_value_error(self):
        """An unrecognized CSV format should raise ValueError with a helpful message."""
        csv = csv_bytes(
            "Timestamp,Vendor,Charge,Balance",
            "2026-01-15,AMAZON,45.00,500.00",
        )
        with pytest.raises(ValueError, match="Could not identify"):
            parse_bank_csv(csv)

    def test_duplicate_transactions_same_hash(self):
        """
        Two rows with the same date + description + amount → same hash.
        The import service uses this hash for dedup — verify it works here at the parser level.
        """
        h1 = _make_txn_hash("2026-01-15", "WHOLE FOODS", 89.50)
        h2 = _make_txn_hash("2026-01-15", "WHOLE FOODS", 89.50)
        assert h1 == h2

    def test_different_amount_different_hash(self):
        h1 = _make_txn_hash("2026-01-15", "WHOLE FOODS", 89.50)
        h2 = _make_txn_hash("2026-01-15", "WHOLE FOODS", 89.51)
        assert h1 != h2

    def test_empty_description_row_skipped(self):
        """Rows with empty description should be silently skipped."""
        csv = csv_bytes(
            "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
            "01/15/2026,01/16/2026,,Dining,Sale,-5.50,",   # empty description
            "01/16/2026,01/17/2026,STARBUCKS,Dining,Sale,-6.00,",
        )
        result = parse_bank_csv(csv)
        # Only the row with a description should be imported
        assert len(result.transactions) == 1

    def test_metadata_row_before_headers_handled(self):
        """
        Citi and some other banks add one or more metadata rows before the real
        CSV header. The parser should skip those and find the real header.
        """
        csv = csv_bytes(
            "Account Number: 1234-5678-xxxx",   # metadata row
            "Status,Date,Description,Debit,Credit",  # real header
            "Cleared,01/15/2026,WHOLE FOODS,89.50,",
        )
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
        assert result.transactions[0].amount == 89.50

    def test_latin1_encoding_handled(self):
        """
        Some older bank exports use latin-1 encoding with special chars like ©.
        The parser should fall back to latin-1 if UTF-8 fails.
        """
        header = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo"
        row = "01/15/2026,01/16/2026,CAF\xe9 ROUGE,Dining,Sale,-25.00,"  # \xe9 = é in latin-1
        csv = (header + "\n" + row).encode("latin-1")
        result = parse_bank_csv(csv)
        assert len(result.transactions) == 1
