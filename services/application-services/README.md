# Application Services

Sample microservices deployed on a per-tenant basis as pods inside tenant-specific EKS namespaces.

## Directory Structure

```
application-services/
├── application/          # NestJS monorepo (shared libs + microservices)
│   ├── libs/             # Shared libraries
│   │   ├── auth/         # IstioAuthGuard, TenantCredentials decorator, TokenVendingMachine
│   │   └── client-factory/ # Tier-based DynamoDB client (ABAC for Basic, IRSA for Standard/Premium)
│   ├── microservices/
│   │   ├── order/        # Order CRUD service
│   │   └── product/      # Product CRUD service
│   ├── Dockerfile.order
│   ├── Dockerfile.product
│   ├── package.json
│   └── nest-cli.json
└── kubernetes/           # K8s manifests (Deployment + Service + Istio VirtualService)
    ├── order/
    └── product/
```

## Authentication

Istio handles JWT validation via `RequestAuthentication` and injects `x-tenant-id` header.
The `IstioAuthGuard` reads this header — no Cognito SDK needed at the app level.

## DynamoDB Access Pattern

- Basic tier: Shared table + STS AssumeRole (ABAC leading key isolation)
- Standard/Premium tier: Per-tenant table + IRSA (ServiceAccount credentials)
