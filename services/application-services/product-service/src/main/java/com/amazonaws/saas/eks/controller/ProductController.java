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
package com.amazonaws.saas.eks.controller;

import java.util.List;

import javax.servlet.http.HttpServletRequest;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.auth.TokenManager;
import com.amazonaws.saas.eks.model.Product;
import com.amazonaws.saas.eks.service.ProductService;

@CrossOrigin(origins = "*", allowedHeaders = "*")
@RestController
public class ProductController {
	private static final Logger logger = LogManager.getLogger(ProductController.class);

	@Autowired
	private ProductService productService;

	@Autowired
	private TokenManager tokenManager;

	/**
	 * Method to retrieve all products for a tenant.
	 * 
	 * @param request
	 * @return List<Product>
	 */
	@GetMapping(value = "{companyName}/product/api/products", produces = { MediaType.APPLICATION_JSON_VALUE })
	public List<Product> getProducts(HttpServletRequest request) {
		String tenantId = null;
		List<Product> products = null;

		try {
			tenantId = tokenManager.getTenantId(request);

			if (tenantId != null && !tenantId.isEmpty()) {
				products = productService.getProducts(tenantId);
				return products;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-get products failed: ", e);
			return null;
		}

		return products;
	}

	/**
	 * Method that retrieves a tenant product by productId.
	 * 
	 * @param productId
	 * @param request
	 * @return Product
	 */
	@GetMapping(value = "{companyName}/product/api/product/{productId}", produces = {
			MediaType.APPLICATION_JSON_VALUE })
	public Product getProductById(@PathVariable("productId") String productId, HttpServletRequest request) {
		String tenantId = null;
		Product product = null;

		try {
			tenantId = tokenManager.getTenantId(request);

			if (tenantId != null && !tenantId.isEmpty()) {
				product = productService.getProductById(productId, tenantId);
				return product;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-get product by ID failed: ", e);
		}

		return product;
	}

	/**
	 * Method to save the tenant product
	 * 
	 * @param product
	 * @param request
	 * @return Product
	 */
	@PostMapping(value = "{companyName}/product/api/product", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Product saveProduct(@RequestBody Product product, HttpServletRequest request) {
		String tenantId = null;
		Product newProduct = new Product();

		try {
			tenantId = tokenManager.getTenantId(request);

			if (tenantId != null && !tenantId.isEmpty()) {
				newProduct.setTenantId(tenantId);
				newProduct.setName(product.getName());
				newProduct.setPrice(product.getPrice());
				newProduct.setPictureUrl(product.getPictureUrl());

				newProduct = productService.save(newProduct);
				return newProduct;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-save product failed: ", e);
		}

		return newProduct;
	}

	/**
	 * Method to update a tenant product
	 * 
	 * @param product
	 * @param request
	 * @return Product
	 */
	@PutMapping(value = "{companyName}/product/api/product", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Product updateProduct(@RequestBody Product product, HttpServletRequest request) {
		String tenantId = null;
		Product updateProduct = new Product();

		try {
			tenantId = tokenManager.getTenantId(request);

			if (tenantId != null && !tenantId.isEmpty()) {
				updateProduct.setProductId(product.getProductId());
				updateProduct.setTenantId(tenantId);
				updateProduct.setName(product.getName());
				updateProduct.setPrice(product.getPrice());
				updateProduct.setPictureUrl(product.getPictureUrl());

				updateProduct = productService.update(updateProduct);
				return updateProduct;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-update product failed: ", e);
		}

		return updateProduct;
	}

	/**
	 * Method to delete a tenant product
	 * 
	 * @param product
	 * @param request
	 */
	@DeleteMapping(value = "{companyName}/product/api/product")
	public void deleteProduct(@RequestBody Product product, HttpServletRequest request) {
		String tenantId = null;

		try {
			tenantId = tokenManager.getTenantId(request);

			if (tenantId != null && !tenantId.isEmpty()) {
				product.setTenantId(tenantId);
				productService.delete(product);
			} else {
				logger.error("TenantId: " + tenantId + "-Invalid tenant. Delete unsuccessful");
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-delete product failed: ", e);
		}
	}

	/**
	 * Hearbeat method to check if product service is up and running
	 * 
	 * @return
	 */
	@RequestMapping("{tenantId}/product/health/product")
	public String health() {
		return "\"Product service is up!\"";
	}

}