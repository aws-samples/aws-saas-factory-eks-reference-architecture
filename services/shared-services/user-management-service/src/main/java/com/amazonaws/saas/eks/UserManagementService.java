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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.saas.eks.dto.TenantDetails;
import com.amazonaws.saas.eks.dto.User;
import com.amazonaws.saas.eks.util.EksSaaSUtil;
import com.amazonaws.saas.eks.util.LoggingManager;
import com.amazonaws.services.cloudfront.AmazonCloudFront;
import com.amazonaws.services.cloudfront.AmazonCloudFrontClientBuilder;
import com.amazonaws.services.cloudfront.model.Aliases;
import com.amazonaws.services.cloudfront.model.DistributionConfig;
import com.amazonaws.services.cloudfront.model.GetDistributionRequest;
import com.amazonaws.services.cloudfront.model.GetDistributionResult;
import com.amazonaws.services.cloudfront.model.UpdateDistributionRequest;
import com.amazonaws.services.cloudfront.model.UpdateDistributionResult;
import com.amazonaws.services.cognitoidp.AWSCognitoIdentityProvider;
import com.amazonaws.services.cognitoidp.AWSCognitoIdentityProviderClientBuilder;
import com.amazonaws.services.cognitoidp.model.AdminCreateUserConfigType;
import com.amazonaws.services.cognitoidp.model.AdminCreateUserRequest;
import com.amazonaws.services.cognitoidp.model.AdminCreateUserResult;
import com.amazonaws.services.cognitoidp.model.AdminInitiateAuthRequest;
import com.amazonaws.services.cognitoidp.model.AdminInitiateAuthResult;
import com.amazonaws.services.cognitoidp.model.AdminRespondToAuthChallengeRequest;
import com.amazonaws.services.cognitoidp.model.AdminRespondToAuthChallengeResult;
import com.amazonaws.services.cognitoidp.model.AttributeType;
import com.amazonaws.services.cognitoidp.model.AuthFlowType;
import com.amazonaws.services.cognitoidp.model.CreateUserPoolClientRequest;
import com.amazonaws.services.cognitoidp.model.CreateUserPoolClientResult;
import com.amazonaws.services.cognitoidp.model.CreateUserPoolDomainRequest;
import com.amazonaws.services.cognitoidp.model.CreateUserPoolRequest;
import com.amazonaws.services.cognitoidp.model.CreateUserPoolResult;
import com.amazonaws.services.cognitoidp.model.ListUsersRequest;
import com.amazonaws.services.cognitoidp.model.ListUsersResult;
import com.amazonaws.services.cognitoidp.model.SchemaAttributeType;
import com.amazonaws.services.cognitoidp.model.UserType;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.Table;
import com.amazonaws.services.dynamodbv2.document.UpdateItemOutcome;
import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec;
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap;
import com.amazonaws.services.dynamodbv2.model.ReturnValue;
import com.amazonaws.services.route53.AmazonRoute53;
import com.amazonaws.services.route53.AmazonRoute53ClientBuilder;
import com.amazonaws.services.route53.model.AliasTarget;
import com.amazonaws.services.route53.model.Change;
import com.amazonaws.services.route53.model.ChangeAction;
import com.amazonaws.services.route53.model.ChangeBatch;
import com.amazonaws.services.route53.model.ChangeResourceRecordSetsRequest;
import com.amazonaws.services.route53.model.ChangeResourceRecordSetsResult;
import com.amazonaws.services.route53.model.ResourceRecordSet;

public class UserManagementService {

	private static final Logger logger = LogManager.getLogger(UserManagementService.class);

	/**
	 * Creates a new recordset of type A in Route53 for the new tenant's custom
	 * domain
	 * 
	 * @param tenant
	 * @return
	 */
	private TenantDetails addRoute53Recordset(TenantDetails tenant) {
		String name = tenant.getTenantId() + "." + tenant.getCustomDomain();
		LoggingManager.logInfo(tenant.getTenantId(), "Recordset name=>" + name);

		AmazonRoute53 route53Client = AmazonRoute53ClientBuilder.defaultClient();
		List<Change> changes = new ArrayList<Change>();

		ResourceRecordSet resourceRecordSet = new ResourceRecordSet();
		resourceRecordSet.setName(name);
		resourceRecordSet.setType("A");

		AliasTarget aliasTarget = new AliasTarget();
		aliasTarget.setDNSName(tenant.getAppCloudFrontDomainName());
		aliasTarget.setEvaluateTargetHealth(false);
		aliasTarget.setHostedZoneId("Z2FDTNDATAQYW2"); // Fixed string for Cloudfront distributions!!!
		resourceRecordSet.setAliasTarget(aliasTarget);

		Change change = new Change(ChangeAction.UPSERT, resourceRecordSet);

		changes.add(change);
		ChangeBatch changeBatch = new ChangeBatch(changes);
		changeBatch.setComment(tenant.getTenantId() + "'s Alias for EKS Reference Architecture's tenant app");

		ChangeResourceRecordSetsRequest changeResourceRecordSetsRequest = new ChangeResourceRecordSetsRequest()
				.withHostedZoneId(tenant.getHostedZoneId()).withChangeBatch(changeBatch);

		ChangeResourceRecordSetsResult result = route53Client.changeResourceRecordSets(changeResourceRecordSetsRequest);

		LoggingManager.logInfo(tenant.getTenantId(), "Add Route 53 RecordSet successful.");

		// Return RedirectUri and SilentRefreshRedirectUri
		String redirectUrl = "https://" + tenant.getTenantId() + "." + tenant.getCustomDomain() + "/dashboard";
		LoggingManager.logInfo(tenant.getTenantId(), "redirectUrl=>" + redirectUrl);
		tenant.setRedirectUrl(redirectUrl);

		String silentRefreshRedirectUri = "https://" + tenant.getTenantId() + "." + tenant.getCustomDomain()
				+ "/silentrefresh";
		LoggingManager.logInfo(tenant.getTenantId(), "SilentRefreshRedirectUri=>" + silentRefreshRedirectUri);
		tenant.setSilentRefreshRedirectUri(silentRefreshRedirectUri);

		return tenant;
	}

	/**
	 * Adds the tenant's custom domain to the Cloudfront distribution config's
	 * aliases.
	 * 
	 * @param tenant
	 * @return
	 */
	private TenantDetails updateDistroConfig(TenantDetails tenant) {
		AmazonCloudFront amazonCloudFront = AmazonCloudFrontClientBuilder.defaultClient();

		UpdateDistributionRequest updateDistributionRequest = new UpdateDistributionRequest();

		GetDistributionResult distroInfo = getDistributionDetails(amazonCloudFront, tenant);

		LoggingManager.logInfo(tenant.getTenantId(), "CustomDomain:" + tenant.getCustomDomain());
		LoggingManager.logInfo(tenant.getTenantId(), "AppCloudFrontId:" + tenant.getAppCloudFrontId());
		LoggingManager.logInfo(tenant.getTenantId(), "Distro:" + distroInfo.toString());

		updateDistributionRequest.setId(tenant.getAppCloudFrontId());
		updateDistributionRequest.setIfMatch(distroInfo.getETag());

		DistributionConfig distributionConfig = distroInfo.getDistribution().getDistributionConfig();

		Aliases existingAliases = null;
		Aliases newAliases = new Aliases();

		if (distributionConfig != null) {
			existingAliases = distributionConfig.getAliases();

			List<String> items = new ArrayList<String>();
			for (String item : existingAliases.getItems()) {
				items.add(item);
			}
			items.add(tenant.getTenantId().toLowerCase() + "." + tenant.getCustomDomain());

			newAliases.setItems(items);
			newAliases.setQuantity(existingAliases.getQuantity() + 1);
		}

		distroInfo.getDistribution().getDistributionConfig().setAliases(newAliases);

		updateDistributionRequest.setDistributionConfig(distributionConfig);

		UpdateDistributionResult result = amazonCloudFront.updateDistribution(updateDistributionRequest);

		LoggingManager.logInfo(tenant.getTenantId(),
				"Updating Cloudfront Distribution successful for domain =>" + result.getDistribution().getDomainName());

		// Retrieve DomainName from the result and set it to tenant details.
		tenant.setAppCloudFrontDomainName(result.getDistribution().getDomainName());

		return tenant;
	}

	private GetDistributionResult getDistributionDetails(AmazonCloudFront amazonCloudFront, TenantDetails tenant) {

		GetDistributionRequest getDistributionRequest = new GetDistributionRequest();
		getDistributionRequest.setId(tenant.getAppCloudFrontId());
		return amazonCloudFront.getDistribution(getDistributionRequest);
	}

	/**
	 * Creates a new user in the specified user pool. Creates a temporary password
	 * initially, so an auth challenge is initiated in the flow.
	 * 
	 * @param tenant
	 * @return
	 */
	protected TenantDetails createUser(TenantDetails tenant) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		AdminCreateUserResult createUserResult = cognitoIdentityProvider
				.adminCreateUser(new AdminCreateUserRequest().withUserPoolId(tenant.getUserPoolId())
						.withUsername(tenant.getEmail()).withTemporaryPassword(tenant.getPassword())
						.withUserAttributes(new AttributeType().withName("email").withValue(tenant.getEmail()),
								new AttributeType().withName("email_verified").withValue("true"),
								new AttributeType().withName("custom:tenant-id").withValue(tenant.getTenantId())));

		UserType cognitoUser = createUserResult.getUser();
		LoggingManager.logInfo(tenant.getTenantId(), "Cognito - Create User Success=>" + cognitoUser.getUsername());

		// We created the user above, but the password is marked as temporary.
		// We need to set the password again. Initiate an auth challenge to get
		// started.

		Map<String, String> authParameters = new HashMap<String, String>();
		authParameters.put("USERNAME", tenant.getEmail());
		authParameters.put("PASSWORD", tenant.getPassword());

		AdminInitiateAuthRequest adminInitiateAuthRequest = new AdminInitiateAuthRequest()
				.withAuthFlow(AuthFlowType.ADMIN_USER_PASSWORD_AUTH).withAuthParameters(authParameters)
				.withClientId(tenant.getClientId()).withUserPoolId(tenant.getUserPoolId());

		AdminInitiateAuthResult adminInitiateAuthResult = cognitoIdentityProvider
				.adminInitiateAuth(adminInitiateAuthRequest);

		// We now have a proper challenge, set the password permanently.
		Map<String, String> challengeResponses = new HashMap<String, String>();
		challengeResponses.put("USERNAME", tenant.getEmail());
		challengeResponses.put("NEW_PASSWORD", tenant.getPassword());

		AdminRespondToAuthChallengeRequest adminRespondToAuthChallengeRequest = new AdminRespondToAuthChallengeRequest()
				.withChallengeName("NEW_PASSWORD_REQUIRED").withClientId(tenant.getClientId())
				.withUserPoolId(tenant.getUserPoolId()).withChallengeResponses(challengeResponses)
				.withSession(adminInitiateAuthResult.getSession());

		AdminRespondToAuthChallengeResult result = cognitoIdentityProvider
				.adminRespondToAuthChallenge(adminRespondToAuthChallengeRequest);

		return tenant;
	}

	/**
	 * Creates a new Amazon Cognito user pool.
	 * 
	 * @param tenant
	 * @return
	 */
	protected TenantDetails createUserPool(TenantDetails tenant) {

		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		CreateUserPoolRequest createUserPoolRequest = new CreateUserPoolRequest();

		createUserPoolRequest.setPoolName(tenant.getTenantId() + "-UserPool");

		AdminCreateUserConfigType adminCreateUserConfigType = new AdminCreateUserConfigType();
		adminCreateUserConfigType.setAllowAdminCreateUserOnly(true);
		createUserPoolRequest.setAdminCreateUserConfig(adminCreateUserConfigType);

		List<String> usernameAttributes = new ArrayList<String>();
		usernameAttributes.add("email");
		createUserPoolRequest.setUsernameAttributes(usernameAttributes);

		List<SchemaAttributeType> schema = new ArrayList<SchemaAttributeType>();
		SchemaAttributeType satEmail = new SchemaAttributeType();
		satEmail.setName("email");
		satEmail.setRequired(true);
		satEmail.setAttributeDataType("String");
		satEmail.setMutable(true);
		schema.add(satEmail);

		SchemaAttributeType satTenantId = new SchemaAttributeType();
		satTenantId.setName("tenant-id");
		satTenantId.setRequired(false);
		satTenantId.setAttributeDataType("String");
		satTenantId.setMutable(false);
		schema.add(satTenantId);

		SchemaAttributeType satMuttableAttr = new SchemaAttributeType();
		satMuttableAttr.setName("muttable-attr");
		satMuttableAttr.setRequired(false);
		satMuttableAttr.setAttributeDataType("String");
		satMuttableAttr.setMutable(false);
		schema.add(satMuttableAttr);

		createUserPoolRequest.setSchema(schema);

		CreateUserPoolResult result = cognitoIdentityProvider.createUserPool(createUserPoolRequest);
		String userPoolId = result.getUserPool().getId();
		String authServer = "https://cognito-idp." + selectedRegion + ".amazonaws.com/" + userPoolId;

		tenant.setUserPoolId(userPoolId);
		tenant.setAuthServer(authServer);

		LoggingManager.logInfo(tenant.getTenantId(), "Created user pool with id: " + userPoolId);
		LoggingManager.logInfo(tenant.getTenantId(), "Created Auth Server: " + authServer);
		LoggingManager.logInfo(tenant.getTenantId(), "Create User Pool Successful.");

		return tenant;

	}

	/**
	 * Creates a new domain for the user pool
	 * 
	 * @param tenant
	 * @return tenant
	 */
	protected TenantDetails createUserPoolDomain(TenantDetails tenant) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		CreateUserPoolDomainRequest createUserPoolDomainRequest = new CreateUserPoolDomainRequest();
		createUserPoolDomainRequest.setUserPoolId(tenant.getUserPoolId());
		createUserPoolDomainRequest.setDomain(tenant.getTenantId() + EksSaaSUtil.randomStr());

		cognitoIdentityProvider.createUserPoolDomain(createUserPoolDomainRequest);

		LoggingManager.logInfo(tenant.getTenantId(), "Create User Pool Domain Successful.");

		return tenant;
	}

	/**
	 * Creates the user pool client
	 * 
	 * @param tenant
	 * @return tenant
	 */
	protected TenantDetails createUserPoolClient(TenantDetails tenant) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		String url = "https://" + tenant.getTenantId() + "." + tenant.getCustomDomain();
		LoggingManager.logInfo(tenant.getTenantId(), "URL=>" + url);

		CreateUserPoolClientRequest createUserPoolClientRequest = new CreateUserPoolClientRequest();
		createUserPoolClientRequest.setClientName(tenant.getTenantId());
		createUserPoolClientRequest.setUserPoolId(tenant.getUserPoolId());

		createUserPoolClientRequest.setAllowedOAuthFlowsUserPoolClient(true);

		List<String> allowedOAuthFlows = new ArrayList<String>();
		allowedOAuthFlows.add("code");
		allowedOAuthFlows.add("implicit");
		createUserPoolClientRequest.setAllowedOAuthFlows(allowedOAuthFlows);

		List<String> allowedOAuthScopes = new ArrayList<String>();
		allowedOAuthScopes.add("phone");
		allowedOAuthScopes.add("email");
		allowedOAuthScopes.add("openid");
		createUserPoolClientRequest.setAllowedOAuthScopes(allowedOAuthScopes);

		List<String> callbackURLs = new ArrayList<String>();
		callbackURLs.add(url + "/dashboard");
		createUserPoolClientRequest.setCallbackURLs(callbackURLs);

		createUserPoolClientRequest.setDefaultRedirectURI(url + "/dashboard");

		List<String> explicitAuthFlows = new ArrayList<String>();
		explicitAuthFlows.add("ALLOW_ADMIN_USER_PASSWORD_AUTH");
		explicitAuthFlows.add("ALLOW_CUSTOM_AUTH");
		explicitAuthFlows.add("ALLOW_USER_SRP_AUTH");
		explicitAuthFlows.add("ALLOW_REFRESH_TOKEN_AUTH");
		createUserPoolClientRequest.setExplicitAuthFlows(explicitAuthFlows);

		createUserPoolClientRequest.setGenerateSecret(false);

		List<String> logoutURLs = new ArrayList<String>();
		logoutURLs.add(url + "/logoff");
		createUserPoolClientRequest.setLogoutURLs(logoutURLs);

		createUserPoolClientRequest.setPreventUserExistenceErrors("ENABLED");
		createUserPoolClientRequest.setRefreshTokenValidity(30);

		List<String> supportedIdentityProviders = new ArrayList<String>();
		supportedIdentityProviders.add("COGNITO");
		createUserPoolClientRequest.setSupportedIdentityProviders(supportedIdentityProviders);

		CreateUserPoolClientResult result = cognitoIdentityProvider.createUserPoolClient(createUserPoolClientRequest);

		LoggingManager.logInfo(tenant.getTenantId(), "Create User Pool Client Successful.");

		// Return ClientId back
		tenant.setClientId(result.getUserPoolClient().getClientId());

		return tenant;
	}

	/**
	 * Retrieve Cloudfront Distribution data from the provider metadata table using
	 * custom domain name.
	 * 
	 * @param tenant
	 * @return
	 */
	private TenantDetails getDistributionConfig(TenantDetails tenant) {

		String table_name = "SAAS_PROVIDER_METADATA";
		String name = tenant.getCustomDomain();

		LoggingManager.logInfo(tenant.getTenantId(),
				"Received CustomDomain=>" + tenant.getCustomDomain() + " for lookup.");

		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);
		Table table = dynamoDB.getTable(table_name);

		try {

			Item item = table.getItem("DOMAIN_NAME", name);
			LoggingManager.logInfo(tenant.getTenantId(), "Printing item after retrieving it....");
			LoggingManager.logInfo(tenant.getTenantId(), item.toJSONPretty());

			tenant.setHostedZoneId((String) item.get("HOSTED_ZONE_ID"));
			tenant.setAppCloudFrontId((String) item.get("APP_CLOUDFRONT_ID"));
		} catch (Exception e) {
			LoggingManager.logError(tenant.getTenantId(), "GetItem failed.");
			LoggingManager.logError(tenant.getTenantId(), e.getMessage());
		}

		return tenant;
	}

	/**
	 * Update Tenant table with user pool data
	 * 
	 * @param tenant
	 * @return
	 */
	private TenantDetails updateTenant(TenantDetails tenant) {
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

		Table table = dynamoDB.getTable("EKSREFARCH_TENANTS");

		UpdateItemSpec updateItemSpec = new UpdateItemSpec().withPrimaryKey("TENANT_ID", tenant.getTenantId())
				.withUpdateExpression(
						"set AUTH_SERVER = :p1, AUTH_CLIENT_ID=:p2, AUTH_REDIRECT_URI=:p3, AUTH_SR_REDIRECT_URI=:p4, AUTH_USE_SR=:p5, AUTH_SR_TIMEOUT=:p6, AUTH_TIMEOUT_FACTOR=:p7, AUTH_SESSION_CHECKS_ENABLED=:p8, AUTH_SHOW_DEBUG_INFO=:p9, AUTH_CLEAR_HASH_AFTER_LOGIN=:p10")
				.withValueMap(new ValueMap()
						.withString(":p1", tenant.getAuthServer())
						.withString(":p2", tenant.getClientId())
						.withString(":p3", tenant.getRedirectUrl())
						.withString(":p4", tenant.getSilentRefreshRedirectUri())
						.withBoolean(":p5", true)
						.withNumber(":p6", 5000)
						.withNumber(":p7", 0.25)
						.withBoolean(":p8", true)
						.withBoolean(":p9", true)
						.withBoolean(":p10", false))
				.withReturnValues(ReturnValue.UPDATED_NEW);

            try {
                logger.info("Updating the item...");
                UpdateItemOutcome outcome = table.updateItem(updateItemSpec);
                logger.info("UpdateItem succeeded: " + outcome.getItem().toJSONPretty());

            }
            catch (Exception e) {
                logger.error("Unable to update item: ");
                logger.error(e.getMessage());
            }
            
		logger.info(
				"Tenant Registration Complete! Calling CodePipeline to provision tenant application's backend EKS services");

		return tenant;
	}

	private String getTenantId(String companyName) {
		Pattern pattern = Pattern.compile("[\\s\\W]");
		Matcher mat = pattern.matcher(companyName);
		String tenantId = mat.replaceAll("").toLowerCase();
		return tenantId.substring(0, Math.min(tenantId.length(), 50));
	}

	private static String selectedRegion = "us-east-1";

	public TenantDetails register(TenantDetails tenant) {
		logger.info("User registration process begins");

		tenant = getDistributionConfig(tenant);
		tenant = updateDistroConfig(tenant);
		tenant = addRoute53Recordset(tenant);
		tenant = createUserPool(tenant);
		tenant = createUserPoolDomain(tenant);
		tenant = createUserPoolClient(tenant);
		tenant = createUser(tenant);
		tenant = updateTenant(tenant);

		return tenant;
	}

	public User createUser(String companyName, User user) {
		AWSCognitoIdentityProvider cognitoIdentityProvider = AWSCognitoIdentityProviderClientBuilder.defaultClient();
		
		String userPoolId = EksSaaSUtil.getUserPoolForTenant(companyName);
		
		AdminCreateUserResult createUserResult = cognitoIdentityProvider
				.adminCreateUser(new AdminCreateUserRequest().withUserPoolId(userPoolId)
						.withUsername(user.getEmail())
						.withUserAttributes(new AttributeType().withName("email").withValue(user.getEmail()),
								new AttributeType().withName("email_verified").withValue("true"),
								new AttributeType().withName("custom:tenant-id").withValue(companyName)));

		
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

	public User updateUser(User user) {
		return null;
	}

	public List<User> getUsers(String companyName) {
		List<User> users = new ArrayList<User>();
		AWSCognitoIdentityProvider cognitoclient = AWSCognitoIdentityProviderClientBuilder.defaultClient();

		try {
			String userPoolId = EksSaaSUtil.getUserPoolForTenant(companyName);
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

		} catch (Exception e) {
			logger.error(e);
		}
		return users;
	}

	public static void main(String args[]) {
		UserManagementService service = new UserManagementService();
		User user = new User();
		String email = "ranjithkraman@gmail.com";
		user.setEmail(email);
		TenantDetails tenant = new TenantDetails();
		tenant.setCompanyName("saasbeer1");
		tenant.setAuthServer("asdfasf");
		tenant.setClientId("sadfasdf");
		tenant.setRedirectUrl("asdfasdf");
		tenant.setSilentRefreshRedirectUri("sfasdf");
		
		//service.getUsers("test145co");
		//service.createUser("test145co", user);
		service.updateTenant(tenant );
		System.out.println("Done");
	}

}