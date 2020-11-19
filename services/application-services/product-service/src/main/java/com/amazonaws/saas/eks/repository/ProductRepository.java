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

import com.amazonaws.saas.eks.model.Product;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapper;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapperConfig;
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBQueryExpression;
import com.amazonaws.services.dynamodbv2.datamodeling.PaginatedQueryList;
import com.amazonaws.services.dynamodbv2.model.AttributeValue;

@Repository
public class ProductRepository {
	private static final Logger logger = LogManager.getLogger(ProductRepository.class);

	@Resource(name = "dynamoDBMapper")
	DynamoDBMapper mapper;

	public List<Product> getProducts(String tenantId) {

		Map<String, String> expressionAttributeNames = new HashMap<String, String>();
		expressionAttributeNames.put("#TenantId", "TenantId");
		Map<String, AttributeValue> expressionAttributeValues = new HashMap<String, AttributeValue>();
		expressionAttributeValues.put(":TenantId", new AttributeValue().withS(tenantId));

		DynamoDBQueryExpression<Product> queryExpression = new DynamoDBQueryExpression<Product>()
				.withKeyConditionExpression("#TenantId = :TenantId").withIndexName("TenantId-index")
				.withExpressionAttributeNames(expressionAttributeNames)
				.withExpressionAttributeValues(expressionAttributeValues);

		queryExpression.setConsistentRead(false);

		PaginatedQueryList<Product> results = mapper.query(Product.class, queryExpression);

		return results;
	}

	public Product save(Product product) {
		try {
			mapper.save(product);

		} catch (Exception e) {
			logger.error(e.getMessage());
		}
		return product;

	}

	public Product update(Product product) {
		try {
			DynamoDBMapperConfig dynamoDBMapperConfig = new DynamoDBMapperConfig.Builder()
					  .withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT)
					  .withSaveBehavior(DynamoDBMapperConfig.SaveBehavior.UPDATE)
					  .build();
			mapper.save(product, dynamoDBMapperConfig);

		} catch (Exception e) {
			logger.error(e.getMessage());
		}
		return product;

	}

	public Product getProductById(String productId) {
		DynamoDBMapperConfig config = DynamoDBMapperConfig.builder()
				.withConsistentReads(DynamoDBMapperConfig.ConsistentReads.CONSISTENT).build();
		Product product = mapper.load(Product.class, productId, config);
		logger.info("Product=> " + product);

		return product;
	}

	public void delete(Product product) {
		try {
			mapper.delete(product);

		} catch (Exception e) {
			logger.error(e.getMessage());
		}
	}

}