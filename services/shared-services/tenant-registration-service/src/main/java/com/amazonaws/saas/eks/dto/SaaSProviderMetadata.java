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
package com.amazonaws.saas.eks.dto;

import java.io.Serializable;

public class SaaSProviderMetadata implements Serializable {
	private static final long serialVersionUID = 1L;
	private String s3Endpoint;
	private String orderServiceEcrRepoUri;
	private String productServiceEcrRepoUri;
	private String providerUserPool;

	public String getS3Endpoint() {
		return s3Endpoint;
	}

	public void setS3Endpoint(String s3Endpoint) {
		this.s3Endpoint = s3Endpoint;
	}

	public String getOrderServiceEcrRepoUri() {
		return orderServiceEcrRepoUri;
	}

	public void setOrderServiceEcrRepoUri(String orderServiceEcrRepoUri) {
		this.orderServiceEcrRepoUri = orderServiceEcrRepoUri;
	}

	public String getProductServiceEcrRepoUri() {
		return productServiceEcrRepoUri;
	}

	public void setProductServiceEcrRepoUri(String productServiceEcrRepoUri) {
		this.productServiceEcrRepoUri = productServiceEcrRepoUri;
	}

	public String getProviderUserPool() {
		return providerUserPool;
	}

	public void setProviderUserPool(String providerUserPool) {
		this.providerUserPool = providerUserPool;
	}

}
