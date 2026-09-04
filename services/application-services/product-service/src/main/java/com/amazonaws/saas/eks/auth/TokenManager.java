/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
package com.amazonaws.saas.eks.auth;

import java.text.ParseException;

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.nimbusds.jwt.JWTClaimsSet;

/**
 * Supplies the tenant id that repository queries are keyed on.
 *
 * The tenant is read from the claims of the token that {@link TokenProcessor}
 * already verified, taken off the populated security context. It is deliberately
 * not obtained by re-parsing the Authorization header: parsing a token proves
 * nothing about it, so reading the tenant that way would trust a value the caller
 * chose and let them select which tenant's data to operate on.
 */
@Component
public class TokenManager {
	private static final Logger logger = LogManager.getLogger(TokenManager.class);
	private static final String CUSTOM_TENANT_ID = "custom:tenant-id";

	@Autowired
	private JwtConfig jwtConfiguration;

	/**
	 * @param request retained for signature compatibility with existing callers;
	 *                the tenant comes from the verified security context.
	 * @return the caller's tenant id
	 * @throws IllegalStateException if the request was not authenticated, or the
	 *                               verified token carries no usable tenant
	 */
	public String getTenantId(HttpServletRequest request) throws Exception {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (!(authentication instanceof JwtAuth) || !authentication.isAuthenticated()) {
			// Reached only if a route is exposed without authentication; refuse
			// rather than fall back to reading the unverified header.
			throw new IllegalStateException("No verified token is present on this request");
		}

		JWTClaimsSet claims = ((JwtAuth) authentication).getJwtClaimsSet();
		String tenantId;
		try {
			tenantId = claims.getStringClaim(CUSTOM_TENANT_ID);
		} catch (ParseException e) {
			throw new IllegalStateException("Verified token has an unreadable tenant claim");
		}

		if (tenantId == null || tenantId.trim().isEmpty()) {
			throw new IllegalStateException("Verified token carries no tenant claim");
		}

		// Defence in depth: TokenProcessor already refuses a token whose tenant
		// is not this deployment's, so a mismatch here means the two have drifted.
		String configuredTenant = this.jwtConfiguration.getTenantId();
		if (configuredTenant != null && !configuredTenant.trim().isEmpty()
				&& !configuredTenant.equals(tenantId)) {
			throw new IllegalStateException("Verified token's tenant does not match this deployment's tenant");
		}

		return tenantId;
	}
}
