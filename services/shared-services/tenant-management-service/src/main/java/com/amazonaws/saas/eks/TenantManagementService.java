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
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.math.*;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.saas.eks.dto.AuthConfig;
import com.amazonaws.saas.eks.dto.SaaSProviderMetadata;
import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.services.cloudformation.AmazonCloudFormation;
import com.amazonaws.services.cloudformation.AmazonCloudFormationClientBuilder;
import com.amazonaws.services.cloudformation.model.CreateStackRequest;
import com.amazonaws.services.cloudformation.model.Parameter;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.PutItemOutcome;
import com.amazonaws.services.dynamodbv2.document.Table;

public class TenantManagementService {

	private static final String SAAS_PROVIDER_METADATA = "SAAS_PROVIDER_METADATA";
	private static final String TENANT_ID = "TENANT_ID";
	private static final String EKSREFARCH_TENANTS = "EKSREFARCH_TENANTS";
	private static final Logger logger = LogManager.getLogger(TenantManagementService.class);

	/**
	 * This method creates a new tenant and stores the tenant details in a DynamodB
	 * table.
	 * 
	 * @param tenant
	 * @return
	 */
	protected TenantDetails createTenant(TenantDetails tenant) {
		String tenantId = "";
		String companyName = tenant.getCompanyName();

		if (companyName != null && companyName != "") {
			tenantId = getTenantId(companyName);
			tenant.setTenantId(tenantId);
		} else {
			logger.error("Company Name is empty or null");
			return null;
		}

		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);

		Table table = dynamoDB.getTable(EKSREFARCH_TENANTS);

		Item item = new Item().withPrimaryKey(TENANT_ID, tenant.getTenantId())
				.withString("PLAN", tenant.getPlan());

		PutItemOutcome outcome = table.putItem(item);
		logger.info("New tenant entry created in EKSREFARCH_TENANTS table!");

		return tenant;
	}

	private String getTenantId(String companyName) {
		Pattern pattern = Pattern.compile("[\\s\\W]");
		Matcher mat = pattern.matcher(companyName);
		String tenantId = mat.replaceAll("").toLowerCase();
    	return tenantId.substring(0, Math.min(tenantId.length(), 50));
	}

	public TenantDetails saveTenantDetails(TenantDetails tenant) { /* Read the name from command args */
		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);

		Table table = dynamoDB.getTable(EKSREFARCH_TENANTS);

		// Build the item
		Item item = new Item().withPrimaryKey(TENANT_ID, tenant.getTenantId());

		// Write the item to the table
		PutItemOutcome outcome = table.putItem(item);

		logger.info(
				"Tenant Registration Complete! Calling CodePipeline to provision tenant application's backend EKS services");

		return tenant;
	}

	/**
	 * Invokes the Code pipeline process that deploys the SaaS application's backend
	 * services in to the tenant's namespace.
	 * 
	 * @param tenant
	 * @return
	 */
	protected TenantDetails provisionTenantSaaSApplication(TenantDetails tenant) {

		String stackName = tenant.getTenantId();
		 SaaSProviderMetadata saaSProviderMetadata = getSaaSProviderMetadata(tenant);

		logger.info("StackName =>" + stackName);
		logger.info("S3 URL =>" + saaSProviderMetadata.getS3Endpoint());
		logger.info("ProductServiceEcrRepoUri =>" + saaSProviderMetadata.getProductServiceEcrRepoUri());
		logger.info("OrderServiceEcrRepoUri =>" + saaSProviderMetadata.getOrderServiceEcrRepoUri());

		AmazonCloudFormation client = AmazonCloudFormationClientBuilder.defaultClient();

		CreateStackRequest createRequest = new CreateStackRequest();
		createRequest.setStackName(stackName);
		createRequest.setTemplateURL(saaSProviderMetadata.getS3Endpoint());

		List<Parameter> parameters = new ArrayList<Parameter>();
		Parameter param = new Parameter();
		param.setParameterKey("TenantName");
		param.setParameterValue(tenant.getTenantId());
		parameters.add(param);

		Parameter customDomainParam = new Parameter();
		customDomainParam.setParameterKey("CustomDomain");
		customDomainParam.setParameterValue(tenant.getCustomDomain());
		parameters.add(customDomainParam);

		Parameter productServiceEcrRepoUriParam = new Parameter();
		productServiceEcrRepoUriParam.setParameterKey("ProductServiceEcrRepoUri");
		productServiceEcrRepoUriParam.setParameterValue(saaSProviderMetadata.getProductServiceEcrRepoUri());
		parameters.add(productServiceEcrRepoUriParam);

		Parameter orderServiceEcrRepoUriParam = new Parameter();
		orderServiceEcrRepoUriParam.setParameterKey("OrderServiceEcrRepoUri");
		orderServiceEcrRepoUriParam.setParameterValue(saaSProviderMetadata.getOrderServiceEcrRepoUri());
		parameters.add(orderServiceEcrRepoUriParam);

		createRequest.setParameters(parameters);

		List<String> capabilities = new ArrayList<String>();
		capabilities.add("CAPABILITY_IAM");
		createRequest.setCapabilities(capabilities);
		client.createStack(createRequest);
		logger.info("Creating a stack called " + createRequest.getStackName() + ".");

		return tenant;
	}

	private SaaSProviderMetadata getSaaSProviderMetadata(TenantDetails tenant) {

		String table_name = SAAS_PROVIDER_METADATA;
		String name = tenant.getCustomDomain();
		SaaSProviderMetadata metadata = new SaaSProviderMetadata();
		
		logger.info("Received CustomDomain=>" + tenant.getCustomDomain() + "for lookup.");

		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);
		Table table = dynamoDB.getTable(table_name);

		try {

			Item item = table.getItem("DOMAIN_NAME", name);
			metadata.setS3Endpoint((String) item.get("S3_ENDPOINT"));
			metadata.setProductServiceEcrRepoUri((String) item.get("PRODUCT_SERVICE_ECR"));
			metadata.setOrderServiceEcrRepoUri((String) item.get("ORDER_SERVICE_ECR"));
			
			logger.info("Printing item! ");
			logger.info(item.toJSONPretty());
		} catch (Exception e) {
			logger.error("GetItem failed.");
			logger.error(e.getMessage());
		}

		return metadata;
	}

	/**
	 * Method to retrieve the Tenant User pool configuration data.
	 * 
	 * @param tenantId
	 * @return 
	 */
	public AuthConfig auth(String tenantId) {
		logger.info("Received tenantId=>" + tenantId + "for lookup.");

		AuthConfig auth = new AuthConfig();
		String table_name = "EKSREFARCH_TENANTS";
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
			auth.setScope("phone email openid");
			auth.setUseSilentRefresh((Boolean) item.get("AUTH_USE_SR"));
			auth.setSilentRefreshTimeout((BigDecimal) item.get("AUTH_SR_TIMEOUT"));
			auth.setTimeoutFactor(0.25);
			auth.setSessionChecksEnabled((Boolean) item.get("AUTH_SESSION_CHECKS_ENABLED"));
			auth.setShowDebugInformation((Boolean) item.get("AUTH_SHOW_DEBUG_INFO"));
			auth.setClearHashAfterLogin((Boolean) item.get("AUTH_CLEAR_HASH_AFTER_LOGIN"));
			auth.setNonceStateSeparator("semicolon");

			logger.info("Printing AuthConfig after retrieving it....");
			logger.info(item.toJSONPretty());

		} catch (Exception e) {
			logger.error("GetItem failed during Auth Config values retrieval");
			logger.error(e.getMessage());
		}

		return auth;
	}
	
	public static void main(String args[]) {
		TenantManagementService service = new TenantManagementService();
		TenantDetails tenant = new TenantDetails();
		tenant.setCompanyName("r123123");
		tenant.setPlan("Basic");
		service.createTenant(tenant );
	}

}