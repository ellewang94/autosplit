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

## Chapter 4: Going Live — Cloud, Auth, and the Pre-MVP Checklist

*This chapter covers the sprint from "working locally" to "ready to ship to real users."*

### The Cloud Migration

The app started as local-only — all data on your laptop in SQLite. For real users to collaborate (especially the share-your-results viral loop), everything needed to move to the cloud.

**What moved where:**
- **Database**: SQLite → PostgreSQL hosted on Supabase. Think of Supabase as "Firebase but built on real SQL." You get a hosted Postgres database, auth, and file storage all in one dashboard. The switch required updating the SQLAlchemy database URL from `sqlite:///...` to `postgresql://...` and adding the `psycopg2` driver.
- **Auth**: Supabase Auth. Instead of rolling custom sessions and password hashing, Supabase handles it all — including Google OAuth. Your backend validates Supabase JWT tokens on every request using the service role key.
- **Backend hosting**: Railway. One `railway.toml` config file and your FastAPI app deploys automatically when you push to GitHub.
- **Frontend hosting**: Vercel. Point Vercel at the GitHub repo, add environment variables, and it deploys on every push. Zero config.

**The key architectural lesson from cloud migration:** Your backend API layer barely changed. Because we followed clean architecture from the start (routes → services → domain → database), swapping SQLite for PostgreSQL was mostly a config change — not a code rewrite. The domain logic in `settlement.py` and `categories.py` doesn't know or care what database is underneath it.

### How Supabase Auth Works (in plain English)

When a user signs up or logs in, Supabase gives them a **JWT token** — think of it as a tamper-proof ID card that expires after one hour. The frontend stores this in localStorage and sends it on every API request in the `Authorization: Bearer <token>` header.

The backend validates this token using Supabase's public key (no database lookup needed — JWTs are cryptographically self-verifying). If the token checks out, the backend knows who the user is and can check that they own the trip they're trying to access.

**Why Google OAuth is the primary CTA:** Email/password requires the user to remember a password. Google OAuth is one click, and most of your users already have Google accounts. The friction difference is enormous — expect Google signups to convert 2-3x better.

**The email confirmation gotcha:** When you sign up with email/password in Supabase, by default it sends a confirmation email. For development, this means you get stuck at "check your email." The fix is to go to Supabase dashboard → Auth → Providers and disable email confirmation. We also handled the case gracefully in code: if `data.session` comes back immediately, the user is auto-confirmed — navigate straight to `/groups`. If not, show the "check your email" screen.

### Parsing Capital One PDFs

Real-world testing with a Hawaii trip revealed a new bank format we hadn't handled: Capital One.

Capital One's PDF statements print each transaction as two dates on the same line: `Oct 15 Oct 17 MERCHANT $6.34`. The first date is the purchase date, the second is when it posted. Every other parser we had handled one date, not two.

The fix: a new regex pattern (`PATTERN_TWO_DATE`) that matches this two-date format, a new function (`_try_parse_two_date_line`) that handles it, and a new month abbreviation lookup (`_MONTH_ABBR`) for the abbreviated month names Capital One uses (`Oct` not `October`).

The trickiest part: Capital One's payment lines look like `Oct 15 Oct 17 AUTOPAY PYMT - $500.00` — the `-` before the amount is a sign that the amount should be skipped (it's a payment, not a purchase). The negative lookbehind in the regex `(?<!\-)` wasn't catching this because of the space before the `-`. We added a second check: if the description ends with ` -`, skip the line.

**The lesson:** Always test with real files from the actual banks your users have. Synthetic tests won't catch the format quirks that real PDF export engines produce.

### Pre-MVP Launch Checklist

Before any product ships, there's a list of "table stakes" — things that aren't features but are necessary for the product to look like a real company made it:

**1. OG meta tags** — When someone shares your URL on Slack, iMessage, or Twitter, the platform generates a preview card. This requires specific `<meta>` tags in your `<head>`: `og:title`, `og:description`, `og:image`, `og:url`. Without them, shares look like broken links. We added these to `index.html`.

**2. OG image** — The `og:image` needs to be a real PNG file (1200×630 pixels — this is the universal standard). We generated it with Python's Pillow library: dark background, the AutoSplit logo mark, serif title, tagline, lime accent line. The image is served as a static file from `public/og-image.png`.

**3. robots.txt** — Tells search engine bots which pages to index. We allow the landing page, split calculator, and share pages (public content that should rank). We disallow `/groups/` (user data — shouldn't appear in Google). This file lives at `public/robots.txt` and Vite serves it from the domain root.

**4. sitemap.xml** — Tells Google what pages exist and when they were last updated. Only public pages go here: `/`, `/split`. Dynamic pages like `/groups/:id` aren't listed because each user's data is private.

**5. Proper favicon** — The browser tab icon. We created an SVG (dark rounded square + lime lightning bolt) instead of a `.ico` file. SVG favicons are supported by all modern browsers and stay crisp at any size.

**6. 404 page** — Any URL that doesn't exist should show a friendly, on-brand page rather than the browser's default "can't be reached" error. We added a `NotFoundPage` and a catch-all route (`path="*"`) in the React router.

### Mobile UAT: Catching What Desktops Hide

"UAT" stands for User Acceptance Testing — the process of going through the app systematically from a real user's perspective, across different devices and scenarios.

The most impactful mobile bug we found: **delete buttons that only appear on hover.** On desktop, you hover over a row and a trash icon fades in. On a phone, there's no hover state — the button was permanently invisible. The CSS pattern `opacity-0 group-hover:opacity-100` is the culprit.

The fix: make the button visible on mobile, hide-on-hover only on desktop. The Tailwind classes become `sm:opacity-0 sm:group-hover:opacity-100` — the `sm:` prefix means "apply this on screens 640px and wider." On small screens (phones), the `opacity-0` never applies, so the button is always visible. This pattern appeared in four files: `GroupsPage.jsx`, `TripOverviewPage.jsx`, `UploadPage.jsx`, and `TransactionsPage.jsx`.

**The broader mobile lesson:** Always test on a real phone, not just the Chrome DevTools simulator. DevTools simulates the viewport size but not touch events, hover states, or the iOS/Android keyboard pushing the viewport up. The opacity-hover bug is invisible in DevTools.

### The Share-and-Grow Loop

The viral growth mechanism: the trip organizer clicks "Share trip" on the Settlement page, which generates a public read-only link (`autosplit.co/share/abc123`). They paste this into iMessage/WhatsApp. The friend who receives the link sees a beautiful summary of who owes what — with their name, amount, and payment app links (Venmo/CashApp/PayPal). The CTA at the bottom: "Want to split your next trip the easy way? Try AutoSplit free."

This is the growth loop: one happy user → multiple non-user friends who see the product working → some fraction sign up → each of them creates more trips → more friends see it.

The technical piece: the `SharePage` is completely public (no auth required). It reads a `share_code` from the URL, fetches the trip data from the backend, and renders it. The backend only returns the data if the share code is valid and hasn't been revoked.

### Bugs We Hit in This Chapter

**The Supabase JWT validation scope mismatch** — Initially, the backend used the Supabase "anon key" to validate tokens, which worked for public API access but had permission issues for certain admin operations. Switching to the "service role key" (kept secret on the backend only — never exposed to the frontend) resolved this.

**Capital One payment detection** — A $500 autopayment was being captured as a $500 purchase because the negative lookbehind in the regex wasn't matching the ` -` at the end of the description. The regex engine scans the amount field, not the description suffix. Added an explicit description string check as a belt-and-suspenders fix.

**The `ParsedStatement` vs `ParsedTransaction` confusion** — When writing a test script to verify Capital One parsing, tried to access `result.parse_confidence` — which exists on `ParsedTransaction` objects but not on `ParsedStatement`. The dataclasses have different shapes. When you see `AttributeError: 'ParsedStatement' object has no attribute 'parse_confidence'`, it means you're reading the parser's container object when you meant to read one of its transaction items.

### Lessons for Future You

**"Table stakes" are real.** The meta tags, robots.txt, sitemap, and favicon don't feel like features, but they're what separates "looks like a real product" from "looks like a prototype." Do them before the first real user touches the app, not after.

**The hover pattern bites every mobile app.** Desktop designers default to hover interactions because they're on a desktop. Go through every `hover:` class in your Tailwind code and ask: what happens on touch? Sometimes it's fine (hover colors on links don't matter on mobile). Sometimes it's catastrophic (a button that's invisible on touch devices).

**Test with real data early.** We caught the Capital One parsing bug because we uploaded a real statement from a real Hawaii trip. Synthetic test data never has the weird formatting quirks, truncated merchant names, or payment lines that real bank exports contain.

**Cloud migration is mostly config, not code** — if you built with clean architecture. The settlement math, categorization, and parsing are identical between the SQLite version and the PostgreSQL cloud version. The only change was the database URL and the addition of auth middleware. Good architecture pays dividends.

---

*Built with FastAPI · PostgreSQL · React · Tailwind · Railway · Supabase · Vercel.*
