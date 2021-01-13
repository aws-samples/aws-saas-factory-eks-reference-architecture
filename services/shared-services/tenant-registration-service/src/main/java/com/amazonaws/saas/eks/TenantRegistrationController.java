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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.dto.TenantDetails;

@CrossOrigin(origins = "*", allowedHeaders = "*")
@RestController
public class TenantRegistrationController {
	private static final Logger logger = LogManager.getLogger(TenantRegistrationController.class);

	/**
	 * This method will on board new tenants in to the application
	 * 
	 * @param tenant
	 * @return String
	 */
	@RequestMapping("/register")
	public String registerTenant(@RequestBody TenantDetails tenant) {
		TenantRegistrationService register = new TenantRegistrationService();
		String tenantId = null;

		try {
			tenantId = register.registerTenant(tenant);
			
			if(tenantId != null) {
				logger.info("TenantId: " + tenantId + "- registration is now complete.");
				return "\"Tenant registration successful. Please check your email for next steps.\"";
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-registration failed: ", e);
		}

		return "\"Error in tenant signup process.\"";
	}

	/**
	 * Heartbeat method for the backend services
	 * 
	 * @return String
	 */
	@GetMapping("/amIUp")
	public String amIUp() {
		return "EKS SaaS Backend - I am up!!!";
	}

}
