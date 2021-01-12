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
package com.amazonaws.saas.eks.util;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Random;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.Table;

public class EksSaaSUtil {
	private static final String TENANT = "Tenant";
	private static final Logger logger = LogManager.getLogger(EksSaaSUtil.class);
	private static final String SAAS_PROVIDER_METADATA = "SAAS_PROVIDER_METADATA";

	/**
	 * Generates a random string of length 10
	 * 
	 * @return String
	 */
	public static String randomStr() {

		int leftLimit = 97; // letter 'a'
		int rightLimit = 122; // letter 'z'
		int targetStringLength = 10;
		Random random = new Random();

		String generatedString = random.ints(leftLimit, rightLimit + 1).limit(targetStringLength)
				.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();

		logger.info("random generatedString=>" + generatedString);

		return generatedString;
	}

	/**
	 * Method used to get the User pool for a tenant based on company name
	 * 
	 * @param companyName
	 * @return String userPoolId
	 */
	public static String getUserPoolForTenant(String companyName) {
		String table_name = TENANT;
		logger.info("Received TENANTID=>" + companyName + "for lookup.");

		AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
		DynamoDB dynamoDB = new DynamoDB(client);
		Table table = dynamoDB.getTable(table_name);
		String authServer = "";
		String userPoolId = "";
		String region = "";

		try {
			Item item = table.getItem("TENANT_ID", companyName);
			authServer = (String) item.get("AUTH_SERVER");
			logger.info("authServer= " + authServer);

			userPoolId = authServer.substring(authServer.lastIndexOf("/") + 1);
			region = userPoolId.substring(0, userPoolId.indexOf("_"));
			logger.info("userPoolId= " + userPoolId);
			logger.info("region= " + region);

		} catch (Exception e) {
			logger.error("GetItem failed.");
			logger.error(e.getMessage());
		}

		return userPoolId;
	}

	/**
	 * Method used to get the User pool for a tenant based on origin
	 * 
	 * @param origin
	 * @return String userPoolId
	 */
	public static String getTenantUserPool(String origin) {
		logger.info("Origin name => " + origin);
		String userPoolId = null;

		if (origin != null) {
			try {
				logger.info("Host name => " + origin);
				URI uri = new URI(origin);
				String domain = uri.toString();
				String[] parts = domain.split("\\.");
				origin = parts[1] + "." + parts[2];
				logger.info("Origin for lookup => " + origin);
			} catch (URISyntaxException ex) {
				logger.error(ex.toString());
				return null;
			}

			AmazonDynamoDB client = AmazonDynamoDBClientBuilder.standard().build();
			DynamoDB dynamoDB = new DynamoDB(client);
			Table table = dynamoDB.getTable(SAAS_PROVIDER_METADATA);

			try {
				Item item = table.getItem("DOMAIN_NAME", origin);
				userPoolId = (String) item.get("PROVIDER_USER_POOL_ID");

				logger.info(item.toJSONPretty());
			} catch (Exception e) {
				logger.error("GetItem failed.");
				logger.error(e.getMessage());
			}
			logger.info("userPoolId= " + userPoolId);

		}

		return userPoolId;
	}
}
