# AutoSplit — Prompts & Build Log

A record of the prompts and iterative feedback used to build AutoSplit with Claude Code in one session.

---

## Prompt 1 — The Full Build Brief

> Build an MVP called "AutoSplit" — a better Splitwise. Phase 1 input is a Chase credit card statement PDF. Use FastAPI + SQLite + SQLAlchemy backend, React + Tailwind frontend. MVP in 2-3 hours.
>
> **PDF FORMAT (important):**
> Transactions are under "ACCOUNT ACTIVITY" → "PURCHASE" section. Row format: MM/DD   MERCHANT NAME LOCATION   $AMOUNT. Statement also shows Statement Date and Opening/Closing dates (e.g. 01/09/26 - 02/08/26). Use these to infer the correct year for each MM/DD transaction — this matters for Dec/Jan year boundary statements. Use pdfplumber for extraction. Ignore everything outside the PURCHASE section (payments, interest, account summary, legal text). Idempotent imports: re-uploading the same PDF should not duplicate transactions. Hash on date + amount + description. Store raw extracted text + parse confidence per transaction for debugging.
>
> **PHASE 1 — BUILD THIS:**
> - Upload Chase PDF → extract transactions (date, merchant, amount, txn_type)
> - Auto-categorize each transaction (dining, groceries, utilities, subscriptions, transportation, entertainment, etc.)
> - Auto-suggest participants per transaction based on category rules:
>   - Utilities/Internet → all group members
>   - Subscriptions → single person (ask which)
>   - Dining → all members by default, overridable
>   - Unknown → flag for user review
> - User can override category, participants, and split method per transaction
> - "Save as merchant rule" — remember overrides for a merchant so next import auto-applies them (MerchantRule table)
> - Mark transactions as "personal" to exclude from splitting
> - Compute net balances per member → minimized settlement transfers (greedy min cash-flow algorithm)
> - Settlement output: clear "Alice owes Bob $47.50" summary + copyable payment request messages + export to CSV/JSON
>
> **STRICT NON-GOALS (do NOT build):**
> No auth, no Plaid, no payments, no WhatsApp, no notifications, no external APIs.
>
> **DATA MODEL:**
> - Group(id, name, created_at)
> - Member(id, group_id, name)
> - Statement(id, group_id, statement_date, period_start, period_end, source_hash)
> - Transaction(id, statement_id, posted_date, description_raw, amount, txn_type, category, is_personal, participants_json, split_method_json, overrides_json, parse_confidence)
> - MerchantRule(id, group_id, merchant_key, default_category, default_participants_json, default_split_method_json)
>
> **SPLIT METHODS:** Equal (default), Custom percentages, Exact amounts
>
> **UI PAGES:**
> - Upload PDF → parse preview with editable table (category, participants, split per row)
> - Group + member management
> - Transaction review table with batch actions + save merchant rule
> - Settlement dashboard (balances, minimized transfers, export buttons)
>
> **PROJECT STRUCTURE (enforce these boundaries):**
> ```
> /backend
>   /adapters      → PDF parsers (modular — one parser per bank format, Chase first)
>   /domain        → Pure business logic: splits, balances, settlement (NO dependency on UI or parsing)
>   /services      → Use cases: import_statement(), compute_settlement(), apply_rules()
>   /models        → SQLAlchemy models
>   /schemas       → Pydantic models
>   /api           → FastAPI routes (thin — just call services)
> /frontend
>   /src           → React + Tailwind
> ```
> The domain layer must have zero dependency on adapters or API. Adding a new bank format later should only mean writing a new parser in /adapters.
>
> **BUILD ORDER:**
> 1. Hardcoded mock data for 3 roommates → settlement logic + UI (~45 min)
> 2. Wire up PDF parsing with pdfplumber (~30 min)
> 3. Auto-categorization + participant suggestion rules (~30 min)
> 4. Override UX + merchant rules (~30 min)
> 5. Polish: exports, copyable messages, error handling (~15-30 min)
>
> **TESTS (must include):**
> - Year inference across Dec/Jan boundary
> - Transaction parsing from sample PDF
> - Settlement correctness (3+ members, verify minimized transfers)
> - Idempotent import (same PDF twice = no duplicates)
>
> **FUTURE ROADMAP (include in README.md only, do NOT implement):**
> - Phase 2: Multi-bank support (BofA, Amex PDF + CSV), Plaid integration, recurring transaction detection, multi-statement merge
> - Phase 3: Payment initiation (Venmo/Zelle deep links), reminders + nudges, settle-up tracking
> - Phase 4: Chat integrations (WhatsApp/Telegram), group trip mode, multi-currency
> - Phase 5: Monetization — payment plans, premium automation rules, shared household budgets
>
> **DELIVERABLE:** A runnable app with seeded sample data so I can demo the full flow in under 2 minutes.

---

## Prompt 2 — Restart & Test

> i just finished trying once, can we try it again, open up the test interface for me

**What happened:** After the initial build, Elle tested the app and wanted to restart both servers and reopen the browser fresh for a second test run. Claude stopped all processes, restarted the backend (port 8001) and frontend (port 5173), verified the database still had data from the previous session, and opened the browser.

---

## Prompt 3 — Bug Report: Mismatched Totals

> shared expenses on transaction tab and the settlement tab doesnt seem to match

**What happened:** Elle noticed the "Shared expenses" total shown on the Transactions page was different from the "Total shared expenses" shown on the Settlement page.

**Root cause:** The Transactions page was summing *all* non-personal transactions (including "needs review" ones with no participants assigned — like the bodega transaction at $47.20). The Settlement page correctly excluded those because they have no participants and can't be split. One number included the unassigned transaction, the other didn't.

**Fix:** Changed the Transactions page stat to only count transactions that are:
- Not personal, AND
- Have at least one participant assigned (`member_ids.length > 0`)

Also renamed the label from "Shared expenses" to "Will be settled" so it's unambiguous — it shows exactly what Settlement will compute.

---

## Prompt 4 — Verify Fix

> did you fix already, let's load and test the latest?

**What happened:** Claude confirmed Vite hot-reloads instantly on file save (no restart needed), opened the Transactions page directly in the browser, and explained what to look for — both tabs should now show $953.06.

---

## Prompt 5 — Share the Project

> i want to share the code with my friend and my prompts for you today to help build the app. can you help

> is github easier or a folder? and can you send a summary of the prompt i gave you?

> yes lets do github and add a file for the summary of all the prompts i gave you including iterative tips i gave you

**What happened:** Claude recommended GitHub over a zip folder (easier for friends to browse and clone), wrote this PROMPTS.md file, then initialized a git repo and pushed to GitHub.

---

## Key Lessons from This Build Session

1. **Be specific about data format.** The Chase PDF format note (MM/DD, infer year from period dates, Dec/Jan boundary) was critical — without it, the parser would have silently produced wrong dates for half the transactions.

2. **Enforce architecture up front.** Specifying the `/adapters → /domain → /services → /api` layer boundaries in the initial prompt meant the code was cleanly structured from the start. Retrofitting architecture is painful.

3. **Seed data is a feature.** Asking for "a runnable app with seeded sample data for a 2-minute demo" meant the app was immediately testable without needing a real Chase PDF.

4. **Testing found real bugs.** Running the app in the browser surfaced the totals mismatch that tests didn't catch — a UI-level consistency issue. Both automated tests AND manual testing matter.

5. **Iterative prompts can be short.** After the big initial prompt, the fixes were a single sentence each. The detail front-loaded into Prompt 1 made subsequent prompts trivial.
