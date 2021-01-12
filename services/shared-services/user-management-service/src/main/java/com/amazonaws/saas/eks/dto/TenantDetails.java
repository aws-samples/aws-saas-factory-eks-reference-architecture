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

public class TenantDetails implements Serializable {
	private static final long serialVersionUID = 1L;

	private String tenantId;
	private String customDomain;
	private String hostedZoneId;
	private String appCloudFrontId;
	private String userPoolId;
	private String appCloudFrontDomainName;
	private String authServer;
	private String clientId;
	private String redirectUrl;
	private String silentRefreshRedirectUri;
	private String email;
	private String password;
	private String companyName;
	private String region;
	private String cognitoDomain;

	public String getTenantId() {
		return tenantId;
	}

	public void setTenantId(String tenantId) {
		this.tenantId = tenantId;
	}

	public String getCustomDomain() {
		return customDomain;
	}

	public void setCustomDomain(String customDomain) {
		this.customDomain = customDomain;
	}

	public String getHostedZoneId() {
		return hostedZoneId;
	}

	public void setHostedZoneId(String hostedZoneId) {
		this.hostedZoneId = hostedZoneId;
	}

	public String getAppCloudFrontId() {
		return appCloudFrontId;
	}

	public void setAppCloudFrontId(String appCloudFrontId) {
		this.appCloudFrontId = appCloudFrontId;
	}

	public String getUserPoolId() {
		return userPoolId;
	}

	public void setUserPoolId(String userPoolId) {
		this.userPoolId = userPoolId;
	}

	public String getAppCloudFrontDomainName() {
		return appCloudFrontDomainName;
	}

	public void setAppCloudFrontDomainName(String appCloudFrontDomainName) {
		this.appCloudFrontDomainName = appCloudFrontDomainName;
	}

	public String getAuthServer() {
		return authServer;
	}

	public void setAuthServer(String authServer) {
		this.authServer = authServer;
	}

	public String getClientId() {
		return clientId;
	}

	public void setClientId(String clientId) {
		this.clientId = clientId;
	}

	public String getRedirectUrl() {
		return redirectUrl;
	}

	public void setRedirectUrl(String redirectUrl) {
		this.redirectUrl = redirectUrl;
	}

	public String getSilentRefreshRedirectUri() {
		return silentRefreshRedirectUri;
	}

	public void setSilentRefreshRedirectUri(String silentRefreshRedirectUri) {
		this.silentRefreshRedirectUri = silentRefreshRedirectUri;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public String getCompanyName() {
		return companyName;
	}

	public void setCompanyName(String companyName) {
		this.companyName = companyName;
	}

	public String getRegion() {
		return region;
	}

	public void setRegion(String region) {
		this.region = region;
	}

	public String getCognitoDomain() {
		return cognitoDomain;
	}

	public void setCognitoDomain(String cognitoDomain) {
		this.cognitoDomain = cognitoDomain;
	}

}
