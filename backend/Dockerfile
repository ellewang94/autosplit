# ── AutoSplit Backend — Dockerfile ────────────────────────────────────────────
#
# This file tells Railway (our cloud hosting service) how to package and run
# the FastAPI backend. Think of it like a recipe: "start with Python 3.11,
# install these packages, then run this command."
#
# HOW IT WORKS:
#   1. Start from an official Python 3.11 image (a pre-built "OS + Python" package)
#   2. Copy our code into the container
#   3. Install dependencies from requirements.txt
#   4. Tell Railway how to start the server
#
# WHY DOCKERFILE INSTEAD OF JUST UPLOADING CODE?
#   Railway runs your app in a "container" — a lightweight isolated box.
#   The Dockerfile tells it exactly what goes in that box. Without it,
#   Railway would have to guess, and it often guesses wrong for Python apps.

# ── Base image ─────────────────────────────────────────────────────────────────
# python:3.11-slim is the official Python image with unnecessary tools stripped out
# to keep the image small and fast to deploy.
FROM python:3.11-slim

# ── Working directory ──────────────────────────────────────────────────────────
# All subsequent commands run in /app inside the container.
WORKDIR /app

# ── Install system dependencies ────────────────────────────────────────────────
# pdfplumber uses pdfminer which needs these. The --no-install-recommends flag
# keeps the image lean by skipping optional tools we don't need.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# ── Install Python dependencies ────────────────────────────────────────────────
# Copy requirements first (before the rest of the code). Docker caches each
# step — if requirements.txt hasn't changed, this step is skipped on re-deploys.
# That makes subsequent deploys much faster.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Also install psycopg2 for PostgreSQL ───────────────────────────────────────
# We don't include this in requirements.txt because SQLite is used locally
# and PostgreSQL (via Supabase) is only needed in production. This way your
# local setup doesn't need PostgreSQL installed.
RUN pip install --no-cache-dir psycopg2-binary

# ── Copy application code ──────────────────────────────────────────────────────
# Copy everything AFTER installing dependencies so the cache is more effective.
COPY . .

# ── Runtime configuration ──────────────────────────────────────────────────────
# PORT is set by Railway automatically. We read it here and pass it to uvicorn.
# HOST 0.0.0.0 means "accept connections from any IP" — required in containers.
ENV PORT=8000
EXPOSE 8000

# ── Start command ──────────────────────────────────────────────────────────────
# Railway will run this command to start the server.
# --workers 1: single worker for now (sufficient for MVP; can scale later)
# --host 0.0.0.0: accept connections from outside the container
# --port $PORT: use Railway's assigned port
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
