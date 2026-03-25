"""
Seed script — Japan Trip Jan 2026 scenario.

Four friends (Alice, Bob, Charlie, Dana) just returned from a 2-week Japan trip
(Jan 5–19). Alice and Bob each put shared expenses on their own credit cards,
so we have two statements. This demonstrates the multi-payer settlement feature.

Run after starting the backend:
    cd backend
    python seed.py

Demo flow:
1. Transactions → Needs Review → see 5 unknown transactions
2. Select all 5 → Set Participants "Everyone" → Confirm
3. Search "LAWSON" → select all from merchant → Set Category "Groceries" → Confirm
4. Settlement → pick anyone as fallback payer → see Alice and Bob each get credited
   for their own card's charges
"""

import sys
import os
import hashlib
import requests

# The API must be running for seeding via HTTP
BASE_URL = "http://localhost:8001/api"


def make_hash(date_str, description, amount):
    """Generate a unique fingerprint for a transaction (for idempotency)."""
    key = f"{date_str}|{description.lower()}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def seed():
    print("Seeding AutoSplit — Japan Trip Jan 2026...")

    # ── Step 1: Create the trip group with date range ─────────────────────────
    resp = requests.post(f"{BASE_URL}/groups", json={
        "name": "Japan Trip Jan 2026",
        "start_date": "2026-01-05",
        "end_date": "2026-01-19",
    })
    resp.raise_for_status()
    group = resp.json()
    group_id = group["id"]
    print(f"  Created group: '{group['name']}' (id={group_id}) [{group['start_date']} – {group['end_date']}]")

    # ── Step 2: Add 4 members ─────────────────────────────────────────────────
    members = {}
    for name in ["Alice", "Bob", "Charlie", "Dana"]:
        resp = requests.post(f"{BASE_URL}/groups/{group_id}/members", json={"name": name})
        resp.raise_for_status()
        m = resp.json()
        members[name] = m["id"]
        print(f"  Added member: {name} (id={m['id']})")

    alice_id = members["Alice"]
    bob_id   = members["Bob"]
    charlie_id = members["Charlie"]
    dana_id  = members["Dana"]
    all_ids  = [alice_id, bob_id, charlie_id, dana_id]

    # ── Step 3: Create statements directly in DB ──────────────────────────────
    # We bypass the PDF upload endpoint here and write directly — seeding only.
    from database import SessionLocal, init_db
    from models.models import Statement, Transaction, MerchantRule

    init_db()
    db = SessionLocal()

    # Statement A: Alice's credit card (she paid all her card's charges)
    stmt_a = Statement(
        group_id=group_id,
        statement_date="2026-02-08",
        period_start="2026-01-01",
        period_end="2026-02-08",
        source_hash=hashlib.sha256(b"seed_alice_stmt_japan_2026").hexdigest(),
        raw_text="[Seeded — Alice's card, Japan Jan 2026]",
        card_holder_member_id=alice_id,
    )
    db.add(stmt_a)
    db.flush()
    print(f"  Created Statement A: Alice's card (id={stmt_a.id})")

    # Statement B: Bob's credit card (he paid all his card's charges)
    stmt_b = Statement(
        group_id=group_id,
        statement_date="2026-02-10",
        period_start="2026-01-01",
        period_end="2026-02-10",
        source_hash=hashlib.sha256(b"seed_bob_stmt_japan_2026").hexdigest(),
        raw_text="[Seeded — Bob's card, Japan Jan 2026]",
        card_holder_member_id=bob_id,
    )
    db.add(stmt_b)
    db.flush()
    print(f"  Created Statement B: Bob's card (id={stmt_b.id})")

    # ── Step 4: Add transactions ──────────────────────────────────────────────
    # Convention: status="unreviewed" = default (needs or has been reviewed)
    #             status="confirmed"  = user confirmed it's correct
    #             status="excluded"   = out-of-range or personal, skip settlement

    # Helper shorthand
    def txn(stmt_id, date, desc, amount, category, participants, split=None,
            is_personal=False, status="unreviewed", confidence=1.0):
        return Transaction(
            statement_id=stmt_id,
            posted_date=date,
            description_raw=desc,
            amount=amount,
            txn_type="purchase",
            category=category,
            is_personal=is_personal,
            participants_json=participants,
            split_method_json=split or {"type": "equal"},
            overrides_json={},
            parse_confidence=confidence,
            txn_hash=make_hash(date, desc, amount),
            status=status,
        )

    def ask(stmt_id, date, desc, amount):
        """Unknown merchant — user needs to assign participants."""
        return txn(
            stmt_id, date, desc, amount, "unknown",
            {"type": "ask", "member_ids": []},
            confidence=0.5,
        )

    def excluded(stmt_id, date, desc, amount, category="other"):
        """Personal or out-of-date-range purchase — excluded from settlement."""
        return txn(
            stmt_id, date, desc, amount, category,
            {"type": "single", "member_ids": []},
            status="excluded",
        )

    everyone = {"type": "all", "member_ids": all_ids}

    # ── ALICE'S CARD (30 transactions) ────────────────────────────────────────
    # Jan 5-19 is the trip. Alice's card has a mix of:
    #  - Shared trip expenses (most of them)
    #  - Alice's personal purchases (is_personal=True)
    #  - Out-of-range transactions (Jan 3, Jan 22 → auto-excluded)
    #  - Unknown merchants (type="ask")

    alice_transactions = [
        # ── 8 Restaurants / Dining ──────────────────────────────────────────
        txn(stmt_a.id, "2026-01-05", "NARISAWA RESTAURANT TOKYO", 420.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-07", "ICHIRAN RAMEN SHINJUKU",     45.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-09", "STARBUCKS RESERVE ROASTERY",  18.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-11", "GONPACHI NISHI AZABU",       130.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-13", "SUSHI SAITO MINATO AZABU",   320.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-15", "AFURI RAMEN HARAJUKU",        42.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-17", "TEMPURA YAMANOUE TOKYO",      95.00, "dining", everyone),
        txn(stmt_a.id, "2026-01-18", "RAMEN NAGI SHINJUKU",         38.00, "dining", everyone),

        # ── 3 Trains / Transit ───────────────────────────────────────────────
        txn(stmt_a.id, "2026-01-06", "JR EAST SUICA CHARGE",       50.00, "transportation", everyone),
        txn(stmt_a.id, "2026-01-10", "JR EAST SUICA CHARGE",       50.00, "transportation", everyone),
        txn(stmt_a.id, "2026-01-16", "TOKYO METRO PASMO RELOAD",   30.00, "transportation", everyone),

        # ── 1 Hotel ──────────────────────────────────────────────────────────
        txn(stmt_a.id, "2026-01-05", "PARK HYATT TOKYO HOTEL",   1200.00, "travel", everyone),

        # ── 5 Convenience Stores ─────────────────────────────────────────────
        # THREE LAWSON transactions — demo "select all from merchant" feature
        txn(stmt_a.id, "2026-01-07", "LAWSON ROPPONGI HILLS",       22.50, "groceries", everyone),
        txn(stmt_a.id, "2026-01-11", "LAWSON SHINJUKU NISHIGUCHI",  18.00, "groceries", everyone),
        txn(stmt_a.id, "2026-01-14", "LAWSON SHIBUYA SCRAMBLE",     25.00, "groceries", everyone),
        txn(stmt_a.id, "2026-01-09", "FAMILYMART HARAJUKU",          31.00, "groceries", everyone),
        txn(stmt_a.id, "2026-01-08", "7-ELEVEN GINZA",              15.00, "groceries", everyone),

        # ── 3 Activities / Entertainment ─────────────────────────────────────
        txn(stmt_a.id, "2026-01-06", "TEAMLAB BORDERLESS ODAIBA",   38.00, "entertainment", everyone),
        txn(stmt_a.id, "2026-01-12", "TOKYO NATIONAL MUSEUM",       24.00, "entertainment", everyone),
        txn(stmt_a.id, "2026-01-18", "TOKYO SKYTREE OBSERVATION",   22.00, "entertainment", everyone),

        # ── 2 Shared Shopping ────────────────────────────────────────────────
        txn(stmt_a.id, "2026-01-08", "UNIQLO GINZA FLAGSHIP",       95.00, "shopping", everyone),
        txn(stmt_a.id, "2026-01-17", "KAPPABASHI KITCHEN TOOLS",    67.00, "shopping", everyone),

        # ── 1 Personal Purchase (Alice's clothing, not shared) ───────────────
        txn(stmt_a.id, "2026-01-11", "SHINJUKU MARUI DEPARTMENT",  180.00, "shopping",
            {"type": "single", "member_ids": [alice_id]}, is_personal=True),

        # ── 4 Unknown Merchants (user needs to review & assign) ──────────────
        ask(stmt_a.id, "2026-01-09", "SQ UNKNOWN VENDOR SHIBUYA",   55.00),
        ask(stmt_a.id, "2026-01-12", "PAYPAY MERCHANT 7829",        18.00),
        ask(stmt_a.id, "2026-01-15", "IC CARD TOPUP STATION",       25.00),
        ask(stmt_a.id, "2026-01-17", "SOFTBANK WIFI HOTSPOT",        8.00),

        # ── 2 Transactions OUTSIDE trip dates (auto-excluded) ────────────────
        # Jan 3 = before trip, Jan 22 = after trip → both get status="excluded"
        excluded(stmt_a.id, "2026-01-03", "NARITA AIRPORT PRIORITY LOUNGE", 45.00, "travel"),
        excluded(stmt_a.id, "2026-01-22", "TOKYO DISNEYLAND TICKETS",      120.00, "entertainment"),
    ]

    # ── BOB'S CARD (15 transactions) ─────────────────────────────────────────
    # Includes Kyoto side-trip expenses (Jan 10-11). Bob paid for the Shinkansen.

    bob_transactions = [
        # ── 3 Restaurants / Dining ───────────────────────────────────────────
        txn(stmt_b.id, "2026-01-08", "IPPUDO RAMEN IKEBUKURO",      45.00, "dining", everyone),
        txn(stmt_b.id, "2026-01-12", "TEMPURA KONDO GINZA",        350.00, "dining", everyone),
        txn(stmt_b.id, "2026-01-16", "UOBEI SUSHI SHIBUYA",         80.00, "dining", everyone),

        # ── 3 Trains / Transit ───────────────────────────────────────────────
        # The Shinkansen to Kyoto — biggest transit cost of the trip
        txn(stmt_b.id, "2026-01-10", "JR EAST SHINKANSEN KYOTO",   200.00, "transportation", everyone),
        txn(stmt_b.id, "2026-01-12", "JR EAST SUICA CHARGE",        40.00, "transportation", everyone),
        txn(stmt_b.id, "2026-01-14", "TOKYO METRO PASMO RELOAD",    20.00, "transportation", everyone),

        # ── 1 Hotel (Kyoto overnight) ─────────────────────────────────────────
        txn(stmt_b.id, "2026-01-10", "HOTEL MONTEREY KYOTO",       600.00, "travel", everyone),

        # ── 2 Convenience Stores ─────────────────────────────────────────────
        txn(stmt_b.id, "2026-01-07", "7-ELEVEN SHINJUKU",           19.00, "groceries", everyone),
        txn(stmt_b.id, "2026-01-13", "7-ELEVEN SHIBUYA CROSSING",   23.00, "groceries", everyone),

        # ── 1 Activity ───────────────────────────────────────────────────────
        txn(stmt_b.id, "2026-01-14", "TEAMLAB PLANETS TOYOSU",      35.00, "entertainment", everyone),

        # ── 1 Unknown Merchant (the 5th "needs review" transaction) ──────────
        ask(stmt_b.id, "2026-01-11", "FUSHIMI INARI STALL VENDOR",  28.00),

        # ── 1 Shared Shopping ────────────────────────────────────────────────
        txn(stmt_b.id, "2026-01-16", "DAISO JAPAN SHIBUYA",         40.00, "shopping", everyone),

        # ── 1 Personal Purchase (Bob's personal spending) ─────────────────────
        txn(stmt_b.id, "2026-01-16", "TOKYU HANDS SHIBUYA STORE",  150.00, "shopping",
            {"type": "single", "member_ids": [bob_id]}, is_personal=True),

        # ── 2 Transactions OUTSIDE trip dates (auto-excluded) ────────────────
        excluded(stmt_b.id, "2026-01-04", "KANSAI AIRPORT LOUNGE",   65.00, "travel"),
        excluded(stmt_b.id, "2026-01-23", "HANEDA AIRPORT SHOPPING", 85.00, "shopping"),
    ]

    # Insert all transactions
    all_transactions = alice_transactions + bob_transactions
    for t in all_transactions:
        db.add(t)

    db.commit()

    # ── Summary stats ─────────────────────────────────────────────────────────
    total = len(all_transactions)
    outside_range = sum(1 for t in all_transactions if t.posted_date < "2026-01-05" or t.posted_date > "2026-01-19")
    needs_review = sum(1 for t in all_transactions if t.participants_json and t.participants_json.get("type") == "ask")
    personal = sum(1 for t in all_transactions if t.is_personal)
    shared = [t for t in all_transactions
              if t.status != "excluded" and not t.is_personal
              and t.participants_json and t.participants_json.get("member_ids")]
    shared_total = sum(t.amount for t in shared)

    print(f"  Added {len(alice_transactions)} transactions to Alice's card (stmt {stmt_a.id})")
    print(f"  Added {len(bob_transactions)} transactions to Bob's card (stmt {stmt_b.id})")

    # ── Merchant rules ────────────────────────────────────────────────────────
    rules = [
        MerchantRule(group_id=group_id, merchant_key="lawson roppongi",
                     default_category="groceries",
                     default_participants_json={"type": "all", "member_ids": all_ids},
                     default_split_method_json={"type": "equal"}),
        MerchantRule(group_id=group_id, merchant_key="jr east",
                     default_category="transportation",
                     default_participants_json={"type": "all", "member_ids": all_ids},
                     default_split_method_json={"type": "equal"}),
        MerchantRule(group_id=group_id, merchant_key="teamlab borderless",
                     default_category="entertainment",
                     default_participants_json={"type": "all", "member_ids": all_ids},
                     default_split_method_json={"type": "equal"}),
    ]
    for r in rules:
        db.add(r)
    # Capture IDs before closing the session (SQLAlchemy expires objects after close)
    stmt_a_id = stmt_a.id
    stmt_b_id = stmt_b.id

    db.commit()
    db.close()

    # ── Print demo summary ────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("SEED COMPLETE — Japan Trip Jan 2026")
    print("=" * 60)
    print(f"  Group ID         : {group_id}")
    print(f"  Trip dates       : Jan 5 – Jan 19, 2026")
    print(f"  Members          : Alice ({alice_id}), Bob ({bob_id}), Charlie ({charlie_id}), Dana ({dana_id})")
    print(f"  Statement A (Alice's card) : id={stmt_a_id}")
    print(f"  Statement B (Bob's card)   : id={stmt_b_id}")
    print()
    print(f"  Total transactions : {total}")
    print(f"  Outside trip dates : {outside_range} (auto-excluded)")
    print(f"  Needs review       : {needs_review} (type=ask, unknown merchants)")
    print(f"  Personal           : {personal} (is_personal=True)")
    print(f"  Shared total       : ${shared_total:,.2f}")
    print()
    print("  DEMO STEPS:")
    print("  1. Transactions → 'Needs Review' → 5 transactions waiting")
    print("  2. Select all 5 → Set Participants 'Everyone' → Confirm")
    print("  3. 'All' → search 'LAWSON' → 'select all' → 3 selected")
    print("  4. Set Category 'Groceries' → Confirm")
    print("  5. Settlement → Alice + Bob each credited for their own card")
    print("  6. Balances sum to $0 (conservation of money)")
    print("=" * 60)


if __name__ == "__main__":
    # Ensure the backend directory is in the Python path for imports
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    seed()
