"""
Factory that selects the IdP-specific JWT authorizer implementation.

The indirection exists so the authorizer Lambda can support multiple IdPs
(Cognito, Auth0, Okta, …) without changing the handler. Today only Cognito
is implemented.

Ported from the ECS reference's `idp_object_factory.py`.
"""

from cognito_idp_authorizer import CognitoIdpAuthorizer


def get_idp_authorizer_object(idp_name: str):
    """Return an IdP-specific authorizer instance.

    Raises:
        NotImplementedError: when the requested IdP has no implementation.
    """
    if idp_name == "Cognito":
        return CognitoIdpAuthorizer()
    raise NotImplementedError(f"Unsupported IdP: {idp_name}")
