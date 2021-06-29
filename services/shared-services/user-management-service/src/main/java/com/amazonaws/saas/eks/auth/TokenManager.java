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

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.amazonaws.saas.eks.dto.TenantUserDto;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

@Component
public class TokenManager {
	private static final Logger logger = LogManager.getLogger(TokenManager.class);
	private static final String CUSTOM_TENANT_ID = "custom:tenant-id";

	@Autowired
	private JwtConfig jwtConfiguration;

	private String getBearerToken(String token) {
		return token.startsWith("Bearer ") ? token.substring("Bearer ".length()) : token;
	}

	public TenantUserDto extractDataFromJwt(HttpServletRequest request) {
		TenantUserDto tenantUserDto = new TenantUserDto();
		String userPoolId = null;
		String tenantId = null;
		
		String idToken = request.getHeader(this.jwtConfiguration.getHttpHeader());

		if (idToken != null) {
			SignedJWT signedJWT = null;
			JWTClaimsSet claimsSet = null;
			
			try {
			    signedJWT = SignedJWT.parse(this.getBearerToken(idToken));
				claimsSet = signedJWT.getJWTClaimsSet();	
				
				tenantId = claimsSet.getStringClaim(CUSTOM_TENANT_ID);
				logger.info("tenantId: " + tenantId);
				tenantUserDto.setTenantId(tenantId);
			} catch (java.text.ParseException e) {
			    logger.error(e);
			}

			String issuer = claimsSet.getIssuer();
			logger.info("issuer: " + issuer);

			if(issuer!=null) {
				int c = issuer.lastIndexOf("/");
				userPoolId = issuer.substring(c+1);
				logger.info("userPoolId: " + userPoolId);

				tenantUserDto.setUserPoolId(userPoolId);
			}
		}
		return tenantUserDto;
	}

	
	public String extractUserPoolIdFromJwt(HttpServletRequest request) {
		String userPoolId = null;
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

			if(issuer!=null) {
				int c = issuer.lastIndexOf("/");
				userPoolId = issuer.substring(c+1);
			}
			logger.info("userPoolId: " + userPoolId);
		}
		return userPoolId;
	}
}