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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.saas.eks.dto.AuthConfig;
import com.amazonaws.saas.eks.dto.Tenant;
import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.dto.User;
import com.amazonaws.saas.eks.util.LoggingManager;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapper;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig.TableNameOverride;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBScanExpression;
import com.amazonaws.services.dynamodbv2.datamodeling.PaginatedScanList;

public class TenantRegistrationService {

	private static final Logger logger = LogManager.getLogger(TenantRegistrationService.class);
	private static final String EKSREFARCH_TENANTS = "EKSREFARCH_TENANTS";

	public String registerTenant(TenantDetails tenant) {

		if (tenant != null) {
			tenant = createTenant(tenant);
			tenant = createUser(tenant);
			tenant = provisionSaaSAppService(tenant);

			LoggingManager.logInfo(tenant.getTenantId(), "Tenant registration success!");
			return "\"Tenant registration success.\"";

		} else {
			logger.error("Error in tenant signup process. Please check the logs.");
		}
		return "\"Error in tenant signup process. Please check the logs.\"";

	}

	/**
	 * Method that invokes the user management microservice to create the user
	 * identity in Cognito.
	 * 
	 * @param tenant
	 * @return
	 */
	private TenantDetails createUser(TenantDetails tenant) {
		RestTemplate restTemplate = new RestTemplate();
		 String userManagementServiceUrl = "http://localhost:8001/user/register";
		//String userManagementServiceUrl = "http://user-management-service/user/register";

		logger.info("Calling User Management Service for user and user pool creation");

		ResponseEntity<TenantDetails> response = restTemplate.postForEntity(userManagementServiceUrl, tenant,
				TenantDetails.class);

		if (response != null) {
			logger.info("User and user pool created with ID=>" + response.getBody().getUserPoolId());
			return response.getBody();
		}
		return null;
	}

	/**
	 * Invokes the microservice that creates the new tenant.
	 * 
	 * @param tenant
	 * @return tenant
	 */
	private TenantDetails createTenant(TenantDetails tenant) {
		RestTemplate restTemplate = new RestTemplate();
		 String tenantManagementServiceUrl = "http://localhost:8002/tenant/create";
		//String tenantManagementServiceUrl = "http://tenant-management-service/tenant/create";

		ResponseEntity<TenantDetails> response = restTemplate.postForEntity(tenantManagementServiceUrl, tenant,
				TenantDetails.class);

		if (response != null)
			logger.info("Tenant registration process is complete and a new tenant has been successfully created. =>"
					+ response.getBody().toString());
		else
			logger.error("Tenant registration process failure. Please check logs");

		return response.getBody();
	}

	/**
	 * Triggers the pipeline that will provision the SaaS application services for
	 * every new tenant.
	 * 
	 * @param tenant
	 * @return tenant
	 */
	private TenantDetails provisionSaaSAppService(TenantDetails tenant) {
		RestTemplate restTemplate = new RestTemplate();
		 String tenantManagementServiceUrl = "http://localhost:8002/tenant/provision";
		//String tenantManagementServiceUrl = "http://tenant-management-service/tenant/provision";

		ResponseEntity<TenantDetails> response = restTemplate.postForEntity(tenantManagementServiceUrl, tenant,
				TenantDetails.class);

		if (response != null)
			logger.info("Tenant provisioning pipeline triggered =>" + response.getBody().toString());
		else
			logger.error("Failure during tenant provisioning");

		return response.getBody();
	}

	/**
	 * Method to retrieve the Tenant User pool configuration data.
	 * 
	 * @param tenantId
	 * @return 
	 */
	public AuthConfig auth(String tenantId) {
		RestTemplate restTemplate = new RestTemplate();
		String tenantManagementServiceUrl = "http://localhost:8002/tenant/auth/{tenantId}";
		//String tenantManagementServiceUrl = "http://tenant-management-service/tenant/auth/{tenantId}";

		ResponseEntity<AuthConfig> response = restTemplate.getForEntity(tenantManagementServiceUrl, AuthConfig.class,
				tenantId);

		if (response != null)
			logger.info("Received auth config details=>" + response.getBody().toString());
		else
			logger.error("Failure during auth config fetch");

		logger.info(response.getBody().toString());
		return response.getBody();
	}

	public List<Tenant> getTenants() {
		DynamoDBMapper mapper = dynamoDBMapper();
		PaginatedScanList<Tenant> tenants = mapper.scan(Tenant.class, new DynamoDBScanExpression());

		return tenants;
	}
	
	public DynamoDBMapper dynamoDBMapper() {
		DynamoDBMapperConfig dbMapperConfig = new DynamoDBMapperConfig.Builder()
				.withTableNameOverride(TableNameOverride.withTableNameReplacement(EKSREFARCH_TENANTS))
				.build();
		
		AmazonDynamoDBClient dynamoClient = getAmazonDynamoDBLocalClient();
		return new DynamoDBMapper(dynamoClient, dbMapperConfig);
	}

	private AmazonDynamoDBClient getAmazonDynamoDBLocalClient() {
		return (AmazonDynamoDBClient) AmazonDynamoDBClientBuilder.standard()
				.withCredentials(new DefaultAWSCredentialsProviderChain())
				.build();
	}

	
	public static void main(String args[]) {
		TenantRegistrationService service = new TenantRegistrationService();
		service.getTenants();
	}

	public Tenant updateTenant(Tenant tenant) {
		try {
			DynamoDBMapper mapper = dynamoDBMapper();

			DynamoDBMapperConfig dynamoDBMapperConfig = new DynamoDBMapperConfig.Builder()
					  .withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT)
					  .withSaveBehavior(DynamoDBMapperConfig.SaveBehavior.UPDATE)
					  .build();
			mapper.save(tenant, dynamoDBMapperConfig);

		} catch (Exception e) {
			logger.error(e.getMessage());
		}
		return tenant;

	}

	public User createUser(User user, String companyName) {
		String userEmail = user.getEmail();
		RestTemplate restTemplate = new RestTemplate();
		String userManagementServiceUrl = "http://localhost:8001/"+companyName+"/users?email="+userEmail;
		//String userManagementServiceUrl = "http://user-management-service/"+companyName+"/users?email="+userEmail;

		logger.info("Calling User Management Service to create a tenant user");

		ResponseEntity<User> response = restTemplate.postForEntity(userManagementServiceUrl, user, User.class);

		if (response != null) {
			logger.info("Tenant user created");
			return response.getBody();
		}
		return null;
	}
	
	public User[] getUsers(String companyName) {
		RestTemplate restTemplate = new RestTemplate();
		String userManagementServiceUrl = "http://localhost:8001/"+companyName+"/users";
		//String userManagementServiceUrl = "http://user-management-service/"+companyName+"/users";

		logger.info("Calling User Management Service for retrieving tenant users");

		ResponseEntity<User[]> response = restTemplate.getForEntity(userManagementServiceUrl, User[].class);

		if (response != null) {
			logger.info("Tenant users retrieved");
			return response.getBody();
		}
		return null;
	}

	public void updateUser(User user, String companyName, String status) {
		String userEmail = user.getEmail();
		RestTemplate restTemplate = new RestTemplate();
		String userManagementServiceUrl = "http://localhost:8001/"+companyName+"/users?email="+userEmail+",status="+status ;
		//String userManagementServiceUrl = "http://user-management-service/"+companyName+"/users?email="+userEmail+",status="+status ;

		logger.info("Calling User Management Service to update a tenant user");

		restTemplate.put(userManagementServiceUrl, user, User.class);
		
		logger.info("Tenant user updated");

	}
}