/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
package com.amazonaws.saas.eks.auth;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Date;

import javax.servlet.http.HttpServletRequest;

import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Pins the authentication behaviour that the reported issue depended on: the
 * service must decide which key to trust from its own configuration, not from
 * the token, and must not hand out administrator rights to every valid token.
 */
public class TokenProcessorTest {

	private static final String TRUSTED_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_trusted";
	private static final String TRUSTED_AUDIENCE = "trusted-app-client-id";
	private static final String TENANT = "tenant-a";

	private RSAKey trustedKey;
	private RSAKey attackerKey;
	private TokenProcessor processor;

	@Before
	public void setUp() throws Exception {
		trustedKey = new RSAKeyGenerator(2048).keyID("trusted").generate();
		attackerKey = new RSAKeyGenerator(2048).keyID("attacker").generate();

		JwtConfig config = new JwtConfig();
		config.setIssuer(TRUSTED_ISSUER);
		config.setAudience(TRUSTED_AUDIENCE);
		config.setTenantId(TENANT);

		processor = new TokenProcessor();
		processor.setJwtConfigurationForTesting(config);
		// Only the trusted pool's key is available to the verifier.
		processor.setKeySourceForTesting(
				new ImmutableJWKSet<SecurityContext>(new JWKSet(trustedKey.toPublicJWK())));
	}

	private static HttpServletRequest requestWith(String token) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("Authorization", "Bearer " + token);
		return request;
	}

	private static String sign(RSAKey key, JWTClaimsSet claims) throws Exception {
		SignedJWT jwt = new SignedJWT(
				new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
		jwt.sign(new RSASSASigner(key));
		return jwt.serialize();
	}

	private static JWTClaimsSet.Builder validClaims() {
		return new JWTClaimsSet.Builder()
				.issuer(TRUSTED_ISSUER)
				.audience(TRUSTED_AUDIENCE)
				.subject("subject-1")
				.claim("cognito:username", "alice")
				.claim("token_use", "id")
				.claim("custom:tenant-id", TENANT)
				.expirationTime(new Date(System.currentTimeMillis() + 600_000));
	}

	// --- the reported attack -------------------------------------------------

	@Test
	public void tokenFromAnIssuerWeDoNotTrustIsRejected() throws Exception {
		// A caller hosts their own key material and signs a token that is
		// internally consistent — but names their own issuer.
		String forged = sign(attackerKey, validClaims()
				.issuer("https://attacker.example.com/pool")
				.build());

		assertNull(processor.authenticate(requestWith(forged)));
	}

	@Test
	public void tokenClaimingTheTrustedIssuerButSignedByAnotherKeyIsRejected() throws Exception {
		// Same issuer string, wrong signing key: the signature must fail because
		// keys come from the configured issuer only.
		String forged = sign(attackerKey, validClaims().build());

		assertNull(processor.authenticate(requestWith(forged)));
	}

	@Test
	public void tokenForAnotherAudienceIsRejected() throws Exception {
		String wrongAudience = sign(trustedKey, validClaims().audience("someone-elses-client-id").build());

		assertNull(processor.authenticate(requestWith(wrongAudience)));
	}

	@Test
	public void tokenForAnotherTenantIsRejected() throws Exception {
		String otherTenant = sign(trustedKey, validClaims().claim("custom:tenant-id", "tenant-b").build());

		assertNull(processor.authenticate(requestWith(otherTenant)));
	}

	@Test
	public void expiredTokenIsRejected() throws Exception {
		String expired = sign(trustedKey, validClaims()
				.expirationTime(new Date(System.currentTimeMillis() - 60_000))
				.build());

		assertNull(processor.authenticate(requestWith(expired)));
	}

	@Test
	public void accessTokenIsRejectedBecauseOnlyIdTokensCarryTenantClaims() throws Exception {
		String accessToken = sign(trustedKey, validClaims().claim("token_use", "access").build());

		assertNull(processor.authenticate(requestWith(accessToken)));
	}

	@Test
	public void tokenWithNoIssuerIsRejected() throws Exception {
		String noIssuer = sign(trustedKey, validClaims().issuer(null).build());

		assertNull(processor.authenticate(requestWith(noIssuer)));
	}

	@Test
	public void unparseableTokenIsRejectedWithoutThrowing() throws Exception {
		assertNull(processor.authenticate(requestWith("this-is-not-a-jwt")));
	}

	// --- fail closed when unconfigured --------------------------------------

	@Test
	public void requestIsRejectedWhenNoTrustedIssuerIsConfigured() throws Exception {
		JwtConfig unconfigured = new JwtConfig();
		processor.setJwtConfigurationForTesting(unconfigured);
		processor.setKeySourceForTesting(
				new ImmutableJWKSet<SecurityContext>(new JWKSet(trustedKey.toPublicJWK())));

		String valid = sign(trustedKey, validClaims().build());

		assertNull(processor.authenticate(requestWith(valid)));
	}

	// --- the legitimate path still works ------------------------------------

	@Test
	public void tokenFromTheTrustedPoolIsAccepted() throws Exception {
		String valid = sign(trustedKey, validClaims().build());

		Authentication authentication = processor.authenticate(requestWith(valid));

		assertNotNull(authentication);
		assertTrue(authentication.isAuthenticated());
		assertEquals("alice", ((org.springframework.security.core.userdetails.User)
				authentication.getPrincipal()).getUsername());
	}

	@Test
	public void aVerifiedTokenIsNotGrantedAdminByDefault() throws Exception {
		String valid = sign(trustedKey, validClaims().build());

		Authentication authentication = processor.authenticate(requestWith(valid));

		assertNotNull(authentication);
		for (GrantedAuthority authority : authentication.getAuthorities()) {
			assertTrue("no plain ROLE_ADMIN should be granted, got " + authority.getAuthority(),
					!"ROLE_ADMIN".equals(authority.getAuthority()));
		}
		assertTrue(authentication.getAuthorities().stream()
				.anyMatch(a -> "ROLE_TENANT_USER".equals(a.getAuthority())));
	}

	@Test
	public void groupMembershipBecomesAnAuthority() throws Exception {
		String valid = sign(trustedKey, validClaims()
				.claim("cognito:groups", java.util.Arrays.asList("tenant-admin"))
				.build());

		Authentication authentication = processor.authenticate(requestWith(valid));

		assertNotNull(authentication);
		assertTrue(authentication.getAuthorities().stream()
				.anyMatch(a -> "ROLE_TENANT_ADMIN".equals(a.getAuthority())));
	}

	@Test
	public void missingAuthorizationHeaderYieldsNoAuthentication() throws Exception {
		assertNull(processor.authenticate(new MockHttpServletRequest()));
	}
}
