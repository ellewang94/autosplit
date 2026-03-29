"""
notify.py — thin wrapper around ntfy.sh for push notifications.

ntfy.sh is a free, open-source push notification service. You subscribe to a
channel in the ntfy app on your phone, and anything that POSTs to that channel
URL shows up as a push notification immediately.

Think of it like a private walkie-talkie channel between your server and your phone.

Usage:
    from notify import send_push
    send_push("New signup!", "Someone just joined AutoSplit", priority="high", tags="tada")

Environment variables:
    NTFY_CHANNEL  — the channel name (default: autosplit666)
"""

import os
import httpx

# The channel name — change via NTFY_CHANNEL env var if you ever rotate it
NTFY_CHANNEL = os.getenv("NTFY_CHANNEL", "autosplit666")
NTFY_BASE_URL = "https://ntfy.sh"


def send_push(
    title: str,
    body: str,
    priority: str = "default",
    tags: str = "",
    click_url: str = "",
) -> bool:
    """
    Send a push notification to the ntfy channel on Elle's phone.

    Args:
        title     — the bold headline of the notification
        body      — the main text (can be multi-line)
        priority  — "low", "default", "high", or "urgent" (urgent bypasses Do Not Disturb)
        tags      — comma-separated emoji tags from ntfy's list (e.g. "tada,rocket")
        click_url — optional URL to open when the notification is tapped

    Returns:
        True if the push was sent successfully, False if something went wrong.
        Push failures are intentionally silent — we never let a broken ntfy request
        take down the main app.
    """
    # Build headers — ntfy uses headers (not JSON body) for metadata
    headers: dict[str, str] = {
        "Title": title,
        "Priority": priority,
    }
    if tags:
        headers["Tags"] = tags
    if click_url:
        headers["Click"] = click_url

    try:
        with httpx.Client(timeout=5) as client:
            response = client.post(
                f"{NTFY_BASE_URL}/{NTFY_CHANNEL}",
                content=body.encode("utf-8"),
                headers=headers,
            )
            response.raise_for_status()
            return True
    except Exception as e:
        # Non-critical — log and move on. Don't let push failures break anything.
        print(f"[notify] Push failed: {e}")
        return False
