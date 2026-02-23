# AutoSplit — Smart Bill Splitting for Shared Households

A better Splitwise. Upload your Chase credit card statement and instantly see who owes whom.

## Quick Start

```bash
cd autosplit
bash start.sh
# Opens http://localhost:5173 automatically
```

The app ships with sample data (Alice, Bob, Charlie roommates) so you can demo the full flow immediately.

## What It Does

1. **Upload** a Chase credit card PDF statement
2. **Auto-categorize** every transaction (dining, groceries, utilities, subscriptions…)
3. **Suggest participants** based on category (utilities → everyone, subscriptions → one person)
4. **Review & override** — edit category, participants, or split method per transaction
5. **Save merchant rules** — remember your preferences for recurring merchants
6. **Compute settlement** — minimized transfers ("Bob pays Alice $307.62")
7. **Export** — CSV or JSON, plus copyable payment request messages

## Architecture

```
autosplit/
  backend/
    adapters/       ← PDF parsers (Chase first; add BofA here later)
    domain/         ← Pure business logic: splits, settlement, categories
    services/       ← Use cases: import_statement(), compute_settlement()
    models/         ← SQLAlchemy models (SQLite database)
    schemas/        ← Pydantic request/response schemas
    api/            ← FastAPI routes (thin layer, calls services)
    tests/          ← pytest unit tests
  frontend/
    src/
      api/          ← fetch() wrapper for backend calls
      pages/        ← GroupsPage, UploadPage, TransactionsPage, SettlementPage
      components/   ← Layout, shared UI
```

## Running Tests

```bash
cd backend
python3 -m pytest tests/ -v
# 49 tests, all passing
```

Tests cover:
- Year inference across Dec/Jan year boundary
- Transaction regex parsing from PDF text
- Settlement correctness (3+ members, minimized transfers)
- Idempotent import (same hash = no duplicate)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite + SQLAlchemy |
| PDF Parsing | pdfplumber |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| State | React Query |

## PDF Format Supported

Chase credit card statements. The parser looks for the "ACCOUNT ACTIVITY → PURCHASES" section and extracts:
- Transaction date (MM/DD, year inferred from statement period)
- Merchant name
- Amount

Re-uploading the same PDF is safe — idempotent by file hash.

## Future Roadmap

**Phase 2:** Multi-bank support (BofA, Amex PDF + CSV), Plaid integration, recurring transaction detection, multi-statement merge

**Phase 3:** Payment initiation (Venmo/Zelle deep links), reminders + nudges, settle-up tracking

**Phase 4:** Chat integrations (WhatsApp/Telegram), group trip mode, multi-currency

**Phase 5:** Monetization — payment plans, premium automation rules, shared household budgets
