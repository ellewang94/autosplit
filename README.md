# AutoSplit — Split trips, not friendships

**Live at [autosplit.co](https://autosplit.co)**

AutoSplit is a trip expense splitter built for people who share credit cards on trips. Upload your bank statements (PDF or CSV), and AutoSplit figures out exactly who owes whom — with one-click payment messages ready to send.

## The core workflow

1. **Create a trip** — name it, set dates and currency
2. **Add trip members** — invite friends via a shareable link
3. **Upload statements** — Chase, Amex, BofA, Capital One (PDF or CSV)
4. **Review transactions** — auto-categorized; mark what's shared vs. personal
5. **Settle up** — debt-minimized settlement with copyable Venmo/Zelle messages
6. **Share** — send a read-only trip summary link to anyone, no account needed

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend API | FastAPI (Python) + Uvicorn |
| Database | PostgreSQL (Railway) |
| Auth | Supabase (Google OAuth + email) |
| PDF Parsing | pdfplumber |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Analytics | PostHog (session replay + usage) |
| Error tracking | Sentry (frontend + backend) |

## Architecture

```
autosplit/
├── backend/
│   ├── adapters/     PDF/CSV parsers (Chase, Amex, BofA, Capital One, universal)
│   ├── api/          FastAPI route handlers
│   ├── domain/       Pure business logic (categorization, splits, settlement math)
│   ├── models/       SQLAlchemy ORM models
│   ├── schemas/      Pydantic request/response schemas
│   ├── services/     Use cases (import_service, settlement_service)
│   └── tests/        pytest test suite
└── frontend/
    └── src/
        ├── api/          API client
        ├── contexts/     AuthContext (Supabase session management)
        ├── lib/          Analytics (PostHog), Sentry init
        ├── components/   Layout, shared UI
        └── pages/        One file per route
```

## Deploy pipeline

Every `git push` to `main` triggers:
- **Vercel** → rebuilds and deploys frontend (~16s)
- **Railway** → rebuilds and deploys backend (~3min)

No manual steps needed after pushing.

## Running locally

```bash
bash start.sh
# Backend: http://localhost:8001
# Frontend: http://localhost:5173
```

## Running tests

```bash
cd backend && python -m pytest tests/ -v
```

## Bank support

| Bank | PDF | CSV |
|---|---|---|
| Chase | ✅ | ✅ |
| American Express | ✅ | ✅ |
| Bank of America | ✅ | — |
| Capital One | ✅ | — |
| Other banks | ✅ (universal parser) | — |
