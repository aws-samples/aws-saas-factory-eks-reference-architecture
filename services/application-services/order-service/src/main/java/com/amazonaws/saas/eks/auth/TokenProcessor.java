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

import static com.nimbusds.jose.JWSAlgorithm.RS256;

import java.net.URL;
import java.text.ParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.stereotype.Component;

import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jose.util.ResourceRetriever;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

/**
 * Authenticates a request from the JWT in its Authorization header.
 *
 * The issuer and audience this service will accept are taken from configuration
 * (see {@link JwtConfig}) and never from the token. A token names its own issuer
 * in the `iss` claim, so deciding which key to verify against by reading that
 * claim lets anyone host a JWKS, sign a token against it, and be authenticated:
 * the signature check passes, but against a key the caller chose. The issuer is
 * therefore compared against the configured value before any key is fetched, and
 * the issuer and audience are checked again by the claims verifier after the
 * signature is validated.
 */
@Component
public class TokenProcessor {
	private static final Logger logger = LogManager.getLogger(TokenProcessor.class);

	private static final String TOKEN_USE_CLAIM = "token_use";
	private static final String ID_TOKEN_USE = "id";
	private static final String TENANT_ID_CLAIM = "custom:tenant-id";
	private static final String GROUPS_CLAIM = "cognito:groups";
	private static final String DEFAULT_ROLE = "ROLE_TENANT_USER";

	@Autowired
	private JwtConfig jwtConfiguration;

	/** Built once per instance from configuration, never from a request. */
	private volatile ConfigurableJWTProcessor<SecurityContext> jwtProcessor;

	/** Test seam: lets a test supply keys without reaching the network. */
	private JWKSource<SecurityContext> keySourceOverride;

	public Authentication authenticate(HttpServletRequest request) throws Exception {
		String header = request.getHeader(this.jwtConfiguration.getHttpHeader());
		if (header == null) {
			return null;
		}

		String trustedIssuer = this.jwtConfiguration.getIssuer();
		String trustedAudience = this.jwtConfiguration.getAudience();
		if (isBlank(trustedIssuer) || isBlank(trustedAudience)) {
			// Fail closed. Without a configured issuer and audience there is
			// nothing to pin the token against, so no token can be trusted.
			logger.error("Rejecting request: no trusted issuer/audience is configured. "
					+ "Set com.amazonaws.saas.eks.issuer and com.amazonaws.saas.eks.audience.");
			return null;
		}

		SignedJWT signedJWT;
		try {
			signedJWT = SignedJWT.parse(getBearerToken(header));
		} catch (ParseException e) {
			logger.warn("Rejecting request: the bearer token could not be parsed.");
			return null;
		}

		// Pin the issuer BEFORE any key lookup, so a token naming somebody
		// else's issuer never causes us to fetch that issuer's JWKS.
		String presentedIssuer;
		try {
			presentedIssuer = signedJWT.getJWTClaimsSet().getIssuer();
		} catch (ParseException e) {
			logger.warn("Rejecting request: the bearer token has an unreadable claims set.");
			return null;
		}
		if (!trustedIssuer.equals(presentedIssuer)) {
			logger.warn("Rejecting request: token issuer is not the configured issuer for this deployment.");
			return null;
		}

		JWTClaimsSet claims;
		try {
			claims = processor(trustedIssuer, trustedAudience).process(signedJWT, null);
		} catch (Exception e) {
			// Covers a bad signature, an unknown key, a wrong audience, and an
			// expired token. Deliberately does not log the token or the reason
			// detail, which can echo attacker-supplied values.
			logger.warn("Rejecting request: the bearer token failed verification.");
			return null;
		}

		// Cognito access tokens carry no tenant/identity claims we rely on, so
		// only an ID token is acceptable here.
		if (!ID_TOKEN_USE.equals(getStringClaim(claims, TOKEN_USE_CLAIM))) {
			logger.warn("Rejecting request: the bearer token is not an ID token.");
			return null;
		}

		// Each tenant is deployed into its own namespace against its own user
		// pool, so a token for a different tenant must not be honoured here even
		// if it is otherwise valid.
		String configuredTenant = this.jwtConfiguration.getTenantId();
		String tokenTenant = getStringClaim(claims, TENANT_ID_CLAIM);
		if (!isBlank(configuredTenant) && !configuredTenant.equals(tokenTenant)) {
			logger.warn("Rejecting request: the token's tenant does not match this deployment's tenant.");
			return null;
		}

		String username = getStringClaim(claims, this.jwtConfiguration.getUserNameField());
		if (isBlank(username)) {
			logger.warn("Rejecting request: the bearer token carries no username claim.");
			return null;
		}

		List<GrantedAuthority> authorities = authoritiesFrom(claims);
		return new JwtAuth(new User(username, "", authorities), claims, authorities);
	}

	/**
	 * Authorities are derived from the token's group membership. Previously every
	 * verified token was granted ROLE_ADMIN unconditionally, which made any user
	 * of the pool an administrator.
	 */
	private List<GrantedAuthority> authoritiesFrom(JWTClaimsSet claims) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		authorities.add(new SimpleGrantedAuthority(DEFAULT_ROLE));

		List<String> groups;
		try {
			groups = claims.getStringListClaim(GROUPS_CLAIM);
		} catch (ParseException e) {
			groups = null;
		}
		if (groups != null) {
			for (String group : groups) {
				if (!isBlank(group)) {
					authorities.add(new SimpleGrantedAuthority(
							"ROLE_" + group.trim().toUpperCase().replace('-', '_')));
				}
			}
		}
		return Collections.unmodifiableList(authorities);
	}

	private ConfigurableJWTProcessor<SecurityContext> processor(String issuer, String audience)
			throws Exception {
		ConfigurableJWTProcessor<SecurityContext> existing = this.jwtProcessor;
		if (existing != null) {
			return existing;
		}
		synchronized (this) {
			if (this.jwtProcessor == null) {
				this.jwtProcessor = buildProcessor(issuer, audience);
			}
			return this.jwtProcessor;
		}
	}

	private ConfigurableJWTProcessor<SecurityContext> buildProcessor(String issuer, String audience)
			throws Exception {
		JWKSource<SecurityContext> keySource = this.keySourceOverride;
		if (keySource == null) {
			ResourceRetriever retriever = new DefaultResourceRetriever(
					this.jwtConfiguration.getConnectionTimeout(), this.jwtConfiguration.getReadTimeout());
			// Built from the CONFIGURED issuer, never from the token.
			keySource = new RemoteJWKSet<>(new URL(this.jwtConfiguration.getJwkUrl()), retriever);
		}

		DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
		processor.setJWSKeySelector(new JWSVerificationKeySelector<>(RS256, keySource));

		// Without a claims verifier, process(token, null) checks the signature
		// and nothing else: not the issuer, not the audience, not expiry.
		processor.setJWTClaimsSetVerifier(new DefaultJWTClaimsVerifier<>(
				audience,
				new JWTClaimsSet.Builder().issuer(issuer).build(),
				new HashSet<>(java.util.Arrays.asList("exp", TOKEN_USE_CLAIM))));
		return processor;
	}

	/** Visible for testing: supply keys without a network round trip. */
	void setKeySourceForTesting(JWKSource<SecurityContext> keySource) {
		this.keySourceOverride = keySource;
		this.jwtProcessor = null;
	}

	/** Visible for testing. */
	void setJwtConfigurationForTesting(JwtConfig jwtConfiguration) {
		this.jwtConfiguration = jwtConfiguration;
		this.jwtProcessor = null;
	}

	private static String getStringClaim(JWTClaimsSet claims, String name) {
		try {
			return claims.getStringClaim(name);
		} catch (ParseException e) {
			return null;
		}
	}

	private static boolean isBlank(String value) {
		return value == null || value.trim().isEmpty();
	}

	private String getBearerToken(String token) {
		return token.startsWith("Bearer ") ? token.substring("Bearer ".length()) : token;
	}
}
