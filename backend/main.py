"""
AutoSplit Backend — FastAPI Application Entry Point.

This file wires together:
- Database initialization
- CORS middleware (allows the React frontend to call our API)
- All API routes

To run:
    cd backend
    uvicorn main:app --reload --port 8000
"""

import os
from dotenv import load_dotenv

# Load .env file FIRST, before anything else reads environment variables.
# In production (Railway), env vars are injected directly — load_dotenv() is harmless there.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, run_migrations
from api.routes import router

app = FastAPI(
    title="AutoSplit API",
    description="Smart expense splitting for shared households",
    version="1.0.0",
)

# ── CORS: which frontends are allowed to call this API ────────────────────────
# CORS (Cross-Origin Resource Sharing) is a browser security rule.
# Without it, the browser blocks JavaScript from calling a different server.
#
# We allow:
#   - Local dev servers (ports 5173, 5174, 3000) for development
#   - The production Vercel URL (from FRONTEND_URL env var) for production
#
# In production, set FRONTEND_URL=https://your-app.vercel.app on Railway.

_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

# If FRONTEND_URL is set (production deployment), add it to the allowed list
_frontend_url = os.getenv("FRONTEND_URL", "").strip()
if _frontend_url:
    _allowed_origins.append(_frontend_url)
    # Also allow without trailing slash if it was included
    _allowed_origins.append(_frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """
    On every startup:
    1. Create any tables that don't exist yet (first-time setup).
    2. Run migrations to add new columns to existing tables (upgrades).
    Both operations are idempotent — safe to run over and over.
    """
    init_db()
    run_migrations()


# Mount all routes under /api prefix
# Example: GET /api/groups, POST /api/groups/{id}/statements/upload
app.include_router(router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
