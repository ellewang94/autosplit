#!/usr/bin/env python3
"""
weekly_digest.py — sends a weekly growth summary email every Monday morning.

Queries the AutoSplit database for the past 7 days and emails a clean summary
to ellewang94@gmail.com. Run via cron on Monday mornings.

Email is sent via Gmail SMTP using an App Password (not your real password).

SETUP (one-time, 2 minutes):
  1. Go to myaccount.google.com/security
  2. Make sure 2-Step Verification is ON
  3. Search "App passwords" → create one → name it "AutoSplit Digest"
  4. Copy the 16-character password (no spaces)
  5. Add to backend/.env:
       DIGEST_GMAIL_USER=ellewang94@gmail.com
       DIGEST_GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
  6. Run this script manually once to test:
       python3 scripts/weekly_digest.py
"""

import os
import sys
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env")

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker

from models.models import Group, Statement, Transaction, Feedback, TripShare

# ── Config ────────────────────────────────────────────────────────────────────
TO_EMAIL = "ellewang94@gmail.com"
FROM_EMAIL = os.getenv("DIGEST_GMAIL_USER", "")
APP_PASSWORD = os.getenv("DIGEST_GMAIL_APP_PASSWORD", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./autosplit.db")


# ── Database connection ───────────────────────────────────────────────────────
def get_db_session():
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    )
    Session = sessionmaker(bind=engine)
    return Session()


# ── Stats collection ──────────────────────────────────────────────────────────
def collect_stats(db) -> dict:
    """
    Query the database for the past 7 days of activity.
    Returns a dict of metric name → value.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    # Helper: count rows created in a date range
    def count_since(model, since):
        return db.query(func.count(model.id)).filter(
            model.created_at >= since
        ).scalar() or 0

    this_week_trips     = count_since(Group, week_ago)
    last_week_trips     = count_since(Group, two_weeks_ago) - this_week_trips

    this_week_stmts     = count_since(Statement, week_ago)
    last_week_stmts     = count_since(Statement, two_weeks_ago) - this_week_stmts

    this_week_shares    = count_since(TripShare, week_ago)
    last_week_shares    = count_since(TripShare, two_weeks_ago) - this_week_shares

    this_week_feedback  = count_since(Feedback, week_ago)

    # All-time totals give context
    total_trips         = db.query(func.count(Group.id)).scalar() or 0
    total_stmts         = db.query(func.count(Statement.id)).scalar() or 0
    total_shares        = db.query(func.count(TripShare.id)).scalar() or 0

    # Recent feedback messages (so you can read them in the email)
    recent_feedback = db.query(Feedback).filter(
        Feedback.created_at >= week_ago
    ).order_by(Feedback.created_at.desc()).limit(5).all()

    return {
        "this_week_trips":    this_week_trips,
        "last_week_trips":    last_week_trips,
        "this_week_stmts":    this_week_stmts,
        "last_week_stmts":    last_week_stmts,
        "this_week_shares":   this_week_shares,
        "last_week_shares":   last_week_shares,
        "this_week_feedback": this_week_feedback,
        "total_trips":        total_trips,
        "total_stmts":        total_stmts,
        "total_shares":       total_shares,
        "recent_feedback":    recent_feedback,
        "week_start":         week_ago.strftime("%b %d"),
        "week_end":           now.strftime("%b %d, %Y"),
    }


def trend_arrow(this_week: int, last_week: int) -> str:
    """Return a simple trend indicator: ↑ up, ↓ down, → flat."""
    if last_week == 0:
        return "↑ new" if this_week > 0 else "—"
    if this_week > last_week:
        pct = round((this_week - last_week) / last_week * 100)
        return f"↑ +{pct}% vs last week"
    if this_week < last_week:
        pct = round((last_week - this_week) / last_week * 100)
        return f"↓ -{pct}% vs last week"
    return "→ same as last week"


# ── Email builder ─────────────────────────────────────────────────────────────
def build_html(s: dict) -> str:
    """
    Build the HTML body of the weekly digest email.
    Plain, readable design — no fancy templates needed for a personal digest.
    """
    feedback_rows = ""
    for fb in s["recent_feedback"]:
        feedback_rows += f"""
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1a1a24;color:#babace;font-size:13px;">
            <strong style="color:#e8e8ee;">[{fb.type}]</strong> {fb.message or '(no message)'}
          </td>
        </tr>"""

    if not feedback_rows:
        feedback_rows = """
        <tr>
          <td style="padding:8px 0;color:#72728a;font-size:13px;font-style:italic;">
            No feedback this week.
          </td>
        </tr>"""

    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">

    <!-- Header -->
    <div style="margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:32px;height:32px;background:#c8f135;border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:16px;">⚡</span>
        </div>
        <span style="color:#72728a;font-size:11px;font-family:monospace;letter-spacing:2px;text-transform:uppercase;">AutoSplit Weekly</span>
      </div>
      <h1 style="margin:0 0 4px;color:#f6f6f9;font-size:24px;font-weight:700;line-height:1.2;">
        Week of {s["week_start"]} – {s["week_end"]}
      </h1>
      <p style="margin:0;color:#72728a;font-size:13px;">Your growth summary</p>
    </div>

    <!-- Metrics grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">

      <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;">
        <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Trips created</div>
        <div style="color:#f6f6f9;font-size:28px;font-weight:700;line-height:1;">{s["this_week_trips"]}</div>
        <div style="color:#72728a;font-size:11px;margin-top:4px;">{trend_arrow(s["this_week_trips"], s["last_week_trips"])}</div>
        <div style="color:#72728a;font-size:11px;margin-top:2px;">{s["total_trips"]} all-time</div>
      </div>

      <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;">
        <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Statements uploaded</div>
        <div style="color:#f6f6f9;font-size:28px;font-weight:700;line-height:1;">{s["this_week_stmts"]}</div>
        <div style="color:#72728a;font-size:11px;margin-top:4px;">{trend_arrow(s["this_week_stmts"], s["last_week_stmts"])}</div>
        <div style="color:#72728a;font-size:11px;margin-top:2px;">{s["total_stmts"]} all-time</div>
      </div>

      <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;">
        <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Share links created</div>
        <div style="color:#f6f6f9;font-size:28px;font-weight:700;line-height:1;">{s["this_week_shares"]}</div>
        <div style="color:#72728a;font-size:11px;margin-top:4px;">{trend_arrow(s["this_week_shares"], s["last_week_shares"])}</div>
        <div style="color:#72728a;font-size:11px;margin-top:2px;">{s["total_shares"]} all-time</div>
      </div>

      <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;">
        <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Feedback received</div>
        <div style="color:#f6f6f9;font-size:28px;font-weight:700;line-height:1;">{s["this_week_feedback"]}</div>
        <div style="color:#72728a;font-size:11px;margin-top:4px;">this week</div>
      </div>

    </div>

    <!-- Funnel note -->
    <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;margin-bottom:24px;">
      <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Funnel health</div>
      <div style="color:#babace;font-size:13px;line-height:1.6;">
        {'<span style="color:#c8f135;">↑ Engagement looks good — people are uploading and sharing.</span>' if s["this_week_stmts"] > 0 and s["this_week_shares"] > 0 else ''}
        {'<span style="color:#fbbf24;">→ Trips created but no statements uploaded — check for friction on the upload page.</span>' if s["this_week_trips"] > 0 and s["this_week_stmts"] == 0 else ''}
        {'<span style="color:#fbbf24;">→ Statements uploaded but no share links — users may not be reaching settlement.</span>' if s["this_week_stmts"] > 0 and s["this_week_shares"] == 0 else ''}
        {'<span style="color:#72728a;font-style:italic;">No activity this week yet.</span>' if s["this_week_trips"] == 0 else ''}
      </div>
    </div>

    <!-- Recent feedback -->
    <div style="background:#0c0c10;border:1px solid #1a1a24;border-radius:12px;padding:16px;margin-bottom:32px;">
      <div style="color:#72728a;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Recent feedback</div>
      <table style="width:100%;border-collapse:collapse;">
        {feedback_rows}
      </table>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1a1a24;padding-top:16px;">
      <p style="margin:0;color:#72728a;font-size:11px;font-family:monospace;">
        AutoSplit · autosplit.co · Sent every Monday at 8am
      </p>
    </div>

  </div>
</body>
</html>
"""


def send_digest(html: str, subject: str) -> bool:
    """Send the digest email via Gmail SMTP."""
    if not FROM_EMAIL or not APP_PASSWORD:
        print("ERROR: DIGEST_GMAIL_USER or DIGEST_GMAIL_APP_PASSWORD not set in .env")
        print("See setup instructions at the top of this file.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"AutoSplit Digest <{FROM_EMAIL}>"
    msg["To"] = TO_EMAIL
    msg.attach(MIMEText(html, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(FROM_EMAIL, APP_PASSWORD)
            server.sendmail(FROM_EMAIL, TO_EMAIL, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────
def run() -> None:
    print(f"[weekly_digest] Running at {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    db = get_db_session()
    try:
        stats = collect_stats(db)
    finally:
        db.close()

    subject = f"AutoSplit Weekly · {stats['week_start']} – {stats['week_end']}"
    html = build_html(stats)

    print(f"  Trips this week:      {stats['this_week_trips']}")
    print(f"  Statements this week: {stats['this_week_stmts']}")
    print(f"  Shares this week:     {stats['this_week_shares']}")
    print(f"  Feedback this week:   {stats['this_week_feedback']}")

    ok = send_digest(html, subject)
    if ok:
        print(f"  Email sent to {TO_EMAIL}")
    else:
        print("  Email failed — check .env for DIGEST_GMAIL_USER and DIGEST_GMAIL_APP_PASSWORD")


if __name__ == "__main__":
    run()
