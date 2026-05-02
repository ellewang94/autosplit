"""
Tests for smart trip date range filtering.

The core behavior we're verifying:
- Transactions WITHIN trip dates: keep as-is (confirmed or unreviewed)
- Transactions OUTSIDE dates + everyday category (dining, groceries, etc.): auto-excluded
- Transactions OUTSIDE dates + travel/transportation + within 90-day pre-trip window: surface for review
- Transactions OUTSIDE dates + travel + more than 90 days before trip: still excluded (too far out)
- Transactions OUTSIDE dates + travel + within 14-day post-trip window: surface for review
"""

import io
import pytest
from datetime import date, timedelta
from shared import client, TEST_USER_ID


# ── Helpers ────────────────────────────────────────────────────────────────────

def create_trip(start_date: str, end_date: str) -> int:
    """Create a trip with the given date range and return its ID."""
    r = client.post("/api/groups", json={
        "name": "Test Trip",
        "start_date": start_date,
        "end_date": end_date,
        "base_currency": "USD",
    })
    assert r.status_code == 200, r.text
    group_id = r.json()["id"]

    # Add a member so the trip has someone to split with
    r2 = client.post(f"/api/groups/{group_id}/members", json={"name": "Alice"})
    assert r2.status_code == 200, r2.text
    return group_id


def make_csv(rows: list[tuple[str, str, float]]) -> bytes:
    """
    Build a minimal Chase-style CSV with (date, description, amount) rows.
    Amount is negative for purchases (Chase convention).
    """
    lines = ["Transaction Date,Post Date,Description,Category,Type,Amount,Memo"]
    for post_date, desc, amount in rows:
        lines.append(f"{post_date},{post_date},{desc},Travel,Sale,{-abs(amount)},")
    return "\n".join(lines).encode()


def upload_csv(group_id: int, csv_bytes: bytes, currency: str = "USD") -> dict:
    """Upload a CSV statement to the given trip and return the response JSON."""
    r = client.post(
        f"/api/groups/{group_id}/statements/upload-csv",
        files={"file": ("statement.csv", io.BytesIO(csv_bytes), "text/csv")},
        data={"currency": currency},
    )
    assert r.status_code == 200, r.text
    return r.json()


def get_transactions(group_id: int) -> list[dict]:
    """Fetch all transactions for a trip."""
    r = client.get(f"/api/groups/{group_id}/transactions")
    assert r.status_code == 200, r.text
    return r.json()


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_transactions_within_dates_are_kept():
    """Transactions that fall within the trip dates should not be excluded."""
    group_id = create_trip("2026-05-10", "2026-05-20")

    csv = make_csv([
        ("2026-05-12", "UBER MEXICO CITY", 25.00),
        ("2026-05-15", "TACOS EL PASTOR",  12.00),
    ])
    result = upload_csv(group_id, csv)
    assert result["excluded_by_date_count"] == 0

    txns = get_transactions(group_id)
    statuses = {t["description_raw"]: t["status"] for t in txns}
    assert statuses["UBER MEXICO CITY"] != "excluded"
    assert statuses["TACOS EL PASTOR"]  != "excluded"


def test_everyday_spending_outside_dates_is_excluded():
    """Groceries, dining, subscriptions outside trip dates should be auto-excluded."""
    group_id = create_trip("2026-05-10", "2026-05-20")

    # These dates are after the trip ends and the descriptions categorize as dining/groceries
    csv = make_csv([
        ("2026-05-25", "WHOLE FOODS MARKET", 85.00),  # after trip, grocery → excluded
        ("2026-05-01", "STARBUCKS",           6.00),   # before trip, dining → excluded
    ])
    result = upload_csv(group_id, csv)
    assert result["excluded_by_date_count"] == 2


def test_flight_booked_before_trip_is_surfaced_for_review():
    """
    A flight charged 30 days before the trip starts should NOT be auto-excluded —
    it should surface as Needs Review so the user can include it.
    """
    trip_start = "2026-06-15"
    trip_end   = "2026-06-25"
    group_id = create_trip(trip_start, trip_end)

    # Flight booked 30 days before departure — well within the 90-day pre-trip window
    flight_date = (date.fromisoformat(trip_start) - timedelta(days=30)).isoformat()
    csv = make_csv([(flight_date, "UNITED AIRLINES", 450.00)])
    result = upload_csv(group_id, csv)

    # Should NOT have been excluded
    assert result.get("surfaced_pre_trip_count", 0) >= 1 or result["excluded_by_date_count"] == 0

    txns = get_transactions(group_id)
    flight = next(t for t in txns if "UNITED" in t["description_raw"])
    assert flight["status"] != "excluded", "Pre-trip flight should surface for review, not be excluded"
    assert flight["participants_json"]["type"] == "ask", "Pre-trip flight should be marked 'ask' so it shows in Needs Review"


def test_hotel_booked_60_days_before_is_surfaced():
    """Hotel booked 60 days early (within 90-day window) should surface for review."""
    trip_start = "2026-07-01"
    trip_end   = "2026-07-10"
    group_id = create_trip(trip_start, trip_end)

    hotel_date = (date.fromisoformat(trip_start) - timedelta(days=60)).isoformat()
    csv = make_csv([(hotel_date, "AIRBNB * MEXICO CITY", 800.00)])
    result = upload_csv(group_id, csv)

    txns = get_transactions(group_id)
    hotel = next(t for t in txns if "AIRBNB" in t["description_raw"])
    assert hotel["status"] != "excluded", "Pre-trip Airbnb within 90-day window should surface for review"


def test_flight_booked_too_far_out_is_excluded():
    """A flight booked 120 days before the trip (beyond the 90-day window) should be excluded."""
    trip_start = "2026-08-01"
    trip_end   = "2026-08-10"
    group_id = create_trip(trip_start, trip_end)

    # 120 days before trip start — outside the 90-day pre-trip window
    flight_date = (date.fromisoformat(trip_start) - timedelta(days=120)).isoformat()
    csv = make_csv([(flight_date, "DELTA AIR LINES", 300.00)])
    result = upload_csv(group_id, csv)

    txns = get_transactions(group_id)
    flight = next(t for t in txns if "DELTA" in t["description_raw"])
    assert flight["status"] == "excluded", "Flight booked 120 days out (beyond 90-day window) should be excluded"


def test_post_trip_travel_charge_is_surfaced():
    """A travel charge within 14 days after the trip ends should surface for review."""
    trip_start = "2026-05-01"
    trip_end   = "2026-05-10"
    group_id = create_trip(trip_start, trip_end)

    # 7 days after trip ends — within the 14-day post-trip window
    post_date = (date.fromisoformat(trip_end) + timedelta(days=7)).isoformat()
    csv = make_csv([(post_date, "HERTZ CAR RENTAL", 150.00)])
    result = upload_csv(group_id, csv)

    txns = get_transactions(group_id)
    rental = next(t for t in txns if "HERTZ" in t["description_raw"])
    assert rental["status"] != "excluded", "Post-trip rental within 14 days should surface for review"


def test_no_date_range_set_keeps_all_transactions():
    """If a trip has no date range, all transactions should be imported without any exclusion."""
    # Create a trip with NO dates
    r = client.post("/api/groups", json={"name": "Undated Trip", "base_currency": "USD"})
    group_id = r.json()["id"]
    client.post(f"/api/groups/{group_id}/members", json={"name": "Alice"})

    csv = make_csv([
        ("2025-01-01", "SOME CHARGE", 50.00),
        ("2030-12-31", "FUTURE CHARGE", 75.00),
    ])
    result = upload_csv(group_id, csv)
    assert result["excluded_by_date_count"] == 0
