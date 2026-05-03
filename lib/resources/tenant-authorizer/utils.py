"""
Shared utilities for the Tenant Authorizer Lambda.

Ported from the ECS reference architecture
(refer/saas-ecs/server/lib/shared-infra/Resources/tenant_authorizer.py).

STS AssumeRole / IAM policy generation via auth_manager.getPolicyForUser is
removed because tenant isolation on EKS is enforced at the Pod layer via IRSA
+ TokenVendingMachine session tags, not by authorizer-issued credentials.
"""

import re
from enum import Enum


class TenantTier(Enum):
    BASIC = "basic"
    STANDARD = "standard"
    PREMIUM = "premium"


class HttpVerb:
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    HEAD = "HEAD"
    DELETE = "DELETE"
    OPTIONS = "OPTIONS"
    ALL = "*"


class AuthPolicy:
    """
    Builds an API Gateway Lambda Authorizer policy document.

    This is a direct port of the ECS reference's AuthPolicy class with the
    STS AssumeRole-related code removed. The build() method produces a
    `{principalId, policyDocument}` response that API Gateway accepts.
    """

    awsAccountId = ""
    principalId = ""
    version = "2012-10-17"
    pathRegex = r"^[/.a-zA-Z0-9-\*]+$"

    restApiId = "*"
    region = "*"
    stage = "*"

    def __init__(self, principal, awsAccountId):
        self.awsAccountId = awsAccountId
        self.principalId = principal
        self.allowMethods = []
        self.denyMethods = []

    def _addMethod(self, effect, verb, resource, conditions):
        if verb != "*" and not hasattr(HttpVerb, verb):
            raise NameError(
                "Invalid HTTP verb " + verb + ". Allowed verbs in HttpVerb class"
            )
        resourcePattern = re.compile(self.pathRegex)
        if not resourcePattern.match(resource):
            raise NameError(
                "Invalid resource path: " + resource
                + ". Path should match " + self.pathRegex
            )

        if resource[:1] == "/":
            resource = resource[1:]

        resourceArn = (
            "arn:aws:execute-api:"
            + self.region + ":"
            + self.awsAccountId + ":"
            + self.restApiId + "/"
            + self.stage + "/"
            + verb + "/"
            + resource
        )

        if effect.lower() == "allow":
            self.allowMethods.append(
                {"resourceArn": resourceArn, "conditions": conditions}
            )
        elif effect.lower() == "deny":
            self.denyMethods.append(
                {"resourceArn": resourceArn, "conditions": conditions}
            )

    def _getEmptyStatement(self, effect):
        return {
            "Action": "execute-api:Invoke",
            "Effect": effect[:1].upper() + effect[1:].lower(),
            "Resource": [],
        }

    def _getStatementForEffect(self, effect, methods):
        statements = []
        if len(methods) > 0:
            statement = self._getEmptyStatement(effect)
            for curMethod in methods:
                if curMethod["conditions"] is None or len(curMethod["conditions"]) == 0:
                    statement["Resource"].append(curMethod["resourceArn"])
                else:
                    conditionalStatement = self._getEmptyStatement(effect)
                    conditionalStatement["Resource"].append(curMethod["resourceArn"])
                    conditionalStatement["Condition"] = curMethod["conditions"]
                    statements.append(conditionalStatement)
            statements.append(statement)
        return statements

    def allowAllMethods(self):
        self._addMethod("Allow", HttpVerb.ALL, "*", [])

    def denyMethod(self, verb, resource):
        self._addMethod("Deny", verb, resource, [])

    def build(self):
        if (
            (self.allowMethods is None or len(self.allowMethods) == 0)
            and (self.denyMethods is None or len(self.denyMethods) == 0)
        ):
            raise NameError("No statements defined for the policy")

        policy = {
            "principalId": self.principalId,
            "policyDocument": {"Version": self.version, "Statement": []},
        }
        policy["policyDocument"]["Statement"].extend(
            self._getStatementForEffect("Allow", self.allowMethods)
        )
        policy["policyDocument"]["Statement"].extend(
            self._getStatementForEffect("Deny", self.denyMethods)
        )
        return policy
