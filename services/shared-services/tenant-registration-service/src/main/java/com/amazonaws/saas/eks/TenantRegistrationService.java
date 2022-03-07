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
package com.amazonaws.saas.eks;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.util.LoggingManager;
import com.amazonaws.services.codebuild.AWSCodeBuildClientBuilder;
import com.amazonaws.services.codebuild.AWSCodeBuild;
import com.amazonaws.services.codebuild.model.StartBuildRequest;
import com.amazonaws.services.codebuild.model.EnvironmentVariable;

public class TenantRegistrationService {
	private static final Logger logger = LogManager.getLogger(TenantRegistrationService.class);

	public String registerTenant(TenantDetails tenant) {
		String tenantId = null;
		
		if (tenant != null) {
			String companyName = tenant.getCompanyName();

			if (companyName != null && companyName != "") {
				tenantId = generateTenantId(companyName);
				tenant.setTenantId(tenantId);
			} else {
				logger.error("Company Name is empty or null");
				return null;
			}

			AWSCodeBuild client = AWSCodeBuildClientBuilder.defaultClient();
			StartBuildRequest request = new StartBuildRequest();
			request.withEnvironmentVariablesOverride(
				new EnvironmentVariable().withName("TENANT_ID").withValue(tenant.getTenantId())
			).withEnvironmentVariablesOverride(
				new EnvironmentVariable().withName("COMPANY_NAME").withValue(tenant.getCompanyName())
			).withEnvironmentVariablesOverride(
				new EnvironmentVariable().withName("ADMIN_EMAIL").withValue(tenant.getEmail())
			).withEnvironmentVariablesOverride(
				new EnvironmentVariable().withName("PLAN").withValue(tenant.getPlan())
			).withProjectName("TenantOnboardingProject");
			LoggingManager.logInfo(tenant.getTenantId(), "starting cloud build project: TenantOnboardingProject");
			client.startBuild(request);
			LoggingManager.logInfo(tenant.getTenantId(), "Cloud build project stated: TenantOnboardingProject");
			
			LoggingManager.logInfo(tenantId, "Tenant registration success!");
			
			return tenantId;
		} else {
			logger.error("Error in tenant signup process. Please check the logs.");
		}
		
		return tenantId;
	}

	/**
	 * Helper method to generate Tenant Id from company name
	 * @param companyName
	 * @return String tenantId
	 */
	private String generateTenantId(String companyName) {
		Pattern pattern = Pattern.compile("[\\s\\W]");
		Matcher mat = pattern.matcher(companyName);
		String tenantId = mat.replaceAll("").toLowerCase();
		return tenantId.substring(0, Math.min(tenantId.length(), 50));
	}

}