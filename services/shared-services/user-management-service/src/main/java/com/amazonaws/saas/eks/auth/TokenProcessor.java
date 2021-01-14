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
import static java.util.List.of;

import java.net.URL;
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

import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSKeySelector;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jose.util.ResourceRetriever;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

@Component
public class TokenProcessor {
	private static final Logger logger = LogManager.getLogger(TokenProcessor.class);

	@Autowired
	private JwtConfig jwtConfiguration;

	@SuppressWarnings({ "rawtypes", "unchecked" })
	public Authentication authenticate(HttpServletRequest request) throws Exception {
		String idToken = request.getHeader(this.jwtConfiguration.getHttpHeader());

		if (idToken != null) {
			SignedJWT signedJWT = null;
			JWTClaimsSet claimsSet = null;
			
			try {
			    signedJWT = SignedJWT.parse(this.getBearerToken(idToken));
				claimsSet = signedJWT.getJWTClaimsSet();			
			} catch (java.text.ParseException e) {
			    logger.error(e);
			}

			String issuer = claimsSet.getIssuer();
			logger.info("issuer: " + issuer);

			String jwkUrl = issuer + "/.well-known/jwks.json";
			jwtConfiguration.setJwkUrl(jwkUrl);
			ResourceRetriever resourceRetriever = new DefaultResourceRetriever(jwtConfiguration.getConnectionTimeout(),
					jwtConfiguration.getReadTimeout());
			URL jwkSetURL = new URL(jwtConfiguration.getJwkUrl());

			JWKSource keySource = new RemoteJWKSet(jwkSetURL, resourceRetriever);
			ConfigurableJWTProcessor jwtProcessor = new DefaultJWTProcessor();
			JWSKeySelector keySelector = new JWSVerificationKeySelector(RS256, keySource);
			jwtProcessor.setJWSKeySelector(keySelector);

			JWTClaimsSet claims = jwtProcessor.process(this.getBearerToken(idToken), null);
			String username = getUserNameFrom(claims);

			if (username != null) {
				List<GrantedAuthority> grantedAuthorities = of(new SimpleGrantedAuthority("ROLE_ADMIN"));
				User user = new User(username, "", of());
				return new JwtAuth(user, claims, grantedAuthorities);
			}
		}
		return null;
	}

	private String getUserNameFrom(JWTClaimsSet claims) {
		return claims.getClaims().get(this.jwtConfiguration.getUserNameField()).toString();
	}

	private String getBearerToken(String token) {
		return token.startsWith("Bearer ") ? token.substring("Bearer ".length()) : token;
	}
}