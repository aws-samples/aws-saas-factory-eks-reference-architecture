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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.saas.eks.dto.TenantUserDto;
import com.amazonaws.saas.eks.dto.User;
import com.amazonaws.services.cognitoidp.AWSCognitoIdentityProvider;
import com.amazonaws.services.cognitoidp.AWSCognitoIdentityProviderClientBuilder;
import com.amazonaws.services.cognitoidp.model.AdminCreateUserRequest;
import com.amazonaws.services.cognitoidp.model.AdminCreateUserResult;
import com.amazonaws.services.cognitoidp.model.AdminDisableUserRequest;
import com.amazonaws.services.cognitoidp.model.AdminDisableUserResult;
import com.amazonaws.services.cognitoidp.model.AdminEnableUserRequest;
import com.amazonaws.services.cognitoidp.model.AdminEnableUserResult;
import com.amazonaws.services.cognitoidp.model.AttributeType;
import com.amazonaws.services.cognitoidp.model.ListUsersRequest;
import com.amazonaws.services.cognitoidp.model.ListUsersResult;
import com.amazonaws.services.cognitoidp.model.UserType;

public class UserManagementService {
	private static final Logger logger = LogManager.getLogger(UserManagementService.class);

	/**
	 * Method to create a new user for the tenant
	 * 
	 * @param userPoolId
	 * @param user
	 * @return User
	 */
	public User createUser(TenantUserDto tenantUserDto, User user) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		AdminCreateUserResult createUserResult = null;
		
		if(tenantUserDto!=null && tenantUserDto.getTenantId()!=null) {
			createUserResult = cognitoIdentityProvider.adminCreateUser(new AdminCreateUserRequest()
					.withUserPoolId(tenantUserDto.getUserPoolId()).withUsername(user.getEmail())
					.withUserAttributes(new AttributeType().withName("email").withValue(user.getEmail()),
							new AttributeType().withName("email_verified").withValue("true"),
							new AttributeType().withName("custom:tenant-id").withValue(tenantUserDto.getTenantId())));			
		} else {
			createUserResult = cognitoIdentityProvider.adminCreateUser(new AdminCreateUserRequest()
					.withUserPoolId(tenantUserDto.getUserPoolId()).withUsername(user.getEmail())
					.withUserAttributes(new AttributeType().withName("email").withValue(user.getEmail()),
							new AttributeType().withName("email_verified").withValue("true")));						
		}

		
		UserType cognitoUser = createUserResult.getUser();
		logger.info("Cognito - Create User Success=>" + cognitoUser.getUsername());

		user.setCreated(cognitoUser.getUserCreateDate().toString());
		user.setModified(cognitoUser.getUserLastModifiedDate().toString());
		user.setEnabled(cognitoUser.getEnabled());
		user.setStatus(cognitoUser.getUserStatus());

		for (AttributeType userAttribute : cognitoUser.getAttributes()) {
			switch (userAttribute.getName()) {
			case "email":
				user.setEmail(userAttribute.getValue());
				break;
			case "email_verified":
				user.setVerified(userAttribute.getValue());
				break;
			}
		}

		return user;
	}

	/**
	 * Method to enable or disable tenant user
	 * 
	 * @param user
	 * @param userPoolId
	 * @param status
	 */
	public void updateUser(User user, String userPoolId, String status) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		if (!Boolean.getBoolean(status)) {
			AdminDisableUserRequest adminDisableUserRequest = new AdminDisableUserRequest();
			adminDisableUserRequest.setUsername(user.getUserName());
			adminDisableUserRequest.setUserPoolId(userPoolId);

			AdminDisableUserResult result = cognitoIdentityProvider.adminDisableUser(adminDisableUserRequest);

		} else {
			AdminEnableUserRequest adminEnableUserRequest = new AdminEnableUserRequest();
			adminEnableUserRequest.setUsername(user.getUserName());
			adminEnableUserRequest.setUserPoolId(userPoolId);

			AdminEnableUserResult result = cognitoIdentityProvider.adminEnableUser(adminEnableUserRequest);
		}
	}

	/**
	 * Method to retrieve all the users for a single tenant
	 * 
	 * @param userPoolId
	 * @return List<User>
	 */
	public List<User> getUsers(String userPoolId) {
		List<User> users = new ArrayList<User>();
		AWSCognitoIdentityProvider cognitoclient = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		try {
			if (userPoolId != null) {
				ListUsersResult response = cognitoclient.listUsers(new ListUsersRequest().withUserPoolId(userPoolId));

				for (UserType userType : response.getUsers()) {
					User u = new User();

					for (AttributeType userAttribute : userType.getAttributes()) {
						switch (userAttribute.getName()) {
						case "email":
							u.setEmail(userAttribute.getValue());
							break;
						case "email_verified":
							u.setVerified(userAttribute.getValue());
							break;
						}
					}

					u.setCreated(userType.getUserCreateDate().toString());
					u.setModified(userType.getUserLastModifiedDate().toString());
					u.setEnabled(userType.getEnabled());
					u.setStatus(userType.getUserStatus());
					users.add(u);
				}
			}
		} catch (Exception e) {
			logger.error(e);
		}

		return users;
	}
}