/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * Istio-based auth guard for EKS.
 *
 * Istio RequestAuthentication validates the JWT and injects x-tenant-id header.
 * Istio AuthorizationPolicy rejects requests without a valid JWT.
 *
 * This guard simply reads the x-tenant-id header and attaches tenant info
 * to the request object. No JWT validation needed at the app level.
 */
@Injectable()
export class IstioAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      throw new UnauthorizedException('Missing x-tenant-id header');
    }

    // Attach tenant credentials to request (same shape as JWT strategy output)
    request.user = {
      tenantId,
      tenantTier: request.headers['x-tenant-tier'] || '',
      tenantName: request.headers['x-tenant-name'] || '',
      // Extract additional claims from JWT if present (for TokenVendingMachine)
      jwtToken: request.headers.authorization?.replace('Bearer ', '') || '',
    };

    return true;
  }
}
