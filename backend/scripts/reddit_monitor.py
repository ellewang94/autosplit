#!/usr/bin/env python3
"""
reddit_monitor.py — scans Reddit for growth opportunities and competitor complaints.

Runs every 4 hours via cron. Sends ntfy push for genuinely relevant posts only.

Strategy:
  - Search within specific, relevant subreddits (not Reddit-wide) to reduce noise
  - Use precise multi-word queries
  - Require minimum post score (upvotes) to filter out spam/low-quality posts
  - Track seen post IDs so you never get the same post twice
"""

import json
import os
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env")

from notify import send_push

# ── Config ────────────────────────────────────────────────────────────────────
SEEN_FILE = Path(__file__).parent / "seen_posts.json"
MAX_POST_AGE_HOURS = 48     # ignore posts older than 2 days
MIN_SCORE = 0               # minimum upvotes (0 = include all, raise to reduce noise)

# Relevant subreddits — tight list, only communities where our exact audience lives.
# We intentionally exclude r/SideProject, r/Entrepreneur, r/startups because they're
# high-volume general communities that cause false positives.
TRAVEL_SUBS = "solotravel+travel+backpacking+digitalnomad+TravelHacks"
MONEY_SUBS = "personalfinance+frugal+financialindependence+budget"
ALL_RELEVANT = f"{TRAVEL_SUBS}+{MONEY_SUBS}"

# Max individual push notifications per run — keeps us under ntfy's rate limit.
# If more than this are found, they're batched into a single digest push.
MAX_INDIVIDUAL_PUSHES = 5

# Searches: (query, subreddit_string, label, priority)
# Using subreddit= restricts results to those communities → far less noise.
SEARCHES = [
    # ── Direct opportunity: people asking for what AutoSplit does ─────────────
    {
        "query": "split expenses friends trip",
        "subreddit": TRAVEL_SUBS,
        "label": "Trip expense split",
        "priority": "high",
    },
    {
        "query": "how to split vacation costs",
        "subreddit": ALL_RELEVANT,
        "label": "Vacation cost split",
        "priority": "high",
    },
    {
        "query": "app to split travel expenses",
        "subreddit": ALL_RELEVANT,
        "label": "App request",
        "priority": "high",
    },
    {
        "query": "bank statement expenses split friends",
        "subreddit": ALL_RELEVANT,
        "label": "Bank statement split",
        "priority": "high",
    },
    # ── Competitor frustration: people wanting to switch ──────────────────────
    {
        "query": "splitwise alternative better app",
        "subreddit": ALL_RELEVANT,
        "label": "Splitwise alt",
        "priority": "high",
    },
    {
        "query": "splitwise issues problems",
        "subreddit": ALL_RELEVANT,
        "label": "Splitwise complaint",
        "priority": "high",
    },
    {
        "query": "tricount alternative",
        "subreddit": ALL_RELEVANT,
        "label": "Tricount alt",
        "priority": "default",
    },
    # ── Brand + competitor monitoring ─────────────────────────────────────────
    {
        "query": "autosplit expenses app",
        "subreddit": None,          # Reddit-wide — our name is specific enough
        "label": "AutoSplit mention",
        "priority": "high",
    },
    {
        "query": "SpillWise app",
        "subreddit": None,          # Reddit-wide
        "label": "SpillWise mention",
        "priority": "default",
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_seen() -> set:
    if SEEN_FILE.exists():
        try:
            return set(json.loads(SEEN_FILE.read_text()))
        except Exception:
            return set()
    return set()


def save_seen(seen: set) -> None:
    recent = list(seen)[-2000:]
    SEEN_FILE.write_text(json.dumps(recent))


def to_ascii_safe(text: str) -> str:
    """
    Strip or replace non-ASCII characters so ntfy headers don't crash.
    ntfy HTTP headers must be ASCII; emoji and Unicode titles blow up otherwise.
    """
    # Normalize unicode (e.g. accented chars → base char)
    normalized = unicodedata.normalize("NFKD", text)
    # Encode to ASCII, replacing anything that can't be represented
    return normalized.encode("ascii", errors="replace").decode("ascii")


def search_reddit(query: str, subreddit, limit: int = 10) -> list:
    """
    Search Reddit for posts. If subreddit is specified, restricts search to those communities.
    """
    headers = {"User-Agent": "AutoSplit-GrowthMonitor/1.0"}
    params = {
        "q": query,
        "sort": "new",
        "limit": limit,
        "t": "week",
        "type": "link",
    }
    if subreddit:
        # Searching within specific subreddits is key to reducing false positives
        url = f"https://www.reddit.com/r/{subreddit}/search.json"
        params["restrict_sr"] = "true"
    else:
        url = "https://www.reddit.com/search.json"

    try:
        with httpx.Client(timeout=10, headers=headers) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json().get("data", {}).get("children", [])
    except Exception as e:
        print(f"  Search failed for '{query}': {e}")
        return []


def post_age_hours(created_utc: float) -> float:
    return (datetime.now(timezone.utc).timestamp() - created_utc) / 3600


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> None:
    print(f"\n[reddit_monitor] {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    seen = load_seen()
    new_seen: set = set()
    alerts: list[dict] = []

    for search in SEARCHES:
        print(f"  '{search['query'][:50]}' in r/{search['subreddit'] or 'all'} ...", end=" ")
        posts = search_reddit(search["query"], search["subreddit"])
        new_count = 0

        time.sleep(1.5)  # be polite to Reddit's API

        for post in posts:
            d = post.get("data", {})
            post_id = d.get("id", "")
            if not post_id or post_id in seen or post_id in new_seen:
                continue
            if post_age_hours(d.get("created_utc", 0)) > MAX_POST_AGE_HOURS:
                continue
            if d.get("score", 0) < MIN_SCORE:
                continue

            new_seen.add(post_id)
            new_count += 1
            alerts.append({
                "label": search["label"],
                "priority": search["priority"],
                "title": d.get("title", "(no title)"),
                "subreddit": d.get("subreddit", ""),
                "permalink": f"https://reddit.com{d.get('permalink', '')}",
                "score": d.get("score", 0),
                "num_comments": d.get("num_comments", 0),
            })

        print(f"{new_count} new")

    save_seen(seen | new_seen)

    if not alerts:
        print("  No new posts found.")
        return

    # Sort: high-priority first, then by score descending
    alerts.sort(key=lambda a: (a["priority"] != "high", -a["score"]))

    # Send individual pushes for the top N alerts
    individual = alerts[:MAX_INDIVIDUAL_PUSHES]
    overflow = alerts[MAX_INDIVIDUAL_PUSHES:]

    for alert in individual:
        safe_title = to_ascii_safe(alert["title"])[:100]
        safe_label = to_ascii_safe(alert["label"])
        safe_sub = to_ascii_safe(alert["subreddit"])

        body = (
            f"{safe_title}\n\n"
            f"r/{safe_sub} · {alert['score']} pts · {alert['num_comments']} comments\n"
            f"{alert['permalink']}"
        )
        send_push(
            title=f"[{safe_label}] r/{safe_sub}",
            body=body,
            priority=alert["priority"],
            tags="eyes,speech_balloon",
            click_url=alert["permalink"],
        )
        print(f"  PUSH [{alert['label']}]: {alert['title'][:70]}")
        time.sleep(1.5)  # stay under ntfy's rate limit

    # If there were more results, send a single digest summary push
    if overflow:
        lines = [f"+ {len(overflow)} more posts found this run:"]
        for a in overflow[:8]:
            lines.append(f"· [{a['label']}] {to_ascii_safe(a['title'])[:60]}")
        send_push(
            title=f"AutoSplit: {len(overflow)} more Reddit opportunities",
            body="\n".join(lines),
            priority="default",
            tags="newspaper",
        )
        print(f"  DIGEST: {len(overflow)} additional posts batched into one push")

    print(f"\n  Total: {len(alerts)} new post(s) found, {len(individual)} individual pushes sent.")


if __name__ == "__main__":
    run()
