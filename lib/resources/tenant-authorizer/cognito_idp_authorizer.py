"""
CognitoIdpAuthorizer — JWT signature / exp / aud verification for Cognito.

Ported from the ECS reference's `cognito_authorizer.py` with two adjustments:

  1. JWKS responses are cached in-process per keys_url with a TTL. A mis-
     matched `kid` triggers a one-time forced refetch before giving up.
  2. On JWKS fetch failure we return the stale cache when present (prefer
     availability) and raise only when no cache exists (fail-closed).

The multi-tenant dispatch works the same way as ECS: we read the `iss` claim
without verifying the signature first (it is only used as an identifier), take
the trailing path segment as the Cognito User Pool ID, and fetch that pool's
JWKS. Signature verification is what actually establishes trust.
"""

import json
import os
import time
import urllib.request
from typing import Dict, List, Optional

import boto3
from jose import jwk, jwt
from jose.utils import base64url_decode


REGION = os.environ.get(
    "AWS_REGION", boto3.session.Session().region_name or "us-east-1"
)
JWKS_CACHE_TTL_SEC = int(os.environ.get("JWKS_CACHE_TTL_SEC", "3600"))
_JWKS_FETCH_TIMEOUT_SEC = 3

# Module-global cache: keys_url -> (keys_list, fetched_at_epoch_seconds)
_jwks_cache: Dict[str, tuple] = {}



def _get_jwks_cached(keys_url: str, force_refetch: bool = False) -> List[dict]:
    """Fetch a JWKS document with in-process caching.

    - Cache hit within TTL → return cached keys.
    - Cache miss / TTL expired / force_refetch → HTTP GET, cache, return.
    - Fetch failure with stale cache → return stale cache (prefer availability).
    - Fetch failure without cache → raise (fail-closed at the caller).
    """
    now = time.time()
    cached = _jwks_cache.get(keys_url)

    if not force_refetch and cached is not None:
        keys, fetched_at = cached
        if now - fetched_at < JWKS_CACHE_TTL_SEC:
            return keys

    try:
        with urllib.request.urlopen(keys_url, timeout=_JWKS_FETCH_TIMEOUT_SEC) as f:
            body = f.read()
        keys = json.loads(body.decode("utf-8"))["keys"]
        _jwks_cache[keys_url] = (keys, now)
        return keys
    except Exception:
        if cached is not None:
            # Availability over freshness when JWKS endpoint is flaky.
            return cached[0]
        raise


class CognitoIdpAuthorizer:
    """JWT verifier for Amazon Cognito User Pool tokens."""

    def validateJWT(self, input_details: dict):
        """Verify a Cognito-issued JWT end-to-end.

        Args:
            input_details: {"jwtToken": str}

        Returns:
            dict of verified claims on success; False on any verification
            failure that is not an infrastructure exception.
        """
        token = input_details["jwtToken"]

        # Extract identifying claims without verifying the signature yet.
        payload = jwt.get_unverified_claims(token)
        iss = payload.get("iss", "")
        if not iss:
            return False
        user_pool_id = iss.rsplit("/", 1)[-1]
        app_client_id = payload.get("aud", "")
        if not app_client_id:
            return False

        keys_url = (
            f"https://cognito-idp.{REGION}.amazonaws.com/"
            f"{user_pool_id}/.well-known/jwks.json"
        )
        keys = _get_jwks_cached(keys_url)
        return self._verify(token, app_client_id, keys, keys_url)

    def _verify(
        self,
        token: str,
        app_client_id: str,
        keys: List[dict],
        keys_url: str,
    ):
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")
        if not kid:
            return False

        key = self._find_key(kid, keys)
        if key is None:
            # One-shot forced refetch handles key rotation races.
            keys = _get_jwks_cached(keys_url, force_refetch=True)
            key = self._find_key(kid, keys)
            if key is None:
                return False

        public_key = jwk.construct(key)
        message, encoded_signature = str(token).rsplit(".", 1)
        decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))
        if not public_key.verify(message.encode("utf-8"), decoded_signature):
            return False

        claims = jwt.get_unverified_claims(token)
        if time.time() > claims.get("exp", 0):
            return False
        if claims.get("aud") != app_client_id:
            return False

        return claims

    @staticmethod
    def _find_key(kid: str, keys: List[dict]) -> Optional[dict]:
        for k in keys:
            if k.get("kid") == kid:
                return k
        return None
