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
package com.amazonaws.saas.eks.repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Resource;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.stereotype.Repository;

import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.saas.eks.model.Product;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapper;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBQueryExpression;
import com.amazonaws.services.dynamodbv2.datamodeling.PaginatedQueryList;
import com.amazonaws.services.dynamodbv2.model.AttributeValue;

@Repository
public class ProductRepository {
	private static final Logger logger = LogManager.getLogger(ProductRepository.class);

	/**
	 * Method to retrieve all products for a tenant
	 * 
	 * @param tenantId
	 * @return List<Product>
	 */
	public List<Product> getProducts(String tenantId) {
		PaginatedQueryList<Product> results = null;

		Map<String, String> expressionAttributeNames = new HashMap<String, String>();
		expressionAttributeNames.put("#TenantId", "TenantId");
		Map<String, AttributeValue> expressionAttributeValues = new HashMap<String, AttributeValue>();
		expressionAttributeValues.put(":TenantId", new AttributeValue().withS(tenantId));

		DynamoDBQueryExpression<Product> queryExpression = new DynamoDBQueryExpression<Product>()
				.withKeyConditionExpression("#TenantId = :TenantId")
				.withExpressionAttributeNames(expressionAttributeNames)
				.withExpressionAttributeValues(expressionAttributeValues);

		queryExpression.setConsistentRead(false);

		try {
			DynamoDBMapper mapper = dynamoDBMapper();
			results = mapper.query(Product.class, queryExpression);
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-Get Products failed " + e.getMessage());
		}

		return results;
	}

	/**
	 * Method to save a tenant product
	 * 
	 * @param product
	 * @return Product
	 */
	public Product save(Product product) {
		try {
			DynamoDBMapper mapper = dynamoDBMapper();
			mapper.save(product);
		} catch (Exception e) {
			logger.error(e);
			logger.error("TenantId: " + product.getTenantId() + "-Save Product failed " + e.getMessage());
		}

		return product;
	}

	/**
	 * Method to update a tenant product
	 * 
	 * @param product
	 * @return Product
	 */
	public Product update(Product product) {
		try {
			DynamoDBMapper mapper = dynamoDBMapper();
			DynamoDBMapperConfig dynamoDBMapperConfig = new DynamoDBMapperConfig.Builder()
					.withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT)
					.withSaveBehavior(DynamoDBMapperConfig.SaveBehavior.UPDATE).build();
			mapper.save(product, dynamoDBMapperConfig);
		} catch (Exception e) {
			logger.error("TenantId: " + product.getTenantId() + "-Update Product failed " + e.getMessage());
		}

		return product;
	}

	/**
	 * Method to get a tenant's product by productId
	 * 
	 * @param productId
	 * @return Product
	 */
	public Product getProductById(String productId, String tenantId) {
		DynamoDBMapperConfig config = DynamoDBMapperConfig.builder()
				.withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT).build();
		Product product = null;

		try {
			DynamoDBMapper mapper = dynamoDBMapper();
			product = mapper.load(Product.class, productId, config);
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-Get Product By Id failed " + e.getMessage());
		}

		logger.info("Product=> " + product);

		return product;
	}

	/**
	 * Method to delete a tenant's product
	 * 
	 * @param product
	 */
	public void delete(Product product) {
		try {
			DynamoDBMapper mapper = dynamoDBMapper();
			mapper.delete(product);
		} catch (Exception e) {
			logger.error("TenantId: " + product.getTenantId() + "-Delete Product failed " + e.getMessage());
		}
	}
	
	public DynamoDBMapper dynamoDBMapper() {
		DynamoDBMapperConfig dbMapperConfig = new DynamoDBMapperConfig.Builder().build();
		AmazonDynamoDBClient dynamoClient = getAmazonDynamoDBLocalClient();
		return new DynamoDBMapper(dynamoClient, dbMapperConfig);
	}

	private AmazonDynamoDBClient getAmazonDynamoDBLocalClient() {
		return (AmazonDynamoDBClient) AmazonDynamoDBClientBuilder.standard()
				.withCredentials(new DefaultAWSCredentialsProviderChain()).build();
	}

	
	public static void main(String args[]) {
		ProductRepository repo = new ProductRepository();
		Product product = new Product();
		product.setName("pen");
		product.setTenantId("saas1301local");
		//product.setProductId("asdfasdf");
		product.setPrice(100.00);
		repo.save(product );
		
	}

}