"""
Tests for the Chase PDF parser.

Since we don't have a real PDF file in the test suite, we test:
1. The year inference logic (Dec/Jan boundary — critical correctness)
2. The transaction regex patterns
3. The merchant key normalization
4. The hash-based idempotency (same transaction = same hash)
"""

import pytest
from datetime import date
from adapters.chase_parser import (
    _infer_year,
    _make_txn_hash,
    _parse_date_range,
    _parse_statement_date,
    _parse_text_transactions,
    ParsedTransaction,
)
from domain.categories import normalize_merchant_key, categorize


# ═══════════════════════════════════════════════════════════════════════════════
# Year Inference Tests (Dec/Jan boundary — the tricky part)
# ═══════════════════════════════════════════════════════════════════════════════

class TestYearInference:
    """
    Chase statements often span two calendar years (e.g., Dec 10 – Jan 9).
    We need to correctly assign 2025 to December transactions and
    2026 to January transactions on the same statement.
    """

    def setup_method(self):
        """Statement period: December 10, 2025 → January 9, 2026"""
        self.period_start = date(2025, 12, 10)
        self.period_end = date(2026, 1, 9)

        """Normal period: January 9 → February 8, 2026"""
        self.normal_start = date(2026, 1, 9)
        self.normal_end = date(2026, 2, 8)

    def test_january_transaction_on_dec_jan_statement(self):
        """Jan 5 on a Dec-Jan statement → should be 2026."""
        year = _infer_year(1, 5, self.period_start, self.period_end)
        assert year == 2026

    def test_december_transaction_on_dec_jan_statement(self):
        """Dec 15 on a Dec-Jan statement → should be 2025."""
        year = _infer_year(12, 15, self.period_start, self.period_end)
        assert year == 2025

    def test_january_transaction_normal_statement(self):
        """Jan 15 on a normal Jan-Feb statement → should be 2026."""
        year = _infer_year(1, 15, self.normal_start, self.normal_end)
        assert year == 2026

    def test_february_transaction_normal_statement(self):
        """Feb 5 on a Jan-Feb statement → should be 2026."""
        year = _infer_year(2, 5, self.normal_start, self.normal_end)
        assert year == 2026

    def test_edge_case_first_day_of_period(self):
        """Transaction on the first day of the period."""
        year = _infer_year(1, 9, self.normal_start, self.normal_end)
        assert year == 2026

    def test_edge_case_last_day_of_period(self):
        """Transaction on the last day of the period."""
        year = _infer_year(2, 8, self.normal_start, self.normal_end)
        assert year == 2026

    def test_nov_dec_boundary(self):
        """Another year boundary: Nov 10 – Dec 9 statement."""
        period_start = date(2025, 11, 10)
        period_end = date(2025, 12, 9)
        # Nov transaction
        year = _infer_year(11, 15, period_start, period_end)
        assert year == 2025
        # Dec transaction
        year = _infer_year(12, 5, period_start, period_end)
        assert year == 2025


# ═══════════════════════════════════════════════════════════════════════════════
# Transaction Regex / Text Parsing Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTextParsing:
    """Test the text-based transaction extractor."""

    def setup_method(self):
        self.period_start = date(2026, 1, 9)
        self.period_end = date(2026, 2, 8)

    def _parse(self, text):
        return _parse_text_transactions(text, self.period_start, self.period_end)

    def test_standard_chase_format(self):
        """Standard Chase format: MM/DD  MERCHANT  $AMOUNT"""
        text = """
PURCHASES
01/15    AMAZON.COM*1A2B3C      $45.00
01/16    WHOLE FOODS MARKET 123  NEW YORK NY    $123.45
"""
        txns = self._parse(text)
        assert len(txns) == 2
        assert txns[0].amount == 45.0
        assert txns[1].amount == 123.45
        assert "AMAZON" in txns[0].description_raw

    def test_amount_without_dollar_sign(self):
        """Some Chase formats omit the $ sign."""
        text = """
PURCHASES
01/20    TRADER JOES    89.50
"""
        txns = self._parse(text)
        assert len(txns) == 1
        assert txns[0].amount == 89.50

    def test_section_filtering(self):
        """Only parse transactions from the PURCHASE section."""
        text = """
PAYMENTS AND OTHER CREDITS
01/10    PAYMENT THANK YOU    500.00

PURCHASES
01/15    NETFLIX.COM    15.99
01/16    SPOTIFY    9.99

FEES CHARGED
01/31    ANNUAL FEE    95.00
"""
        txns = self._parse(text)
        # Should only include the 2 purchase transactions
        assert len(txns) == 2
        descriptions = [t.description_raw for t in txns]
        assert any("NETFLIX" in d for d in descriptions)
        assert any("SPOTIFY" in d for d in descriptions)

    def test_no_duplicates_in_parse(self):
        """Same transaction appearing twice should only be returned once."""
        text = """
PURCHASES
01/15    STARBUCKS    5.50
01/15    STARBUCKS    5.50
"""
        txns = self._parse(text)
        # Deduplication by hash should give us just 1
        assert len(txns) == 1

    def test_date_assigned_correct_year(self):
        """Transactions should get the right year based on the statement period."""
        text = """
PURCHASES
01/15    WHOLE FOODS    75.00
"""
        txns = self._parse(text)
        assert len(txns) == 1
        assert txns[0].posted_date.startswith("2026")


# ═══════════════════════════════════════════════════════════════════════════════
# Transaction Hash / Idempotency Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransactionHash:
    def test_same_inputs_same_hash(self):
        """Same date + description + amount → identical hash every time."""
        h1 = _make_txn_hash("2026-01-15", "AMAZON.COM", 45.00)
        h2 = _make_txn_hash("2026-01-15", "AMAZON.COM", 45.00)
        assert h1 == h2

    def test_different_amount_different_hash(self):
        h1 = _make_txn_hash("2026-01-15", "AMAZON.COM", 45.00)
        h2 = _make_txn_hash("2026-01-15", "AMAZON.COM", 46.00)
        assert h1 != h2

    def test_different_date_different_hash(self):
        h1 = _make_txn_hash("2026-01-15", "AMAZON.COM", 45.00)
        h2 = _make_txn_hash("2026-01-16", "AMAZON.COM", 45.00)
        assert h1 != h2

    def test_case_insensitive_description(self):
        """Description matching should be case-insensitive (handles PDF extraction variation)."""
        h1 = _make_txn_hash("2026-01-15", "AMAZON.COM", 45.00)
        h2 = _make_txn_hash("2026-01-15", "amazon.com", 45.00)
        assert h1 == h2  # Same hash regardless of case


# ═══════════════════════════════════════════════════════════════════════════════
# Merchant Key Normalization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMerchantNormalization:
    def test_strips_location(self):
        """Location and store numbers should be stripped."""
        key1 = normalize_merchant_key("WHOLE FOODS MARKET #123 NEW YORK NY")
        key2 = normalize_merchant_key("WHOLE FOODS MARKET #456 BROOKLYN NY")
        assert key1 == key2

    def test_lowercased(self):
        key = normalize_merchant_key("STARBUCKS STORE 12345")
        assert key == key.lower()

    def test_first_four_words(self):
        """We only use the first 4 words for the key."""
        key = normalize_merchant_key("TRADER JOE S #123 MANHATTAN NY 01/15")
        # Should be something like "trader joe s" or similar
        assert "trader" in key


# ═══════════════════════════════════════════════════════════════════════════════
# Auto-categorization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCategorization:
    def test_netflix_is_subscription(self):
        cat, conf = categorize("NETFLIX.COM")
        assert cat == "subscriptions"
        assert conf == 1.0

    def test_whole_foods_is_groceries(self):
        cat, conf = categorize("WHOLE FOODS MARKET #123")
        assert cat == "groceries"

    def test_uber_is_transportation(self):
        cat, conf = categorize("UBER *TRIP")
        assert cat == "transportation"

    def test_restaurant_is_dining(self):
        cat, conf = categorize("LILIA RESTAURANT BROOKLYN")
        assert cat == "dining"

    def test_unknown_merchant(self):
        cat, conf = categorize("XYZ RANDOM MERCHANT 12345")
        assert cat == "unknown"
        assert conf == 0.5

    def test_starbucks_is_dining(self):
        cat, conf = categorize("STARBUCKS STORE 12345")
        assert cat == "dining"

    def test_case_insensitive(self):
        cat1, _ = categorize("netflix.com")
        cat2, _ = categorize("NETFLIX.COM")
        assert cat1 == cat2


# ═══════════════════════════════════════════════════════════════════════════════
# Date Range Parsing Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDateRangeParsing:
    def test_standard_format(self):
        text = "Statement Period: 01/09/26 - 02/08/26"
        start, end = _parse_date_range(text)
        assert start == date(2026, 1, 9)
        assert end == date(2026, 2, 8)

    def test_four_digit_year(self):
        text = "01/09/2026 - 02/08/2026"
        start, end = _parse_date_range(text)
        assert start == date(2026, 1, 9)
        assert end == date(2026, 2, 8)

    def test_no_date_range_returns_none(self):
        text = "This text has no dates in it"
        start, end = _parse_date_range(text)
        assert start is None
        assert end is None

    def test_dec_jan_crossover(self):
        text = "12/10/25 - 01/09/26"
        start, end = _parse_date_range(text)
        assert start == date(2025, 12, 10)
        assert end == date(2026, 1, 9)
        # They should be in different years
        assert start.year != end.year
