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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from api.routes import router

app = FastAPI(
    title="AutoSplit API",
    description="Smart expense splitting for shared households",
    version="1.0.0",
)

# CORS: allow the Vite dev server (port 5173) to call our API
# Without this, the browser would block the requests as a security measure
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Create database tables on first launch."""
    init_db()


# Mount all routes under /api prefix
# Example: GET /api/groups, POST /api/groups/{id}/statements/upload
app.include_router(router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
