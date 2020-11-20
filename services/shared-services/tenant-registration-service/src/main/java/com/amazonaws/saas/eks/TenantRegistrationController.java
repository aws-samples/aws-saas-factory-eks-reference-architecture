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

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.dto.AuthConfig;
import com.amazonaws.saas.eks.dto.Tenant;
import com.amazonaws.saas.eks.dto.TenantDetails;

@CrossOrigin(origins = "*", allowedHeaders = "*")
@RestController
public class TenantRegistrationController {
	private static final Logger logger = LogManager.getLogger(TenantRegistrationController.class);

    @RequestMapping("/register")
    public String registerTenant(@RequestBody TenantDetails tenant) {
 
    	TenantRegistrationService register = new TenantRegistrationService();
		String result = register.registerTenant(tenant);

		return result;
    }
  
    @GetMapping(value = "tenants", produces = { MediaType.APPLICATION_JSON_VALUE })
    public List<Tenant> getTenants() {
 
    	TenantRegistrationService register = new TenantRegistrationService();
		return register.getTenants();
    }

	@PutMapping(value = "tenant", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Tenant updateTenant(Tenant tenant) {
    	TenantRegistrationService updateTenant = new TenantRegistrationService();
    	
		return updateTenant.updateTenant(tenant);
	}

    @RequestMapping(path="/auth", method=RequestMethod.GET)
    public AuthConfig auth(HttpServletRequest request) {
 
    	String tenantId = "";
    	AuthConfig result = null;
    	
    	String origin = request.getHeader("origin");
    	logger.info("Origin name => "+ origin);
        
    	if (origin == null || origin.equals("http://localhost:4200")) {
            //TODO this is test code and should be deleted unless we create a test tenant with every install
            origin = "http://testcompany4.foo.com";
    	}

    	try {
    		logger.info("Host name => "+ origin);
            URI uri = new URI(origin);
            String domain = uri.getHost();
            String[] parts = domain.split("\\.");
            tenantId = parts[0];
            logger.info("Tenant Id => "+ tenantId);

        	TenantRegistrationService register = new TenantRegistrationService();
            result = register.auth(tenantId);
    	}
    	catch(URISyntaxException ex) { 
    		logger.error(ex.toString());
    	}
    	return result;
    }
    
    @RequestMapping("/amIUp")
    public String amIUp() {
        return "EKS SaaS Backend - I am up!!!";
    }

}
