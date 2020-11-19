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

import com.amazonaws.saas.eks.model.Product;
import com.amazonaws.saas.eks.repository.ProductRepository;
import com.amazonaws.saas.eks.service.ProductService;
import com.amazonaws.saas.eks.service.ProductServiceImpl;

@CrossOrigin(origins = "*", allowedHeaders = "*")
@RestController
public class ProductController {
	private static final Logger logger = LogManager.getLogger(ProductController.class);

	@Autowired
	private ProductService productService;

	@GetMapping(value = "{tenantId}/product/api/products", produces = { MediaType.APPLICATION_JSON_VALUE })
	public List<Product> getProducts(@PathVariable("tenantId") String tenantId) {
		logger.info("Return products");
		return productService.getProducts(tenantId);
	}

	@GetMapping(value = "{tenantId}/product/api/product/{productId}", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Product getProductById(@PathVariable("tenantId") String tenantId,
			@PathVariable("productId") String productId) {
		return productService.getProductById(productId);
	}

	@PostMapping(value = "{tenantId}/product/api/product", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Product saveProduct(@PathVariable("tenantId") String tenantId, @RequestBody Product product) {
		Product newProduct = new Product();
		newProduct.setTenantId(tenantId);
		newProduct.setName(product.getName());
		newProduct.setPrice(product.getPrice());
		newProduct.setPictureUrl(product.getPictureUrl());
		return productService.save(newProduct);
	}

	@PutMapping(value = "{tenantId}/product/api/product", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Product updateProduct(@PathVariable("tenantId") String tenantId, @RequestBody Product product) {
		Product updateProduct = new Product();
		updateProduct.setProductId(product.getProductId());
		updateProduct.setTenantId(tenantId);
		updateProduct.setName(product.getName());
		updateProduct.setPrice(product.getPrice());
		updateProduct.setPictureUrl(product.getPictureUrl());
		return productService.update(updateProduct);
	}

	@DeleteMapping(value = "{tenantId}/product/api/product")
	public void deleteProduct(@RequestBody Product product) {
		productService.delete(product);
	}

	@RequestMapping("{tenantId}/product/health/product")
	public String health() {
		return "\"Product service is up!\"";
	}

}