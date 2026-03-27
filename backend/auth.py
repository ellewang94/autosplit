"""
Auth dependency for FastAPI — validates Supabase JWTs.

HOW THIS WORKS:
When a user logs in through the frontend (via Supabase Auth), Supabase gives
them a JWT token (think of it as a signed membership card). Every API request
from the frontend includes this token in the Authorization header.

This file verifies that token is genuine by checking Supabase's PUBLIC signing
key — no secret needed. Supabase publishes their public keys at a standard URL
called a JWKS endpoint (JSON Web Key Set). We fetch that once, cache it, and
use it to verify every token.

Think of it like checking a celebrity's signature against their publicly known
handwriting — you don't need to know their private pen to spot a fake.

This uses ES256 (Elliptic Curve), the modern asymmetric approach Supabase
adopted. It's better than the old shared-secret (HS256) approach because
there's literally no secret to leak.
"""

import os
import json
import urllib.request
from typing import Optional
from fastapi import Header, HTTPException
from jose import jwt, JWTError
from jose import jwk as jose_jwk

# ── JWKS cache ────────────────────────────────────────────────────────────────
# We fetch the public keys from Supabase once and keep them in memory.
# Supabase keys rotate infrequently, so this is safe and much faster than
# fetching on every request. In the unlikely event of a key rotation,
# restarting the server will refresh the cache.
_jwks_cache: Optional[dict] = None


def _get_public_key(kid: str):
    """
    Fetch and cache Supabase's public signing keys (JWKS).
    Returns the key matching the given kid (key ID from the JWT header).

    kid = "key ID" — each signing key has an ID so you can look it up.
    It's included in the JWT header so we know which key was used to sign it.
    """
    global _jwks_cache

    # Lazy-load: fetch from Supabase only once per server boot
    if _jwks_cache is None:
        supabase_url = os.getenv("SUPABASE_URL")
        if not supabase_url:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_URL is not configured on the server."
            )
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        try:
            with urllib.request.urlopen(jwks_url, timeout=5) as resp:
                _jwks_cache = json.loads(resp.read())
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Could not fetch auth keys from Supabase: {e}"
            )

    # Find the key whose kid matches the one in the JWT header
    keys = _jwks_cache.get("keys", [])
    key_data = next((k for k in keys if k.get("kid") == kid), None)

    if not key_data:
        # Kid not found — clear cache and raise so the server can retry on next boot
        _jwks_cache = None
        raise HTTPException(status_code=401, detail="Unknown signing key. Please sign in again.")

    # Build a usable public key object from the JWKS data
    return jose_jwk.construct(key_data, algorithm="ES256")


def get_current_user_id(authorization: str = Header(default=None)) -> str:
    """
    Validates the Supabase JWT from the Authorization: Bearer <token> header.
    Returns the user's UUID (their permanent Supabase user ID).
    Raises HTTP 401 if the token is missing, forged, or expired.

    FastAPI routes declare this as a dependency:
        @router.get("/something")
        def my_route(user_id: str = Depends(get_current_user_id)):
            # user_id is guaranteed valid here — no further checks needed
    """

    # 1. Check the header exists and is formatted correctly
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Not signed in. Please log in to continue."
        )

    token = authorization.split(" ", 1)[1]

    try:
        # 2. Peek at the JWT header (without verifying) to get the key ID
        #    Every JWT has a header, payload, and signature. The header tells
        #    us which key was used to sign it.
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Token has no key ID.")

        # 3. Fetch the matching public key and verify the full token
        public_key = _get_public_key(kid)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["ES256"],
            options={"verify_aud": False},  # Supabase JWTs don't always include audience
        )

        # 4. Extract the user ID from the "sub" (subject) claim
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token has no user ID.")

        return user_id

    except HTTPException:
        raise  # Re-raise our own HTTPExceptions unchanged
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")
