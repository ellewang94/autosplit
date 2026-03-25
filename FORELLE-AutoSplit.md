# FORELLE: AutoSplit — The Making Of

*Your plain-English guide to what we built, how it works, and what you can learn from it.*

---

## What Is This Project?

AutoSplit is a web app that solves the roommate problem: one person puts shared household expenses on their credit card, then everyone needs to figure out who owes what. Instead of screenshotting your Venmo requests and doing math in Notes, you upload your Chase PDF statement and AutoSplit does all the work.

In about 2 minutes you can see: "Bob owes you $307.62, Charlie owes you $299.83" — with a copyable message to paste into iMessage.

---

## The Big Picture: How the App Works

Think of it like a well-organized restaurant with three departments:

```
PDF Statement (raw ingredient)
      ↓
   KITCHEN (backend)
      ├── Parser: reads the PDF, extracts transactions
      ├── Categorizer: labels each transaction (dining? groceries?)
      ├── Database: stores everything
      └── Settler: runs the math
      ↓
   DINING ROOM (frontend)
      └── Shows you the results, lets you edit and override
```

The frontend (React) talks to the backend (FastAPI) via HTTP requests. The backend stores everything in a SQLite database file — just a single file on your computer, no cloud needed.

---

## The Technical Architecture

### Backend: FastAPI + SQLite

**FastAPI** is a Python web framework that's become the gold standard for building APIs quickly. It's like Flask but with built-in type checking, automatic documentation, and async support. Every API endpoint is a Python function that FastAPI wraps in HTTP.

**SQLite** is a "serverless database" — instead of running a database server, everything lives in a single file (`autosplit.db`). Think of it like a sophisticated Excel spreadsheet that Python can query with SQL. Perfect for an app that runs on one machine.

**SQLAlchemy** is the "translator" between Python objects and SQL. Instead of writing SQL queries by hand, you define Python classes and SQLAlchemy handles the database operations.

### Frontend: React + Vite + Tailwind

**React** is a JavaScript library for building user interfaces. The key idea: instead of manually updating the HTML when data changes, you describe what the UI *should* look like given the current data, and React figures out what to update.

**Vite** is the build tool. It serves your React code during development, hot-reloads on changes, and bundles everything for production. Much faster than the older Create React App.

**Tailwind CSS** is a "utility-first" CSS framework. Instead of writing CSS files, you apply small utility classes directly in your HTML/JSX. It feels weird at first but becomes extremely fast once you learn it.

**React Query** manages data fetching. It handles loading states, caching, and re-fetching automatically. Without it, you'd write a lot of repetitive `useEffect` + `useState` boilerplate for every API call.

---

## The Codebase Structure

```
backend/
  adapters/chase_parser.py    ← Reads Chase PDFs
  adapters/csv_parser.py      ← Reads bank CSVs (Chase, Amex, BofA, Citi, CapOne, Discover)
  domain/categories.py        ← Keyword → category matching
  domain/splits.py            ← Equal/percentage/exact split math
  domain/settlement.py        ← Who owes whom (the smart algorithm)
  services/import_service.py  ← Orchestrates the upload + manual expense flow
  services/settlement_service.py ← Orchestrates settlement computation
  models/models.py            ← Database table definitions
  schemas/schemas.py          ← API request/response shapes
  api/routes.py               ← HTTP endpoints (thin wrappers)
  seed.py                     ← Sample data for demo
  Dockerfile                  ← Cloud deployment (Railway)
  .env.example                ← Environment variable template
  tests/
    conftest.py               ← Shared test DB setup
    shared.py                 ← Shared engine + client (avoids isolation bugs)
    test_settlement.py        ← Settlement math (31 tests)
    test_parser.py            ← PDF parsing + year inference (30 tests)
    test_bulk_update.py       ← Bulk update + security (7 tests)
    test_multi_payer.py       ← Multi-card settlement (8 tests)
    test_csv_parser.py        ← All CSV bank formats (34 tests)
    test_manual_expenses.py   ← Manual expense CRUD (20 tests)

frontend/
  src/api/client.js           ← All API calls in one place
  src/components/Layout.jsx   ← Navigation + mobile sidebar
  src/pages/GroupsPage.jsx    ← Trip list + creation
  src/pages/TripOverviewPage.jsx ← Dashboard per trip
  src/pages/UploadPage.jsx    ← PDF/CSV upload + statement management
  src/pages/TransactionsPage.jsx ← Review + bulk-edit expenses
  src/pages/SettlementPage.jsx ← Multi-card settlement with per-payer credits
  vercel.json                 ← Cloud deployment config (Vercel)
  .env.example                ← Environment variable template
```

### The "Layer Cake" Pattern

Notice the three-layer structure: **adapters → services → domain**. This is a deliberate architecture decision called "Layered Architecture" (or "Clean Architecture"):

- **Domain layer** is the business logic core — zero dependencies on anything external. The `splits.py` and `settlement.py` files have no idea what a PDF is or what an HTTP request is. They just do math.

- **Adapters layer** knows how to read specific bank formats. Chase PDF today; BofA CSV tomorrow. Adding a new bank = write a new file in `/adapters`, nothing else changes.

- **Services layer** orchestrates. It takes the data from the adapter, runs it through the domain logic, and saves it to the database. The API layer just calls these service functions.

This matters because: if Chase changes their PDF format, you only touch `chase_parser.py`. If you want to change how settlements are calculated, you only touch `settlement.py`. Nothing bleeds into everything else.

---

## The Clever Parts

### 1. Year Inference (The Dec/Jan Problem)

Chase statements show transaction dates as `01/15` (month/day, no year). Simple enough — *until* you get a statement that spans December and January.

A statement from Dec 10 to Jan 9 will have transactions dated `12/15` (last year) and `01/05` (this year). Without knowing the statement period, you can't tell which year a transaction belongs to.

Our solution: look at the statement period dates (always include the year), then use heuristic matching to assign the right year to each transaction. Key rule: if the date falls within (or close to) the statement period, use that year. Handles the Dec/Jan boundary cleanly.

This sounds minor but gets quietly wrong in a lot of financial apps.

### 2. Idempotent Import (No Duplicates)

"Idempotent" is a fancy word for: doing the same thing twice gives the same result as doing it once.

We hash the entire PDF file (SHA-256) and store that hash in the database. Re-upload the same PDF? We check: "have I seen this hash before?" If yes, we return the existing statement without duplicating anything. Safe to re-upload as many times as you want.

Per-transaction, we also hash date+merchant+amount, which catches edge cases where someone might manually create a duplicate somehow.

### 3. The Settlement Algorithm (Min Cash Flow)

This is the problem: given a bunch of debts (A owes B $20, B owes C $30, etc.), what's the minimum number of transfers to settle everything?

The naive approach: one transfer per debt. Terrible for a household with 5 people and 50 transactions.

Our approach: **net first, then transfer**.

Step 1: Compute each person's *net* position:
- "+$200" means you're owed $200 total (you overpaid)
- "-$100" means you owe $100 total (you underpaid)

Step 2: Greedy algorithm — biggest debtor pays biggest creditor:
- Sort people from "owes most" to "owes least"
- Alice owes $200, Bob owes $100 → they each pay the biggest creditor first
- Keep repeating until everyone is at $0

In mathematics this is called the "minimum cash flow" problem. Our greedy approach doesn't always find the absolute minimum, but it works extremely well in practice (usually achieves the minimum or comes very close).

Classic example of simplification: if Alice → Bob → Charlie → Alice (a chain of debts), instead of 3 transfers, we can do 0 (they all cancel out!). Our algorithm catches this automatically.

### 4. Auto-categorization

Simple keyword matching. "NETFLIX.COM" contains "netflix" → subscriptions. "WHOLE FOODS MARKET #123" contains "whole foods" → groceries.

Then each category has a default participant suggestion:
- Utilities → everyone (it's shared infrastructure)
- Subscriptions → one person (ask who)
- Dining → everyone (assume group dinner)
- Shopping → one person (assume personal)

The user can override everything. And if you "save as merchant rule," next import auto-applies your preference — no re-categorizing the same merchant every month.

---

## Technologies and Why We Chose Them

| Technology | Why We Chose It | The Alternative |
|------------|-----------------|-----------------|
| FastAPI | Fast, modern, excellent documentation, type-safe | Flask (older, more manual) |
| SQLite | Zero-setup, file-based, perfect for single-user app | PostgreSQL (needs a server running) |
| SQLAlchemy | Python-first database, handles migrations gracefully | Raw SQL (more power, much more to write) |
| pdfplumber | Best Python library for text extraction from PDFs | PyPDF2 (worse layout handling), Tabula (Java dependency) |
| React | Standard choice, huge ecosystem | Vue (smaller, fine too), Svelte (nicer syntax, smaller community) |
| Tailwind | Fast to prototype, consistent, easy to customize | Plain CSS, styled-components, CSS modules |
| React Query | Removes 80% of data-fetching boilerplate | Redux (overkill for this), Zustand (also good) |
| Vite | Very fast, modern, uses native ES modules | Create React App (slow, outdated) |

---

## Bugs We Hit and How We Fixed Them

### Bug 1: Two DB files in different locations

**What happened:** The backend was running from `/autosplit/backend/` and used `sqlite:///./autosplit.db` (relative path). The seed script was run from `/autosplit/` and connected to a different file. Data was being written to two different places.

**The symptom:** Groups appeared empty, but transactions existed. The settlement API couldn't find any members.

**The fix:** Use `os.path.abspath(__file__)` to always get the absolute path of the `database.py` file, then construct the database path relative to that. No matter where you run from, the DB is always in the right place.

**Lesson:** Always use absolute paths for file-based databases. Relative paths are treacherous — they depend on where Python is invoked from, which changes between terminal sessions.

### Bug 2: Port collision with another project

**What happened:** Another project was already running on port 8000. My backend started but OS's SO_REUSEPORT meant both processes could bind to the same port, and requests went to the wrong app.

**The symptom:** The health check returned `{"ok":true}` instead of my expected response. Settlement numbers were completely wrong.

**The fix:** Switch AutoSplit to port 8001.

**Lesson:** Always verify which process is actually handling your requests. `lsof -i :PORT` shows you exactly who owns a port.

### Bug 3: Settlement test verification logic inverted

**What happened:** The test was checking `original_balance + settled[member]` but the signs were wrong. A creditor (balance: +$100) receives $100 in transfers, which should bring them to 0. But the test computed 100 + 100 = 200 instead of 100 - 100 = 0.

**The fix:** Flip the direction: `settled[from] += amount` (paying off a debt reduces the negative), `settled[to] -= amount` (collecting reduces the positive).

**Lesson:** When testing financial math, always include a "conservation of money" assertion: the total of all balances must always equal zero. If it doesn't, money is being created or destroyed somewhere in your code.

### Bug 4: Merchant key including location data

**What happened:** We normalized merchant names to 4 words for fuzzy matching. "WHOLE FOODS MARKET #123 NEW YORK NY" → first 4 words after stripping digits → "whole foods market new". "WHOLE FOODS MARKET #456 BROOKLYN NY" → "whole foods market brooklyn". Different keys!

**The fix:** Use 3 words instead of 4. "whole foods market" matches regardless of location.

**Lesson:** When doing fuzzy key matching on real-world data, test with actual examples and be conservative — fewer words = more matches but fewer false distinctions. Adjust based on the data's actual structure.

---

## How Good Engineers Think

### "Separation of Concerns"

Every file in this codebase has exactly one job. `settlement.py` only does math. `chase_parser.py` only reads PDFs. `routes.py` only handles HTTP. When something breaks, you know immediately where to look.

Compare this to the alternative: one giant file with all the logic mixed together. "The God Object" anti-pattern — and it's very tempting when you're moving fast.

### "Make the right thing easy"

The architecture makes it easy to add a new bank format (write one file in `/adapters`) and hard to accidentally create coupling between the PDF parser and the settlement logic. Good code makes the right path the natural path.

### "Test the domain, not the framework"

The tests in `tests/` don't test FastAPI, SQLAlchemy, or React. They test the *business logic*: can we split $30 three ways? Does the settlement algorithm find the minimum transfers? Does year inference work across the Dec/Jan boundary?

Frameworks come and go. Business logic is what makes your product work.

### "Data model is destiny"

We spent time thinking about the data model before writing a line of feature code. The `Transaction` table stores `participants_json` and `split_method_json` as JSON columns — flexible enough to handle "equal", "percentage", and "exact" splits without schema migrations. The `MerchantRule` table cleanly separates learned preferences from transaction data.

Getting the data model right is the highest-leverage decision in any app. Changing it later is painful (data migrations, backward compatibility). Getting it right early means features are easy to add.

---

## Potential Pitfalls to Avoid

1. **Always close database sessions.** FastAPI's `Depends(get_db)` with try/finally handles this automatically. If you access the DB outside of FastAPI (like in seed.py), always `db.close()`.

2. **Floating point math lies.** `10.0 / 3` in Python = `3.3333333333333335`. `3.34 + 3.33 + 3.33 = 10.000000000000002`. We always round to 2 decimal places and use a rounding remainder algorithm to ensure splits sum exactly to the total.

3. **SQLite doesn't enforce foreign keys by default.** You can delete a group and leave orphaned transactions. Either add `PRAGMA foreign_keys = ON` or handle cleanup in the application layer (we used `cascade="all, delete-orphan"` in SQLAlchemy relationships).

4. **PDF parsing is hard.** pdfplumber is excellent but no PDF is identical. Always fall back gracefully, store parse_confidence, and show "needs review" for low-confidence transactions instead of silently using bad data.

---

## What You Can Build Next

The architecture is designed for extension:

- **New bank format?** Write `adapters/bofa_parser.py`. Zero other changes.
- **New split method?** Add a function to `domain/splits.py` and a new `type` value.
- **Group expenses (not credit card)?** Add a `payer_member_id` field to `Transaction` and adjust the settlement computation.
- **New bank format?** Write `adapters/bofa_parser.py`. Zero other changes.
- **New split method?** Add a function to `domain/splits.py` and a new `type` value.
- **Authentication?** Supabase Auth is already in your Supabase project. Adding login is mostly frontend work.

The domain layer being pure Python with zero dependencies means it's trivially portable — you could run the same settlement logic in a CLI, a Telegram bot, or a mobile app.

---

## Session 2: Going Big — Multi-currency, Mobile, CSV, Edit, Cloud Prep

*A lot happened in the second big session. Here's what we built and what we learned.*

### What we added

**CSV Import** — We added a full CSV parser that auto-detects the bank format from the column headers. You don't tell it "this is a Chase file." It reads the first row and figures it out — Chase, Amex, Bank of America, Citi, Capital One, Discover, and a generic fallback. Each bank has its own quirks:

- Chase: purchases are **negative** (we flip the sign)
- Amex: purchases are also **negative** (confusingly, opposite of what you'd expect)
- Discover: negative too (confirmed from real exports)
- Citi & Capital One: separate Debit/Credit columns instead of one Amount column
- BofA: negative purchases like Chase

The key insight: the module docstring originally said "Amex: positive for purchases" but the actual code said "Amex: negative for purchases (confirmed from real exports)." When code and documentation contradict each other, **trust the code**. Real data from the actual bank matters more than what someone wrote in a comment.

**Multi-currency** — The group has a `base_currency` (e.g., USD). When someone imports a statement in JPY or enters a ¥5,000 expense, we store two things:
1. The converted base-currency amount ($33.50) — used for all settlement math
2. The original foreign-currency amount (¥5,000) — displayed in the UI as "¥5,000 (≈$33.50)"

This way the math always works in one currency, but users can see what they actually spent in the original currency.

**Multi-card settlement** — The biggest UX problem in v1: a single "Who paid?" dropdown that made no sense for trips where multiple people used their own cards.

The backend already supported this — it had a `statement_payers` dict that mapped each statement to its card holder. The frontend just wasn't using it.

The redesign: instead of one dropdown, the settlement page shows each real imported statement with who holds that card (green checkmark if assigned, amber warning if not). The settlement automatically uses each card's holder as the payer for those transactions. The "fallback payer" dropdown only appears when some statements don't have a card holder assigned.

**Mobile layout** — The sidebar needed to work on phones. The approach: CSS position `fixed` on mobile (overlays the content) with a slide animation, and `md:static` on desktop (which overrides `fixed` and puts it back in the normal document flow). The trick: Tailwind's `md:static` literally overrides the `fixed` property — they're not additive, the more specific class wins.

**Edit transactions** — Users can now click a pencil icon on any transaction row to fix the date, amount, description, category, or participants. The edit modal pre-fills with the current values. The backend logs every change in `overrides_json` (old value → new value) for auditability.

**Delete transactions and statements** — Hover over any row to reveal a trash icon. Clicking shows an inline "Delete? Yes / No" — no popup dialogs that browsers handle weirdly on mobile.

**Manual expense entry** — No bank statement? No problem. Users can type in any expense: date, merchant, amount, who paid, who splits it. These land in a "virtual statement" — a fake container that exists purely because the database requires every transaction to belong to a statement. The virtual statement has a stable ID based on `manual:{group_id}:{member_id}` so it's found (not duplicated) on subsequent manual entries.

### Bugs we hit in this session

**The `is_manual` bug** — The frontend needed to distinguish real imported statements from manual expense containers. We initially used `period_start === null` as the signal, but CSV imports can also have null period_start. The fix: add an explicit `is_manual: bool` field to `StatementResponse`, computed server-side from whether `source_hash.startswith('manual:')`. Never infer intent from nullable data — add an explicit flag.

**The `group` CSS class bug** — Tailwind's `group-hover:opacity-100` only works when the parent element has the `group` CSS class. The transaction table rows were missing it. Result: the hover-reveal action buttons were invisible forever. Simple fix, confusing symptom — `group` is the kind of class you add once and never think about again, which means you forget it when building new tables.

**The test isolation bug** — Two test files both did `app.dependency_overrides[get_db] = override_get_db` at module level, each with their own in-memory database engine. When pytest imported both files, the second file's override silently overwrote the first's. Tests from the first file were now talking to the second file's database, which had empty tables. Result: "no such table: statements" errors that only appeared when running the full test suite (not when running one file at a time).

The fix: a `conftest.py` + `shared.py` pattern. One shared engine, one override, applied once. Both test files import from `shared.py`. This is the standard pattern for pytest with FastAPI — it's worth knowing cold because this bug will bite you every time.

**Sign convention confusion in CSV parsing** — The module docstring said "Amex: positive for purchases" but the code said "Amex: negative for purchases (confirmed from real exports)." When writing tests, I initially trusted the docstring and got failing tests. The lesson: when code and comments disagree, comments are wrong. Comments go stale. Code is what actually runs. The docstring was eventually updated to match the code.

### Lessons for future you

**Explicit beats inferred.** We could have inferred `is_manual` from other fields (null period_start, source_hash pattern). We explicitly added it as a response field instead. Explicit is always better — future code can read `is_manual` without knowing anything about internal conventions.

**Multi-step confirmation is better than "Are you sure?"** Instead of a modal popup for delete confirmation, we use inline "Delete? Yes / No" that appears in the same row. It's less disruptive, faster to interact with, and doesn't block the screen on mobile.

**Write tests that fail first.** Every one of the bugs above was found by writing a test that correctly described the expected behavior, watching it fail, then fixing the code until it passed. The alternative — just fixing the code and hoping — leaves you unsure whether the fix actually works.

**Separation of test infrastructure from test logic.** The conftest.py / shared.py split: infrastructure (engine creation, override setup, table lifecycle) goes in shared files. Business logic tests stay focused on what they're actually testing. This is why the tests are readable — `test_jpy_converted_to_usd()` doesn't need to care how the database is set up.

---

*Built with FastAPI · SQLite → PostgreSQL · React · Tailwind · Railway · Supabase · Vercel.*
