"""
Receipt OCR via Claude vision.

Takes an uploaded image (typically a phone photo of a paper receipt), runs
it through the Claude API with a structured extraction prompt, and returns
a normalised dict that the frontend uses to pre-fill the Add Expense form.

Design choices:
- We downscale the image to max 1568x1568 before sending. The Anthropic
  vision endpoint accepts up to 8000x8000 but pricing is by token count,
  and 1568 is the sweet spot for legible receipt text without burning
  cash. Receipts are skinny / tall, so we cap on the longer side and
  preserve aspect ratio.
- The system prompt is wrapped in a `cache_control` block so subsequent
  receipt uploads in the same 5-minute window cost less. The user-supplied
  image varies, so it stays uncached.
- We always return a dict with the same keys (`amount`, `merchant`, etc.)
  set to None when Claude can't read them, never raise on missing fields.
  The user can correct anything before saving.
- We use the Claude Sonnet 4.6 model (per the project's general
  guidance — fast, cheap enough for OCR, and vision-capable).
"""

import base64
import io
import json
import logging
import os
import re
from typing import Optional

from PIL import Image

logger = logging.getLogger(__name__)

# Configurable so tests can override; we want a single env var on Railway.
ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY"
# Haiku 4.5 is the default — vision-capable, ~3-5x cheaper than Sonnet, plenty
# smart for the structured extraction we need (amount, merchant, date, items).
# Pre-monetization, every cent matters. Switch to Sonnet 4.6 only if Haiku
# starts mis-reading receipts in production (override per-call via the model
# arg in parse_receipt). Opus 4.7 would be overkill for receipts — don't.
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# Max edge length we send to Claude. 1024 is the sweet spot for receipts:
# the printed text is still legible to vision models at this resolution, but
# it's ~40% fewer image tokens than 1568 (image tokens scale with pixel area).
# JPEG quality 85 is visually indistinguishable on photographic content.
# Bumped down from 1568 to optimize cost while staying above the legibility
# floor for typical phone photos of paper receipts.
MAX_EDGE = 1024
JPEG_QUALITY = 85

# Anthropic's vision API caps at 5 MB per image after encoding. We hard-cap
# uploads at 8 MB to leave headroom; bigger files almost always indicate a
# user uploading something other than a phone snap.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


SYSTEM_PROMPT = """You are a receipt-parsing assistant. The user will send you a photo of a receipt (typically from a restaurant, store, taxi, or similar). Extract the following information and respond with ONLY a single JSON object — no commentary, no markdown fences, no explanation.

Schema:
{
  "amount": number | null,        // The grand total the customer paid, including tax + tip if shown. Use the line that says TOTAL, GRAND TOTAL, AMOUNT DUE, or similar.
  "currency": string | null,      // ISO 4217 code (USD, EUR, MXN, JPY, etc). Infer from the currency symbol or country if you can; null if unsure.
  "merchant": string | null,      // The business / store name as written on the receipt. Title-case it (e.g. "Casa Tortillas", not "CASA TORTILLAS").
  "posted_date": string | null,   // The date on the receipt, formatted YYYY-MM-DD. Null if not visible.
  "category": string | null,      // ONE of: "dining", "groceries", "transport", "lodging", "entertainment", "shopping", "coffee", "drinks", "fuel", "other". Pick the best fit; null if you really can't tell.
  "items": [                      // Optional line items, only if clearly readable. Empty array is fine.
    { "name": string, "amount": number }
  ],
  "confidence": number,           // 0.0 to 1.0 — your subjective confidence the extracted total + merchant are correct.
  "notes": string | null          // Anything the user should double-check (e.g. "tip not shown — total may be pre-tip"). Null if no notes.
}

Rules:
- Output ONLY the JSON object. No prose, no markdown.
- Numbers must be parseable by JSON.parse — no commas, no currency symbols, no quotes around numbers.
- If the photo isn't a receipt at all, return {"amount": null, "currency": null, "merchant": null, "posted_date": null, "category": null, "items": [], "confidence": 0.0, "notes": "Image does not appear to be a receipt."}
- Never invent values you can't see. Null is always acceptable.
"""


class OCRError(Exception):
    """Raised when the OCR pipeline can't produce a usable result."""


def _downscale_image(raw: bytes) -> tuple[bytes, str]:
    """
    Validate the uploaded bytes are a real image, downscale if oversized,
    and re-encode as JPEG. Returns (encoded_bytes, media_type).
    """
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as e:
        raise OCRError(f"Could not read uploaded image: {e}")

    # Strip orientation EXIF so the rotated photo stays rotated after re-encode
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        # ImageOps.exif_transpose can fail on weird files — just continue
        pass

    # Convert to RGB (JPEG can't store alpha; many phone photos are RGBA)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Cap on the longer edge, preserve aspect ratio
    w, h = img.size
    longest = max(w, h)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), "image/jpeg"


def _extract_json(raw_text: str) -> dict:
    """
    Parse Claude's response into a dict. We ask for raw JSON in the system
    prompt, but defensively strip ```json fences if it slips one in anyway.
    """
    s = raw_text.strip()
    # Strip code fences if any
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError as e:
        logger.warning("OCR response not valid JSON: %r", s[:200])
        raise OCRError(f"Could not parse OCR response as JSON: {e}")


def _normalise_result(data: dict) -> dict:
    """
    Ensure the returned dict has every expected key with a sensible default.
    The frontend treats `null` and missing-key the same, but having a
    consistent shape makes the API contract cleaner.
    """
    def num_or_none(v):
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    items_in = data.get("items") or []
    items_out = []
    for it in items_in:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip()
        amount = num_or_none(it.get("amount"))
        if name and amount is not None:
            items_out.append({"name": name, "amount": amount})

    return {
        "amount":      num_or_none(data.get("amount")),
        "currency":    (data.get("currency") or None) or None,
        "merchant":    (data.get("merchant") or None) or None,
        "posted_date": (data.get("posted_date") or None) or None,
        "category":    (data.get("category") or None) or None,
        "items":       items_out,
        "confidence":  num_or_none(data.get("confidence")) or 0.0,
        "notes":       (data.get("notes") or None) or None,
    }


def parse_receipt(image_bytes: bytes, model: Optional[str] = None) -> dict:
    """
    Run a receipt image through Claude vision and return a structured dict.

    Raises OCRError if the API key is missing, the image is unreadable, or
    Claude's response can't be parsed. The caller (route handler) should
    convert that into an HTTPException.
    """
    api_key = os.getenv(ANTHROPIC_API_KEY_ENV)
    if not api_key:
        raise OCRError("Receipt OCR is not configured (missing ANTHROPIC_API_KEY).")

    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise OCRError(
            f"Receipt image is too large ({len(image_bytes) // 1024} KB). "
            f"Please upload an image under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    encoded, media_type = _downscale_image(image_bytes)

    # Lazy import so the rest of the backend can boot without the SDK installed
    # (e.g. during the initial pip install on Railway).
    try:
        from anthropic import Anthropic
    except ImportError as e:
        raise OCRError(f"Anthropic SDK not installed: {e}")

    client = Anthropic(api_key=api_key)

    # The system prompt is cacheable — it doesn't change between requests.
    # Only pass the image as the (uncached) user content. Even a couple of
    # OCR calls in a 5-minute window will start hitting cache.
    response = client.messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64.standard_b64encode(encoded).decode("ascii"),
                        },
                    },
                    {
                        "type": "text",
                        "text": "Parse this receipt and return the JSON described in the system prompt.",
                    },
                ],
            }
        ],
    )

    # Extract the text content from Claude's response. The SDK returns a
    # list of content blocks; for a JSON-only response there's just one.
    text_parts = [b.text for b in response.content if getattr(b, "type", None) == "text"]
    if not text_parts:
        raise OCRError("Claude returned no text content for the receipt.")
    raw = "".join(text_parts)

    parsed = _extract_json(raw)
    return _normalise_result(parsed)
