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
package com.amazonaws.saas.eks.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.amazonaws.saas.eks.model.Order;
import com.amazonaws.saas.eks.repository.OrderRepository;

@Service
public class OrderServiceImpl implements OrderService {

	private OrderRepository orderRepository;

	public OrderServiceImpl(OrderRepository orderRepository) {
		this.orderRepository = orderRepository;
	}

	@Override
	public List<Order> getOrders(String tenantId) {
		return orderRepository.getOrders(tenantId);
	}

	@Override
	public Order getOrderById(String orderId, String tenantId) {
		return orderRepository.getOrderById(orderId, tenantId);
	}

	@Override
	public Order save(Order order, String tenantId) {
		return orderRepository.save(order, tenantId);
	}

	@Override
	public void delete(Order order, String tenantId) {
		orderRepository.delete(order, tenantId);
	}
}