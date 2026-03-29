"""
webhooks.py — receives events from Supabase and fires push notifications.

How this works:
  1. Supabase fires an HTTP POST to this endpoint when a new user signs up
  2. We verify the request is really from Supabase (via a shared secret header)
  3. We send a push notification to Elle's phone via ntfy.sh

To set this up in Supabase (one-time setup):
  1. Go to your Supabase dashboard → Database → Webhooks
  2. Click "Create a new webhook"
  3. Name it: "new_user_signup"
  4. Table: auth.users  |  Events: INSERT
  5. Type: HTTP Request  |  Method: POST
  6. URL: https://[your-railway-url]/api/webhooks/signup
  7. HTTP Headers: add  x-webhook-secret: [value of WEBHOOK_SECRET in your .env]
  8. Save — that's it!
"""

import os
from fastapi import APIRouter, Request, Header, HTTPException
from notify import send_push

webhook_router = APIRouter()

# A shared secret so only Supabase (who knows this value) can call our endpoint.
# Set WEBHOOK_SECRET in Railway env vars AND in the Supabase webhook header config.
# If not set, the endpoint accepts all requests (fine for local dev/testing).
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")


@webhook_router.post("/webhooks/signup")
async def on_new_signup(
    request: Request,
    x_webhook_secret: str = Header(default=""),
):
    """
    Called by Supabase when a new user signs up.

    Supabase sends a JSON payload like:
    {
      "type": "INSERT",
      "table": "users",
      "schema": "auth",
      "record": { "id": "uuid", "email": "user@example.com", "created_at": "..." },
      "old_record": null
    }
    """
    # Verify the secret if it's configured — reject anything that doesn't match
    if WEBHOOK_SECRET and x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    # Parse the Supabase payload
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Extract what we need — Supabase puts the new row under "record"
    record = payload.get("record", {})
    event_type = payload.get("type", "")

    # Only process new user inserts (ignore updates, deletes)
    if event_type != "INSERT":
        return {"ok": True, "skipped": True}

    # Count how many users exist now (passed in record metadata if available)
    # We don't include the email in the push notification — it's not necessary
    # and we want to keep PII off our push channel.
    send_push(
        title="New AutoSplit signup!",
        body="Someone just created an account. You're growing.",
        priority="high",
        tags="tada,rocket",
    )

    return {"ok": True}


@webhook_router.post("/webhooks/test")
async def test_push(request: Request):
    """
    Test endpoint — POST here to verify ntfy is working.
    Remove or protect this in a hardened production setup.
    Usage: curl -X POST https://[your-railway-url]/api/webhooks/test
    """
    send_push(
        title="AutoSplit test notification",
        body="ntfy is wired up correctly! You'll see this on your phone.",
        priority="default",
        tags="white_check_mark",
    )
    return {"ok": True, "message": "Test push sent to ntfy channel"}
