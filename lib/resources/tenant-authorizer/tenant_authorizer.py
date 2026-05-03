"""
Tenant Authorizer Lambda handler.

REQUEST-type API Gateway authorizer that:

  1. Extracts the JWT from the Authorization header, `_jwt` query string, or
     `authToken` cookie (in that priority order).
  2. Verifies the token against its originating Cognito User Pool's JWKS
     (CognitoIdpAuthorizer — dispatches via idp_object_factory).
  3. Builds an IAM policy that allows all methods by default and denies the
     `users`/`users/*` paths for TenantUser roles.
  4. Returns a context payload (tenantId/Tier/Name/userRole/userName) that
     `lib/api-stack.ts` projects into integration request headers via
     `context.authorizer.<key>` static override.

This handler does NOT call STS:AssumeRole and does NOT query DynamoDB. Tenant
isolation is enforced downstream (Istio RA at the Pod layer + IRSA + TVM for
DynamoDB session tags). See `.kiro/specs/api-gateway-lambda-authorizer/design.md`.
"""

import hashlib
import json
import logging
import os
from typing import Optional

import auth_manager
import idp_object_factory
from utils import AuthPolicy, HttpVerb


logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


_IDP_DETAILS = json.loads(os.environ.get("IDP_DETAILS", '{"name":"Cognito"}'))
_idp_authorizer_service = idp_object_factory.get_idp_authorizer_object(
    _IDP_DETAILS["name"]
)


def _extract_jwt(event: dict) -> str:
    """Extract a JWT from Authorization header, _jwt query, or authToken cookie.

    Priority: Authorization header (Bearer) > `_jwt` query > `authToken` cookie.
    Case-insensitive lookup for both the header name and the cookie header name.
    """
    headers = event.get("headers") or {}
    query = event.get("queryStringParameters") or {}

    # Normalize header lookup: API Gateway may deliver either case.
    auth = ""
    for k, v in headers.items():
        if k.lower() == "authorization":
            auth = v or ""
            break
    if auth.startswith("Bearer "):
        return auth[len("Bearer "):]

    q = query.get("_jwt") or ""
    if q:
        return q

    cookie_header = ""
    for k, v in headers.items():
        if k.lower() == "cookie":
            cookie_header = v or ""
            break
    for crumb in cookie_header.split(";"):
        crumb = crumb.strip()
        if crumb.startswith("authToken="):
            return crumb[len("authToken="):]

    raise Exception("Unauthorized")


def _redact(token: Optional[str]) -> str:
    """Return a log-safe token preview (first 8 chars + sha256 prefix)."""
    if not token or len(token) < 16:
        return "<short-or-empty>"
    digest = hashlib.sha256(token.encode()).hexdigest()[:8]
    return f"{token[:8]}...#{digest}"


def lambda_handler(event, context):
    token: Optional[str] = None
    try:
        token = _extract_jwt(event)
        claims = _idp_authorizer_service.validateJWT({"jwtToken": token})
        if not claims:
            logger.warning(
                "auth_denied result=deny errorReason=signature_or_claim_invalid "
                "jwtPrefix=%s",
                _redact(token),
            )
            raise Exception("Unauthorized")

        principal_id = claims.get("sub", "unknown")
        user_name = claims.get("cognito:username", "")
        tenant_id = claims.get("custom:tenant-id", "")
        tenant_tier = claims.get("custom:tenantTier", "")
        tenant_name = claims.get("custom:tenantName", "")
        user_role = claims.get("custom:userRole", "")
        iss = claims.get("iss", "")

        # Parse methodArn:
        # arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<verb>/<path...>
        tmp = event["methodArn"].split(":")
        aws_account_id = tmp[4]
        region = tmp[3]
        api_gateway_arn_parts = tmp[5].split("/")
        rest_api_id = api_gateway_arn_parts[0]
        stage = api_gateway_arn_parts[1]

        policy = AuthPolicy(principal_id, aws_account_id)
        policy.region = region
        policy.restApiId = rest_api_id
        policy.stage = stage
        policy.allowAllMethods()

        # Role-based Deny: TenantUser cannot reach /users or /users/*.
        path_segments = api_gateway_arn_parts[3:]
        first_segment = path_segments[0] if path_segments else ""
        if auth_manager.isTenantUser(user_role) and first_segment == "users":
            policy.denyMethod(HttpVerb.ALL, "users")
            policy.denyMethod(HttpVerb.ALL, "users/*")

        auth_response = policy.build()
        auth_response["context"] = {
            "tenantId": tenant_id,
            "tenantTier": tenant_tier,
            "tenantName": tenant_name,
            "userRole": user_role,
            "userName": user_name,
        }

        logger.info(
            "auth_allow result=allow tenantId=%s userRole=%s iss=%s jwtPrefix=%s",
            tenant_id,
            user_role,
            iss,
            _redact(token),
        )
        return auth_response

    except Exception as exc:
        # Converge every unexpected exception to Unauthorized so no internal
        # structure leaks through API Gateway's 401/403 surface.
        if str(exc) != "Unauthorized":
            logger.exception(
                "auth_error result=error jwtPrefix=%s", _redact(token)
            )
        raise Exception("Unauthorized")
