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

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "com.amazonaws.saas.eks")
public class JwtConfig {
	private String userPoolId;
	private String identityPoolId;
	private String jwkUrl;
	private String region;
	/**
	 * The one issuer this deployment trusts, e.g.
	 * https://cognito-idp.&lt;region&gt;.amazonaws.com/&lt;userPoolId&gt;.
	 * Supplied by configuration so it is never taken from the token itself.
	 */
	private String issuer;
	/** The app client id tokens must be addressed to (the `aud` claim). */
	private String audience;
	/** The tenant this deployment serves; tokens for other tenants are refused. */
	private String tenantId;
	private String userNameField = "cognito:username";
	private int connectionTimeout = 2000;
	private int readTimeout = 2000;
	private String httpHeader = "Authorization";

	public JwtConfig() {
	}

	public String getJwkUrl() {
		if (this.jwkUrl != null && !this.jwkUrl.isEmpty()) {
			return this.jwkUrl;
		}
		// Prefer the configured issuer: it is the value the token is pinned
		// against, so the keys must come from the same place.
		if (this.issuer != null && !this.issuer.isEmpty()) {
			return this.issuer.replaceAll("/+$", "") + "/.well-known/jwks.json";
		}
		return String.format("https://cognito-idp.%s.amazonaws.com/%s/.well-known/jwks.json", this.region,
				this.userPoolId);
	}

	/**
	 * The issuer this deployment trusts. Falls back to the value implied by
	 * region + userPoolId so an existing configuration keeps working.
	 */
	public String getIssuer() {
		if (this.issuer != null && !this.issuer.isEmpty()) {
			return this.issuer;
		}
		if (this.region != null && this.userPoolId != null) {
			return String.format("https://cognito-idp.%s.amazonaws.com/%s", this.region, this.userPoolId);
		}
		return null;
	}

	public void setIssuer(String issuer) {
		this.issuer = issuer;
	}

	public String getAudience() {
		return audience;
	}

	public void setAudience(String audience) {
		this.audience = audience;
	}

	public String getTenantId() {
		return tenantId;
	}

	public void setTenantId(String tenantId) {
		this.tenantId = tenantId;
	}

	public String getCognitoIdentityPoolUrl() {
		return String.format("https://cognito-idp.%s.amazonaws.com/%s", this.region, this.userPoolId);
	}

	public String getUserPoolId() {
		return userPoolId;
	}

	public void setUserPoolId(String userPoolId) {
		this.userPoolId = userPoolId;
	}

	public String getIdentityPoolId() {
		return identityPoolId;
	}

	public void setIdentityPoolId(String identityPoolId) {
		this.identityPoolId = identityPoolId;
	}

	public void setJwkUrl(String jwkUrl) {
		this.jwkUrl = jwkUrl;
	}

	public String getRegion() {
		return region;
	}

	public void setRegion(String region) {
		this.region = region;
	}

	public String getUserNameField() {
		return userNameField;
	}

	public void setUserNameField(String userNameField) {
		this.userNameField = userNameField;
	}

	public int getConnectionTimeout() {
		return connectionTimeout;
	}

	public void setConnectionTimeout(int connectionTimeout) {
		this.connectionTimeout = connectionTimeout;
	}

	public int getReadTimeout() {
		return readTimeout;
	}

	public void setReadTimeout(int readTimeout) {
		this.readTimeout = readTimeout;
	}

	public String getHttpHeader() {
		return httpHeader;
	}

	public void setHttpHeader(String httpHeader) {
		this.httpHeader = httpHeader;
	}
}