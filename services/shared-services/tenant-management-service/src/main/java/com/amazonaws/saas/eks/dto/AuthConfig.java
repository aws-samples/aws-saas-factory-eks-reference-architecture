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
package com.amazonaws.saas.eks.dto;

import java.io.Serializable;
import java.math.BigDecimal;

public class AuthConfig implements Serializable {
	private static final long serialVersionUID = 1L;
	private String issuer;
	private Boolean strictDiscoveryDocumentValidation;
	private String clientId;
	private String responseType;
	private String redirectUri;
	private String silentRefreshRedirectUri;
	private String scope;
	private Boolean useSilentRefresh;
	private BigDecimal silentRefreshTimeout;
	private Double timeoutFactor;
	private Boolean sessionChecksEnabled;
	private Boolean showDebugInformation;
	private Boolean clearHashAfterLogin;
	private String nonceStateSeparator;
	private String cognitoDomain;

	public String getIssuer() {
		return issuer;
	}

	public void setIssuer(String issuer) {
		this.issuer = issuer;
	}

	public Boolean getStrictDiscoveryDocumentValidation() {
		return strictDiscoveryDocumentValidation;
	}

	public void setStrictDiscoveryDocumentValidation(Boolean strictDiscoveryDocumentValidation) {
		this.strictDiscoveryDocumentValidation = strictDiscoveryDocumentValidation;
	}

	public String getClientId() {
		return clientId;
	}

	public void setClientId(String clientId) {
		this.clientId = clientId;
	}

	public String getResponseType() {
		return responseType;
	}

	public void setResponseType(String responseType) {
		this.responseType = responseType;
	}

	public String getRedirectUri() {
		return redirectUri;
	}

	public void setRedirectUri(String redirectUri) {
		this.redirectUri = redirectUri;
	}

	public String getSilentRefreshRedirectUri() {
		return silentRefreshRedirectUri;
	}

	public void setSilentRefreshRedirectUri(String silentRefreshRedirectUri) {
		this.silentRefreshRedirectUri = silentRefreshRedirectUri;
	}

	public String getScope() {
		return scope;
	}

	public void setScope(String scope) {
		this.scope = scope;
	}

	public Boolean getUseSilentRefresh() {
		return useSilentRefresh;
	}

	public void setUseSilentRefresh(Boolean useSilentRefresh) {
		this.useSilentRefresh = useSilentRefresh;
	}

	public BigDecimal getSilentRefreshTimeout() {
		return silentRefreshTimeout;
	}

	public void setSilentRefreshTimeout(BigDecimal bigDecimal) {
		this.silentRefreshTimeout = bigDecimal;
	}

	public Double getTimeoutFactor() {
		return timeoutFactor;
	}

	public void setTimeoutFactor(Double timeoutFactor) {
		this.timeoutFactor = timeoutFactor;
	}

	public Boolean getSessionChecksEnabled() {
		return sessionChecksEnabled;
	}

	public void setSessionChecksEnabled(Boolean sessionChecksEnabled) {
		this.sessionChecksEnabled = sessionChecksEnabled;
	}

	public Boolean getShowDebugInformation() {
		return showDebugInformation;
	}

	public void setShowDebugInformation(Boolean showDebugInformation) {
		this.showDebugInformation = showDebugInformation;
	}

	public Boolean getClearHashAfterLogin() {
		return clearHashAfterLogin;
	}

	public void setClearHashAfterLogin(Boolean clearHashAfterLogin) {
		this.clearHashAfterLogin = clearHashAfterLogin;
	}

	public String getNonceStateSeparator() {
		return nonceStateSeparator;
	}

	public void setNonceStateSeparator(String nonceStateSeparator) {
		this.nonceStateSeparator = nonceStateSeparator;
	}

	public String getCognitoDomain() {
		return cognitoDomain;
	}

	public void setCognitoDomain(String cognitoDomain) {
		this.cognitoDomain = cognitoDomain;
	}

}
