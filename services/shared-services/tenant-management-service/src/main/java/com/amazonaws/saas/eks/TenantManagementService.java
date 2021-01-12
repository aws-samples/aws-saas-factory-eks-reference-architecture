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

import java.math.BigDecimal;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.saas.eks.dto.AuthConfig;
import com.amazonaws.saas.eks.dto.Tenant;
import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.util.LoggingManager;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapper;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBScanExpression;
import com.amazonaws.services.dynamodbv2.datamodeling.PaginatedScanList;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig.TableNameOverride;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.PutItemOutcome;
import com.amazonaws.services.dynamodbv2.document.Table;

public class TenantManagementService {
	private static final String TENANT_ID = "TENANT_ID";
	private static final String TENANT = "Tenant";
	private static final Logger logger = LogManager.getLogger(TenantManagementService.class);

	/**
	 * This method creates a new tenant and stores the tenant details in a DynamodB
	 * table.
	 * 
	 * @param tenant
	 * @return TenantDetails
	 */
	protected TenantDetails createTenant(TenantDetails tenant) {
		String tenantId = "";
		String companyName = tenant.getCompanyName();

		if (companyName != null && companyName != "") {
			tenantId = generateTenantId(companyName);
			tenant.setTenantId(tenantId);
		} else {
			logger.error("Company Name is empty or null");
			return null;
		}

		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);
		Table table = dynamoDB.getTable(TENANT);
		String plan = tenant.getPlan();

		if (plan == null || plan == "") {
			plan = "";
		}
		Item item = new Item().withPrimaryKey(TENANT_ID, tenant.getTenantId()).withString("PLAN", plan);

		PutItemOutcome outcome = table.putItem(item);
		LoggingManager.logInfo(tenant.getTenantId(), "New tenant entry created in Tenant table!");

		return tenant;
	}

	/**
	 * Retrieve tenants as a List
	 * 
	 * @return List<Tenant>
	 */
	public List<Tenant> getTenants() {
		DynamoDBMapper mapper = dynamoDBMapper();
		PaginatedScanList<Tenant> tenants = mapper.scan(Tenant.class, new DynamoDBScanExpression());

		return tenants;
	}

	/**
	 * Method to Update Tenant data
	 * 
	 * @return Tenant
	 */
	public Tenant updateTenant(Tenant tenant) {
		try {
			DynamoDBMapper mapper = dynamoDBMapper();

			DynamoDBMapperConfig dynamoDBMapperConfig = new DynamoDBMapperConfig.Builder()
					.withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT)
					.withSaveBehavior(DynamoDBMapperConfig.SaveBehavior.UPDATE).build();
			mapper.save(tenant, dynamoDBMapperConfig);

		} catch (Exception e) {
			logger.error(e.getMessage());
		}

		return tenant;
	}

	/**
	 * Method to save Tenant Details in to the Tenant table
	 * 
	 * @param tenant
	 * @return TenantDetails
	 */
	public TenantDetails saveTenantDetails(TenantDetails tenant) {
		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);

		Table table = dynamoDB.getTable(TENANT);
		Item item = new Item().withPrimaryKey(TENANT_ID, tenant.getTenantId());
		PutItemOutcome outcome = table.putItem(item);

		logger.info(
				"Tenant Registration Complete! Calling CodePipeline to provision tenant application's backend EKS services");

		return tenant;
	}

	/**
	 * Method to retrieve the Tenant User pool configuration data.
	 * 
	 * @param tenantId
	 * @return AuthConfig
	 */
	public AuthConfig auth(String tenantId) {
		logger.info("Received tenantId=>" + tenantId + "for lookup.");

		AuthConfig auth = new AuthConfig();
		String table_name = TENANT;
		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);
		Table table = dynamoDB.getTable(table_name);

		try {
			Item item = table.getItem("TENANT_ID", tenantId);

			auth.setIssuer((String) item.get("AUTH_SERVER"));
			auth.setStrictDiscoveryDocumentValidation(false);
			auth.setClientId((String) item.get("AUTH_CLIENT_ID"));
			auth.setResponseType("code");
			auth.setRedirectUri((String) item.get("AUTH_REDIRECT_URI"));
			auth.setSilentRefreshRedirectUri((String) item.get("AUTH_REDIRECT_URI") + "/silentrefresh.html");
			auth.setScope("phone email openid profile");
			auth.setUseSilentRefresh((Boolean) item.get("AUTH_USE_SR"));
			auth.setSilentRefreshTimeout((BigDecimal) item.get("AUTH_SR_TIMEOUT"));
			auth.setTimeoutFactor(0.25);
			auth.setSessionChecksEnabled((Boolean) item.get("AUTH_SESSION_CHECKS_ENABLED"));
			auth.setShowDebugInformation((Boolean) item.get("AUTH_SHOW_DEBUG_INFO"));
			auth.setClearHashAfterLogin((Boolean) item.get("AUTH_CLEAR_HASH_AFTER_LOGIN"));
			auth.setNonceStateSeparator("semicolon");
			auth.setCognitoDomain((String) item.get("COGNITO_DOMAIN"));

			logger.info("Printing AuthConfig after retrieving it....");
			logger.info(item.toJSONPretty());

		} catch (Exception e) {
			logger.error("GetItem failed during Auth Config values retrieval");
			logger.error(e.getMessage());
		}

		return auth;
	}

	/**
	 * Method used to Update tenant data in to Tenant Dynamo table
	 * 
	 * @return DynamoDBMapper
	 */
	public DynamoDBMapper dynamoDBMapper() {
		DynamoDBMapperConfig dbMapperConfig = new DynamoDBMapperConfig.Builder()
				.withTableNameOverride(TableNameOverride.withTableNameReplacement(TENANT)).build();

		AmazonDynamoDBClient dynamoClient = getAmazonDynamoDBLocalClient();
		return new DynamoDBMapper(dynamoClient, dbMapperConfig);
	}

	/**
	 * method to return the AmazonDynamoDBClient with credentials
	 * @return AmazonDynamoDBClient
	 */
	private AmazonDynamoDBClient getAmazonDynamoDBLocalClient() {
		return (AmazonDynamoDBClient) AmazonDynamoDBClientBuilder.standard()
				.withCredentials(new DefaultAWSCredentialsProviderChain()).build();
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