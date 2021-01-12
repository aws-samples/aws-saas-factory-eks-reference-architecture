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

import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBAttribute;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBHashKey;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBTable;

@DynamoDBTable(tableName = "Tenant")
public class Tenant {

	private String tenantId;
	private Boolean authUseSr;
	private Double authTimeoutFactor;
	private Integer authSrTimeout;
	private String authSrRedirectUri;
	private Boolean showDebugInfo;
	private Boolean authSessionChecksEnabled;
	private String authServer;
	private String authRedirectUri;
	private String authClientId;
	private Boolean authClearHashAfterLogin;
	private String plan;

	@DynamoDBHashKey(attributeName = "TENANT_ID")
	public String getTenantId() {
		return tenantId;
	}

	public void setTenantId(String tenantId) {
		this.tenantId = tenantId;
	}

	@DynamoDBAttribute(attributeName = "AUTH_USE_SR")
	public Boolean getAuthUseSr() {
		return authUseSr;
	}

	public void setAuthUseSr(Boolean authUseSr) {
		this.authUseSr = authUseSr;
	}

	@DynamoDBAttribute(attributeName = "AUTH_TIMEOUT_FACTOR")
	public Double getAuthTimeoutFactor() {
		return authTimeoutFactor;
	}

	public void setAuthTimeoutFactor(Double authTimeoutFactor) {
		this.authTimeoutFactor = authTimeoutFactor;
	}

	@DynamoDBAttribute(attributeName = "AUTH_SR_TIMEOUT")
	public Integer getAuthSrTimeout() {
		return authSrTimeout;
	}

	public void setAuthSrTimeout(Integer authSrTimeout) {
		this.authSrTimeout = authSrTimeout;
	}

	@DynamoDBAttribute(attributeName = "AUTH_SR_REDIRECT_URI")
	public String getAuthSrRedirectUri() {
		return authSrRedirectUri;
	}

	public void setAuthSrRedirectUri(String authSrRedirectUri) {
		this.authSrRedirectUri = authSrRedirectUri;
	}

	@DynamoDBAttribute(attributeName = "AUTH_SHOW_DEBUG_INFO")
	public Boolean getShowDebugInfo() {
		return showDebugInfo;
	}

	public void setShowDebugInfo(Boolean showDebugInfo) {
		this.showDebugInfo = showDebugInfo;
	}

	@DynamoDBAttribute(attributeName = "AUTH_SESSION_CHECKS_ENABLED")
	public Boolean getAuthSessionChecksEnabled() {
		return authSessionChecksEnabled;
	}

	public void setAuthSessionChecksEnabled(Boolean authSessionChecksEnabled) {
		this.authSessionChecksEnabled = authSessionChecksEnabled;
	}

	@DynamoDBAttribute(attributeName = "AUTH_SERVER")
	public String getAuthServer() {
		return authServer;
	}

	public void setAuthServer(String authServer) {
		this.authServer = authServer;
	}

	@DynamoDBAttribute(attributeName = "AUTH_REDIRECT_URI")
	public String getAuthRedirectUri() {
		return authRedirectUri;
	}

	public void setAuthRedirectUri(String authRedirectUri) {
		this.authRedirectUri = authRedirectUri;
	}

	@DynamoDBAttribute(attributeName = "AUTH_CLIENT_ID")
	public String getAuthClientId() {
		return authClientId;
	}

	public void setAuthClientId(String authClientId) {
		this.authClientId = authClientId;
	}

	@DynamoDBAttribute(attributeName = "AUTH_CLEAR_HASH_AFTER_LOGIN")
	public Boolean getAuthClearHashAfterLogin() {
		return authClearHashAfterLogin;
	}

	public void setAuthClearHashAfterLogin(Boolean authClearHashAfterLogin) {
		this.authClearHashAfterLogin = authClearHashAfterLogin;
	}

	@DynamoDBAttribute(attributeName = "PLAN")
	public String getPlan() {
		return plan;
	}

	public void setPlan(String plan) {
		this.plan = plan;
	}

}