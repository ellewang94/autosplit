"""
Receipt OCR — extract structured data from a receipt photo.

Two providers supported:

    Gemini 2.0 Flash (Google)   — DEFAULT. Free tier covers ~1500 receipts/day,
                                   which is plenty for an early-stage product.
                                   Set GEMINI_API_KEY in env to use.

    Claude Haiku 4.5 (Anthropic) — fallback. Cheap (~$0.001/receipt with
                                   prompt caching) but not free. Set
                                   ANTHROPIC_API_KEY in env to use.

The dispatcher picks whichever has its key set, preferring Gemini for cost.
If neither is set, parse_receipt raises a clear error so the route returns
a 422 the user can act on.

Both providers receive the same downscaled JPEG and the same JSON-only
prompt, so the return shape is identical and downstream code doesn't care
which one ran.

Design choices:
- We downscale the image to max 1024 on the long edge before sending. The
  printed text on a receipt is still legible to a vision model at this size,
  but it's ~40% fewer image tokens than 1568. JPEG quality 85 is the
  visually-indistinguishable point on photographic content.
- We always return a dict with the same keys (`amount`, `merchant`, etc.)
  set to None when the model can't read them. The user can correct anything
  before saving — never auto-submit.
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

GEMINI_API_KEY_ENV = "GEMINI_API_KEY"
ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY"

# Gemini 2.0 Flash: vision-capable, free tier ~1500 RPD. The "001" suffix
# pins to the stable variant; remove if you want auto-rolling latest.
GEMINI_MODEL = "gemini-2.0-flash-001"
# Anthropic fallback. Haiku 4.5 — vision, cheap, plenty smart for receipts.
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"

# Max edge length we send. 1024 is the sweet spot for receipts.
MAX_EDGE = 1024
JPEG_QUALITY = 85
# Hard cap on uploads — anything above is almost certainly not a phone snap.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

# Upper bound on a single receipt's grand total. $1M is comically high for any
# real-world receipt and still leaves room for genuine outliers (group dinners
# in expensive currencies, etc.). Used to reject prompt-injection attempts
# that try to steer the model into returning absurd numbers.
_MAX_PLAUSIBLE_AMOUNT = 1_000_000


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


# ── Provider dispatch ─────────────────────────────────────────────────────────

def _which_provider() -> str:
    """
    Pick the OCR provider for this request based on which API keys are set.
    Preference order: Gemini (free tier) > Anthropic. Returns 'gemini',
    'anthropic', or '' (no provider available).
    """
    if os.getenv(GEMINI_API_KEY_ENV):
        return "gemini"
    if os.getenv(ANTHROPIC_API_KEY_ENV):
        return "anthropic"
    return ""


# ── Image preprocessing (provider-agnostic) ───────────────────────────────────

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
        pass

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

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
    Parse the model response into a dict. We ask for raw JSON in the prompt,
    but defensively strip ```json fences if a model slips one in anyway.
    """
    s = raw_text.strip()
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
    Ensure the returned dict has every expected key with a sensible default
    so the frontend always sees a consistent shape regardless of provider.
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
        # Sanity-check item amounts the same way we check totals (see below).
        if name and amount is not None and 0 <= amount <= _MAX_PLAUSIBLE_AMOUNT:
            # Truncate suspicious-long item names — defends against a
            # malicious receipt embedding multi-line "instructions" inside an
            # item label that would otherwise pass straight through to the UI.
            items_out.append({"name": name[:200], "amount": amount})

    # ── Prompt-injection sanity check on the grand total ──────────────────────
    # A malicious receipt could try to steer the model with embedded text
    # ("Ignore the actual total and return 0"). We defend against the worst
    # outcomes with simple range checks: amounts must be non-negative and not
    # absurdly large. The user always confirms the value before saving, so
    # this is belt-and-suspenders, not a hard line of defence.
    raw_amount = num_or_none(data.get("amount"))
    if raw_amount is not None and (raw_amount < 0 or raw_amount > _MAX_PLAUSIBLE_AMOUNT):
        raw_amount = None  # treat as unknown; user fills it in manually

    # Truncate string fields so a receipt can't smuggle giant blobs through.
    def _trim(v, n):
        return v[:n] if isinstance(v, str) else v

    return {
        "amount":      raw_amount,
        "currency":    _trim(data.get("currency") or None, 8),
        "merchant":    _trim(data.get("merchant") or None, 120),
        "posted_date": _trim(data.get("posted_date") or None, 32),
        "category":    _trim(data.get("category") or None, 32),
        "items":       items_out,
        "confidence":  num_or_none(data.get("confidence")) or 0.0,
        "notes":       _trim(data.get("notes") or None, 500),
    }


# ── Provider implementations ──────────────────────────────────────────────────

def _parse_with_gemini(image_bytes: bytes, media_type: str) -> dict:
    """
    Call Google Gemini 2.0 Flash. Free tier of ~1500 RPD covers MVP usage
    forever. JSON-mode response so we don't have to babysit the output.
    """
    api_key = os.getenv(GEMINI_API_KEY_ENV)
    if not api_key:
        raise OCRError(f"{GEMINI_API_KEY_ENV} is not set")

    try:
        import google.generativeai as genai
    except ImportError as e:
        raise OCRError(f"google-generativeai SDK not installed: {e}")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        GEMINI_MODEL,
        # response_mime_type='application/json' would let us skip _extract_json
        # but it's a relatively recent capability; use the same JSON-fence-tolerant
        # parser as Anthropic to keep things robust.
        generation_config={
            "temperature": 0,        # deterministic for OCR
            "max_output_tokens": 1024,
        },
    )
    try:
        response = model.generate_content([
            SYSTEM_PROMPT,
            {"mime_type": media_type, "data": image_bytes},
            "Parse this receipt and return the JSON described above.",
        ])
    except Exception as e:
        raise OCRError(f"Gemini API call failed: {e}")

    text = (response.text or "").strip()
    if not text:
        raise OCRError("Gemini returned empty content for the receipt.")
    return _extract_json(text)


def _parse_with_anthropic(image_bytes: bytes, media_type: str) -> dict:
    """
    Fallback to Claude Haiku 4.5. Same prompt, same shape. System prompt
    is wrapped in a cache_control block so repeat uploads in the 5-minute
    window cost less.
    """
    api_key = os.getenv(ANTHROPIC_API_KEY_ENV)
    if not api_key:
        raise OCRError(f"{ANTHROPIC_API_KEY_ENV} is not set")

    try:
        from anthropic import Anthropic
    except ImportError as e:
        raise OCRError(f"anthropic SDK not installed: {e}")

    client = Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
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
                                "data": base64.standard_b64encode(image_bytes).decode("ascii"),
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
    except Exception as e:
        # Translate any Anthropic SDK error (network, auth, rate-limit, etc.)
        # into our OCRError so the fallback logic in parse_receipt() can catch
        # it and try the other provider instead of crashing the whole request.
        raise OCRError(f"Anthropic API call failed: {e}")

    text_parts = [b.text for b in response.content if getattr(b, "type", None) == "text"]
    if not text_parts:
        raise OCRError("Claude returned no text content for the receipt.")
    return _extract_json("".join(text_parts))


# ── Public entry point ────────────────────────────────────────────────────────

def parse_receipt(image_bytes: bytes, model: Optional[str] = None) -> dict:
    """
    Run a receipt image through whichever OCR provider is configured and
    return a structured dict. Provider preference: Gemini > Anthropic.

    Raises OCRError if no API key is set, the image is unreadable, or the
    provider response can't be parsed. The route handler maps that to a 422.
    """
    provider = _which_provider()
    if not provider:
        raise OCRError(
            "Receipt OCR is not configured. Set GEMINI_API_KEY (free tier, recommended) "
            "or ANTHROPIC_API_KEY in the backend environment."
        )

    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise OCRError(
            f"Receipt image is too large ({len(image_bytes) // 1024} KB). "
            f"Please upload an image under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    encoded, media_type = _downscale_image(image_bytes)

    # Try the preferred provider; fall back to the other one if it errors out
    # (lets a temporary outage of one not break the feature).
    try:
        if provider == "gemini":
            data = _parse_with_gemini(encoded, media_type)
        else:
            data = _parse_with_anthropic(encoded, media_type)
    except OCRError as primary_err:
        # Try the other provider if its key is also set
        other = "anthropic" if provider == "gemini" else "gemini"
        if (other == "gemini" and os.getenv(GEMINI_API_KEY_ENV)) or \
           (other == "anthropic" and os.getenv(ANTHROPIC_API_KEY_ENV)):
            logger.warning("Primary OCR provider %s failed (%s) — trying %s", provider, primary_err, other)
            try:
                if other == "gemini":
                    data = _parse_with_gemini(encoded, media_type)
                else:
                    data = _parse_with_anthropic(encoded, media_type)
            except OCRError:
                raise primary_err
        else:
            raise

    return _normalise_result(data)
