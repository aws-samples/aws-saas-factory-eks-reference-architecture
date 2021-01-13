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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.amazonaws.saas.eks.auth.TokenManager;
import com.amazonaws.saas.eks.model.Order;
import com.amazonaws.saas.eks.service.OrderService;

@CrossOrigin(origins = "*", allowedHeaders = "*")
@RestController
public class OrderController {
	private static final Logger logger = LogManager.getLogger(OrderController.class);

	@Autowired
	private OrderService orderService;

	@Autowired
	private TokenManager tokenManager;

	/**
	 * Method to retrieve all orders for a tenant
	 * 
	 * @param request
	 * @return List<Order>
	 */
	@GetMapping(value = "{companyName}/order/api/orders", produces = { MediaType.APPLICATION_JSON_VALUE })
	public List<Order> getOrders(HttpServletRequest request) {
		logger.info("Return orders");
		String tenantId = null;
		List<Order> orders = null;

		try {
			tenantId = tokenManager.getTenantId(request);
			
			if (tenantId != null && !tenantId.isEmpty()) {
				orders =  orderService.getOrders(tenantId);
				return orders;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-get orders failed: ", e);
			return null;
		}

		return orders;
	}

	/**
	 * Method to get Order by id for a tenant
	 * 
	 * @param orderId
	 * @param request
	 * @return Order
	 */
	@GetMapping(value = "{companyName}/order/api/order/{orderId}", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Order getOrderById(@PathVariable("orderId") String orderId, HttpServletRequest request) {
		String tenantId = null;
		Order order = null;
		
		try {
			tenantId = tokenManager.getTenantId(request);
			
			if (tenantId != null && !tenantId.isEmpty()) {
				order = orderService.getOrderById(orderId, tenantId);
				return order;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-get order by ID failed: ", e);
			return null;
		}

		return order;
	}

	/**
	 * Method to save an order for a tenant
	 * 
	 * @param order
	 * @param request
	 * @return Order
	 */
	@PostMapping(value = "{companyName}/order/api/order", produces = { MediaType.APPLICATION_JSON_VALUE })
	public Order saveOrder(@RequestBody Order order, HttpServletRequest request) {
		String tenantId = null;
		Order newOrder = null;
		
		try {
			tenantId = tokenManager.getTenantId(request);
			if (tenantId != null && !tenantId.isEmpty()) {
				newOrder = orderService.save(order, tenantId);
				return newOrder;
			}
		} catch (Exception e) {
			logger.error("TenantId: " + tenantId + "-save order failed: ", e);
			return null;
		}

		return newOrder;
	}

	@RequestMapping("{companyName}/order/health/order")
	public String health() {
		return "\"Order service is up!\"";
	}

}