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

import java.util.List;

import javax.servlet.http.HttpServletRequest;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.dto.User;


@RestController
public class UserManagementController {

    /**
     * Method to register a new tenant user by creating a Cognito user pool. This is called from the Tenant Registration Service
     * @param tenant
     * @return
     */
    @RequestMapping("/user/register")
    public TenantDetails userRegistration(@RequestBody TenantDetails tenant) {

    	UserManagementService userManagement = new UserManagementService();
		return userManagement.register(tenant);
    }
    
	/**
	 * Method to retrieve all users of a tenant.
	 * @param companyName
	 * @return
	 */
	@GetMapping(value = "{companyName}/users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public List<User> getUsers(@PathVariable("companyName") String companyName) {
    	UserManagementService userManagement = new UserManagementService();
    	
		return userManagement.getUsers(companyName);
    }

	/**
	 * Method to create a new user for a tenant.
	 * @param companyName
	 * @return
	 */
	@PostMapping(value = "{companyName}/users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public User createUser(@PathVariable("companyName") String companyName, @RequestBody User user) {
		
    	UserManagementService userManagement = new UserManagementService();
   		return userManagement.createUser(companyName, user);
    }
	
	/**
	 * Method to update a tenant user's data.
	 * @param companyName
	 * @return
	 */
	@PutMapping(value = "{companyName}/users/{userName}", produces = { MediaType.APPLICATION_JSON_VALUE })
    public void updateUser(@PathVariable("companyName") String companyName, @PathVariable("userName") String userName, @RequestBody UserStatusCheck status) {
		UserManagementService service = new UserManagementService();
    	
    	User user = new User();
    	user.setUserName(userName);
    	
    	if(status!= null && status.isEnabled()!=null) {
    	    service.updateUser(user, companyName, status.isEnabled().toString());
    	}    
    }

	/**
	 * Method to create a new SaaS provider's user. This will be accessed from the admin site.
	 * @param companyName
	 * @return
	 */	
	@PostMapping(value = "users", produces = { MediaType.APPLICATION_JSON_VALUE })
	public User createUser(@RequestBody ProviderUserEmail email, HttpServletRequest request) {
		UserManagementService service = new UserManagementService();
	    String origin = request.getHeader("origin");
	
		if(email!= null) {
			return service.createSaaSProviderUser(email.getEmail(), origin);
		}
	
		return null;
	}

	/**
	 * Method that will retrieve all the users of the SaaS provider. This will be accessed from the admin site.
	 * @param companyName
	 * @return
	 */		
	@GetMapping(value = "users", produces = { MediaType.APPLICATION_JSON_VALUE })
    public List<User> getUsers(HttpServletRequest request) {
		UserManagementService service = new UserManagementService();
        String origin = request.getHeader("origin");

    	return service.getSaaSProviderUsers(origin);
    }

    static class UserStatusCheck {
    	private Boolean enabled;

		public Boolean isEnabled() {
			return enabled;
		}

		public void setEnabled(Boolean enabled) {
			this.enabled = enabled;
		}
    	
    }

    static class ProviderUserEmail {
    	private String email;

		public String getEmail() {
			return email;
		}

		public void setEmail(String email) {
			this.email = email;
		}
    	
    }
}
