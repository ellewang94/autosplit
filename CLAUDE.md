# AutoSplit — Project Guide for Claude

## What This App Does

AutoSplit is a trip expense splitter. Users upload their credit card statements (PDF or CSV),
the app parses the transactions, figures out who owes what, and generates payment requests
("Hey Anthony, Venmo me $142.50 for shared expenses").

The core workflow: Create trip → Add friends → Upload statements → Review transactions → Settle up.

---

## Current Architecture (Local MVP)

AutoSplit is currently a **local-first** app — no accounts, no cloud, all data lives in a
SQLite database on the user's machine. This is intentional for the MVP but will change.

```
autosplit/
├── backend/          FastAPI (Python) — REST API, PDF parsing, settlement math
│   ├── adapters/     PDF/CSV parsers for each bank (Chase, Amex, BofA, universal)
│   ├── api/          HTTP route handlers (thin — just validate + call services)
│   ├── domain/       Pure business logic (categorization, splits, settlement math)
│   ├── models/       SQLAlchemy ORM models (database table definitions)
│   ├── schemas/      Pydantic request/response schemas (input validation + serialization)
│   ├── services/     Use cases (import_service.py, settlement_service.py)
│   └── tests/        pytest test suite
└── frontend/         React + Vite — the UI
    └── src/
        ├── api/      client.js — all API calls in one place
        ├── components/ Layout.jsx (sidebar + feedback modal)
        └── pages/    One file per page/route
```

**Run the app:** `bash /Users/ellewang/autosplit/start.sh`
- Backend: `http://localhost:8001` (FastAPI + SQLite)
- Frontend: `http://localhost:5173` (Vite dev server, proxies /api → 8001)
- API docs: `http://localhost:8001/docs`

---

## Key Technical Decisions & Why

### Backend: FastAPI (Python)
Python because the PDF parsing ecosystem (pdfplumber) is far better than Node.js equivalents.
FastAPI because it auto-generates docs, has great async support, and Pydantic schemas make
request validation clean.

### Database: SQLite → PostgreSQL (planned)
Currently SQLite for zero-dependency local dev. Migration to PostgreSQL (via Supabase) is
the next major milestone — required for cloud sync and user accounts.

### Frontend: React + Vite + TailwindCSS
Standard React. No Redux — just React Query for server state (caching, refetch, optimistic
updates) and useState for local UI state. Tailwind for styling.

**Design system:** "Obsidian Ledger" dark theme. Custom ink palette (ink-950 to ink-50) +
electric lime accent (#C8F135). Fonts: Cormorant Garamond (headings), Geist (body),
Geist Mono (numbers). Never use Inter or generic system fonts. Never use purple gradients.
Always use icons, never emojis.

### PDF Parsing
Each bank has its own format — dedicated parsers for Chase, Amex, BofA, plus a universal
heuristic parser for everything else. Bank is auto-detected from first-page text.

- Chase: `adapters/chase_parser.py` — `MM/DD` dates, standard format
- Amex: `adapters/amex_parser.py` — `MM/DD/YY` dates, amounts end with `⧫`
- BofA: `adapters/bofa_parser.py` — dual dates (`MM/DD MM/DD`), 4-digit ref + account numbers
- Universal: `adapters/universal_parser.py` — heuristic, `parse_confidence=0.85`

**Important:** Amex CSV exports use POSITIVE = purchase (opposite of Chase which is negative).
This is captured in `adapters/csv_parser.py` as `amount_is_negative_for_purchases: False` for Amex.

### Categorization: Two-Tier Keyword System
`domain/categories.py` — the categorization engine.
- Tier 1 (confidence 1.0): Brand name substring match ("starbucks", "doordash")
- Tier 2 (confidence 0.9): Generic word boundary match ("restaurant", "pharmacy")
- Unknown = 0.5 confidence

**Auto-confirm logic** (added in import_service.py): if `overall_confidence >= 0.9` AND
`participants.type == "all"`, the transaction is auto-marked `status="confirmed"` at import.
Only genuinely ambiguous transactions (shopping, subscriptions, unknown) land in "Needs Review".

### Settlement Math
`domain/settlement.py` — pure functions, no database access.
Uses a greedy debt-minimization algorithm (not just pairwise — minimizes total # of transfers).
Supports equal, percentage, and exact splits. All amounts in the group's base currency.

### Split Methods
Backend in `domain/splits.py` supports three types, stored as JSON on each transaction:
- `{"type": "equal"}` — divide evenly
- `{"type": "percentage", "percentages": {"1": 60, "2": 40}}` — by member ID
- `{"type": "exact", "amounts": {"1": 45.00, "2": 23.50}}` — fixed amounts

---

## Data Model (Key Tables)

```
Group → has many Members, Statements, MerchantRules
Statement → has many Transactions (one per uploaded PDF/CSV)
Transaction → belongs to Statement; has participants_json, split_method_json, status
MerchantRule → "remember this merchant" rules per group
Feedback → in-app feedback widget submissions (local only)
```

**Transaction.status**: `"unreviewed"` | `"confirmed"` | `"excluded"`
- unreviewed = needs attention OR was auto-assigned with low confidence
- confirmed = user approved OR auto-confirmed (high confidence + all-member split)
- excluded = not included in settlement

**Transaction.participants_json.type**: `"all"` | `"custom"` | `"single"` | `"ask"`
- ask = genuinely ambiguous, shows up in "Needs Review" filter

---

## Planned Direction: Cloud + Growth

**This is the next major milestone.** The app needs to become a cloud product to support:
1. User accounts (sign up / log in)
2. Trip sharing (shareable read-only links)
3. Invite friends to a trip
4. Viral referral loop: non-user receives split → sees they owe $X → signs up
5. Monetization via Stripe

### Planned Stack Change
| Layer | Current | Target |
|---|---|---|
| Database | SQLite (local file) | PostgreSQL via Supabase |
| Auth | None | Supabase Auth (email + Google OAuth) |
| File storage | None | Supabase Storage (for uploaded PDFs) |
| Backend hosting | Local only | Railway or Render |
| Frontend hosting | Local only | Vercel |
| Payments | None | Stripe |

### Monetization Model
- **Free tier**: 1 trip forever (the viral bait — whole group uses it free)
- **Pay-per-trip**: $4.99/trip after the first free one
- **Subscription**: $7.99/month unlimited trips (anchor price)
- The person receiving the payment request ("You owe $142") should experience zero friction —
  they see a read-only view without signing up. The viral moment is: "how did my friend
  calculate this? I want this for my next trip."

### New Routes/Pages Needed for Cloud Version
- `/login` `/signup` — auth pages
- `/share/:tripShareCode` — public read-only trip summary (no auth required)
- `/settings` — account, billing, subscription
- `/pricing` — landing-style pricing page

### New Database Tables Needed
- `users` — email, hashed_password, stripe_customer_id, created_at
- `trip_shares` — share_code (UUID), group_id, created_by, expires_at, view_count
- `subscriptions` — user_id, stripe_subscription_id, plan, status, period_end

---

## How the Codebase Is Layered

The backend follows clean architecture — don't mix layers:
```
HTTP (routes.py) → Service layer → Domain layer → Database
                         ↑                ↑
                  import_service.py   categories.py
                  settlement_service  splits.py
                                      settlement.py
```

- **Routes** (`api/routes.py`): Only HTTP concerns. Validate input, call service, return schema.
- **Services** (`services/`): Orchestration. Coordinates parsers + domain + DB. No raw SQL.
- **Domain** (`domain/`): Pure logic. No database, no HTTP. Fully testable.
- **Adapters** (`adapters/`): PDF/CSV parsing. Takes bytes, returns ParsedStatement.

---

## Testing

```bash
cd backend && python -m pytest tests/ -v
```

Tests use an in-memory SQLite database (not the production DB). Key test files:
- `test_settlement.py` — settlement math
- `test_csv_parser.py` — CSV parsing including Amex sign convention
- `test_bulk_update.py` — bulk transaction operations
- `test_multi_payer.py` — multi-card settlement scenarios

Always run tests after changing: `domain/`, `adapters/`, `services/import_service.py`, `services/settlement_service.py`.

---

## Elle's Working Style

Elle is a non-technical builder using vibe coding. When working on this project:

1. **Always explain what you're doing and why** in plain English before/while making changes.
2. **Write production-quality code** — Elle can't review for bugs, so take ownership.
3. **Add plain-English comments** to all non-obvious code.
4. **Never introduce breaking changes** to the local dev setup — `start.sh` must always work.
5. **Design matters** — follow the Obsidian Ledger aesthetic strictly. No Inter font, no purple
   gradients, no emojis, always icons. Reference `tailwind.config.js` for the color palette.
6. **Test-driven debugging** — write a failing test first, then fix, then verify tests pass.
7. **Ask before major architectural changes** — especially anything touching database migrations,
   adding new dependencies, or changing the local dev setup.

---

## Common Pitfalls

- **SQLite vs PostgreSQL JSON**: SQLite stores JSON as text, PostgreSQL as native JSONB.
  When migrating, JSON queries like `.filter(Transaction.participants_json["type"] == "ask")`
  need to change to use PostgreSQL's `->` operator or SQLAlchemy's JSON column accessors.

- **PDF parsing year inference**: Transaction dates in PDFs are often `MM/DD` with no year.
  The `_infer_year()` function in each parser handles the Dec→Jan boundary (e.g. a December
  statement containing a January date should get next year, not current year).

- **Amex CSV sign convention**: POSITIVE = purchase (Amex), NEGATIVE = purchase (Chase/BofA).
  This is set per-bank in `csv_parser.py` as `amount_is_negative_for_purchases`.

- **Manual expenses statement**: When a user adds an expense manually, it's saved to a virtual
  Statement with `is_manual=True`. This statement is hidden in the settlement UI's card-holder
  list but included in settlement math. Don't accidentally filter it out.

- **Transaction status vs participant type**: Two separate concepts.
  - `status` = has the user reviewed it? ("unreviewed", "confirmed", "excluded")
  - `participants_json.type` = who splits it? ("all", "custom", "single", "ask")
  "Needs Review" in the UI means `participants_json.type === "ask"` (not `status === "unreviewed"`).
