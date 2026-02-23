"""
Seed script — populates the database with sample data for demo/testing.

Scenario: 3 roommates (Alice, Bob, Charlie) in "The Apartment".
Alice holds the credit card and paid the January 2026 statement.

Run this after starting the backend:
    cd backend
    python seed.py

The data is designed so you can immediately demo the full flow:
- Go to Settlement, pick Alice as card holder
- See: Bob owes Alice ~$X, Charlie owes Alice ~$Y
"""

import sys
import os
import requests

# The API must be running for this to work
BASE_URL = "http://localhost:8001/api"


def seed():
    print("🌱 Seeding AutoSplit with sample data...")

    # ── Create Group ──────────────────────────────────────────────────────────
    resp = requests.post(f"{BASE_URL}/groups", json={"name": "The Apartment"})
    resp.raise_for_status()
    group = resp.json()
    group_id = group["id"]
    print(f"✓ Created group: '{group['name']}' (id={group_id})")

    # ── Add Members ───────────────────────────────────────────────────────────
    members = {}
    for name in ["Alice", "Bob", "Charlie"]:
        resp = requests.post(f"{BASE_URL}/groups/{group_id}/members", json={"name": name})
        resp.raise_for_status()
        member = resp.json()
        members[name] = member["id"]
        print(f"✓ Added member: {name} (id={member['id']})")

    alice_id = members["Alice"]
    bob_id = members["Bob"]
    charlie_id = members["Charlie"]
    all_ids = [alice_id, bob_id, charlie_id]

    # ── Create Statement (simulating an imported PDF) ─────────────────────────
    # We'll directly POST to create a statement record and then add transactions
    # In production this comes from PDF upload, but for seeding we use the API
    import hashlib
    from datetime import date

    # Unique hash for this "fake" statement
    fake_hash = hashlib.sha256(b"seed_statement_jan_2026").hexdigest()

    # Use the database directly for seeding (simpler than routing through the file upload)
    from database import SessionLocal, init_db
    from models.models import Statement, Transaction

    init_db()
    db = SessionLocal()

    stmt = Statement(
        group_id=group_id,
        statement_date="2026-02-08",
        period_start="2026-01-09",
        period_end="2026-02-08",
        source_hash=fake_hash,
        raw_text="[Seeded statement — not from real PDF]",
        card_holder_member_id=alice_id,
    )
    db.add(stmt)
    db.flush()
    stmt_id = stmt.id
    print(f"✓ Created statement (id={stmt_id}, period: Jan 9 – Feb 8 2026)")

    # ── Add Sample Transactions ───────────────────────────────────────────────
    # These represent a realistic month of shared household expenses

    import hashlib as _h
    def make_hash(d, desc, amt):
        return _h.sha256(f"{d}|{desc.lower()}|{amt:.2f}".encode()).hexdigest()[:16]

    transactions_data = [
        # ── Utilities — split all three ways ──────────────────────────────
        {
            "posted_date": "2026-01-12",
            "description_raw": "CON EDISON PAYMENT",
            "amount": 142.50,
            "category": "utilities",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        {
            "posted_date": "2026-01-14",
            "description_raw": "XFINITY INTERNET",
            "amount": 89.99,
            "category": "utilities",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        # ── Dining — split all three ways ─────────────────────────────────
        {
            "posted_date": "2026-01-17",
            "description_raw": "LILIA RESTAURANT BROOKLYN NY",
            "amount": 187.50,
            "category": "dining",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        {
            "posted_date": "2026-01-22",
            "description_raw": "DOORDASH*CHIPOTLE",
            "amount": 54.30,
            "category": "dining",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        {
            "posted_date": "2026-01-28",
            "description_raw": "STARBUCKS STORE 12345",
            "amount": 23.60,
            "category": "dining",
            "participants_json": {"type": "custom", "member_ids": [alice_id, bob_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Groceries — split all three ways ──────────────────────────────
        {
            "posted_date": "2026-01-19",
            "description_raw": "WHOLE FOODS MARKET 123",
            "amount": 212.43,
            "category": "groceries",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        {
            "posted_date": "2026-02-02",
            "description_raw": "TRADER JOE S",
            "amount": 98.75,
            "category": "groceries",
            "participants_json": {"type": "all", "member_ids": all_ids},
            "split_method_json": {"type": "equal"},
        },
        # ── Subscriptions — personal (Alice) ──────────────────────────────
        {
            "posted_date": "2026-01-15",
            "description_raw": "NETFLIX.COM",
            "amount": 22.99,
            "category": "subscriptions",
            "is_personal": True,  # Alice's personal Netflix, not shared
            "participants_json": {"type": "single", "member_ids": [alice_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Subscription split between Alice & Bob ─────────────────────────
        {
            "posted_date": "2026-01-15",
            "description_raw": "SPOTIFY USA",
            "amount": 16.99,
            "category": "subscriptions",
            "participants_json": {"type": "custom", "member_ids": [alice_id, bob_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Transportation — Alice only (personal) ─────────────────────────
        {
            "posted_date": "2026-01-20",
            "description_raw": "UBER *TRIP NEW YORK",
            "amount": 34.50,
            "category": "transportation",
            "is_personal": True,
            "participants_json": {"type": "single", "member_ids": [alice_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Entertainment — Alice & Charlie split ──────────────────────────
        {
            "posted_date": "2026-01-25",
            "description_raw": "AMC THEATRES",
            "amount": 42.00,
            "category": "entertainment",
            "participants_json": {"type": "custom", "member_ids": [alice_id, charlie_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Needs review (unknown merchant) ───────────────────────────────
        {
            "posted_date": "2026-01-30",
            "description_raw": "SQ *BODEGA ON FIRST",
            "amount": 47.20,
            "category": "unknown",
            "participants_json": {"type": "ask", "member_ids": []},
            "split_method_json": {"type": "equal"},
            "parse_confidence": 0.5,
        },
        # ── Shopping — personal (Alice) ────────────────────────────────────
        {
            "posted_date": "2026-02-01",
            "description_raw": "AMAZON.COM*1A2B3C",
            "amount": 67.89,
            "category": "shopping",
            "is_personal": True,
            "participants_json": {"type": "single", "member_ids": [alice_id]},
            "split_method_json": {"type": "equal"},
        },
        # ── Custom split (percentage) — rent contribution ──────────────────
        {
            "posted_date": "2026-01-10",
            "description_raw": "ZELLE PAYMENT - HOME DEPOT",
            "amount": 85.00,
            "category": "utilities",
            "participants_json": {"type": "custom", "member_ids": [alice_id, bob_id, charlie_id]},
            "split_method_json": {
                "type": "percentage",
                "percentages": {str(alice_id): 50, str(bob_id): 30, str(charlie_id): 20}
            },
        },
    ]

    for i, t_data in enumerate(transactions_data):
        txn_hash = make_hash(t_data["posted_date"], t_data["description_raw"], t_data["amount"])
        txn = Transaction(
            statement_id=stmt_id,
            posted_date=t_data["posted_date"],
            description_raw=t_data["description_raw"],
            amount=t_data["amount"],
            txn_type="purchase",
            category=t_data.get("category", "unknown"),
            is_personal=t_data.get("is_personal", False),
            participants_json=t_data.get("participants_json"),
            split_method_json=t_data.get("split_method_json", {"type": "equal"}),
            overrides_json={},
            parse_confidence=t_data.get("parse_confidence", 1.0),
            txn_hash=txn_hash,
        )
        db.add(txn)

    db.commit()
    print(f"✓ Added {len(transactions_data)} sample transactions")

    # ── Add a Merchant Rule ───────────────────────────────────────────────────
    from models.models import MerchantRule
    rule = MerchantRule(
        group_id=group_id,
        merchant_key="whole foods market",
        default_category="groceries",
        default_participants_json={"type": "all", "member_ids": all_ids},
        default_split_method_json={"type": "equal"},
    )
    db.add(rule)

    rule2 = MerchantRule(
        group_id=group_id,
        merchant_key="trader joe",
        default_category="groceries",
        default_participants_json={"type": "all", "member_ids": all_ids},
        default_split_method_json={"type": "equal"},
    )
    db.add(rule2)

    db.commit()
    db.close()

    print("✓ Added 2 merchant rules (Whole Foods, Trader Joe's)")
    print()
    print("═" * 50)
    print("✅ Seed complete! Here's what to demo:")
    print(f"   Group ID: {group_id}")
    print(f"   Statement ID: {stmt_id}")
    print(f"   Alice (card holder) ID: {alice_id}")
    print(f"   Bob ID: {bob_id}")
    print(f"   Charlie ID: {charlie_id}")
    print()
    print("   → Go to Settlement, pick Alice as card holder")
    print("   → Bob and Charlie will owe Alice money")
    print("   → 1 transaction needs review (unknown bodega)")
    print("═" * 50)


if __name__ == "__main__":
    # Add backend dir to path so imports work
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    seed()
