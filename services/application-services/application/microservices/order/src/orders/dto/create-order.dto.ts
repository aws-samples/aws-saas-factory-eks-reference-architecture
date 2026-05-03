/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { type OrderProductDto } from './order-product.dto';

export class CreateOrderDto {
  orderName: string;
  orderProducts: OrderProductDto[];
}
