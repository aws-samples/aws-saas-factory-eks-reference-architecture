"""
Role-based authorization helpers.

Ported from the ECS reference with STS/IAM policy generation functions
(getPolicyForUser, Service_Identifier) removed — EKS does not use authorizer-
issued STS credentials.
"""


def isTenantUser(user_role: str) -> bool:
    """Return True iff the caller is a non-admin tenant user."""
    return user_role == "TenantUser"
