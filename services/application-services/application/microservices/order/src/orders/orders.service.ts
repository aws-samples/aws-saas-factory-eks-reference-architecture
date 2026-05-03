/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { type CreateOrderDto } from './dto/create-order.dto';
import { v4 as uuid } from 'uuid';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { ClientFactoryService } from '@app/client-factory';

@Injectable()
export class OrdersService {
  constructor (private readonly clientFac: ClientFactoryService) {}
  // tableName: string = process.env.ORDER_TABLE_NAME;
  tableName: string = process.env.TABLE_NAME;

  async create (createOrderDto: CreateOrderDto, tenantId: string, jwtToken: string) {
    const newOrder = {
      orderName: createOrderDto.orderName,
      orderId: uuid(),
      tenantId: tenantId,
      orderProducts: JSON.stringify(createOrderDto.orderProducts)
    };
    console.log('Creating order:', newOrder);
    try {
      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new PutCommand({
        Item: newOrder,
        TableName: this.tableName
      });
      await client.send(cmd);
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAll (tenantId: string, jwtToken: string) {
    console.log('Get all orders:', tenantId, 'Table Name:', this.tableName);
    try {
      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenantId=:t_id',
        ExpressionAttributeValues: {
          ':t_id': tenantId
        }
      });
      const response = await client.send(cmd);
      console.log('Response:', response);
      const items = response.Items;
      const orders = items.map((i) => {
        return {
          ...i,
          orderProducts: JSON.parse(i.orderProducts)
        };
      });
      return JSON.stringify(orders);
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOne (id: string, tenantId: string, jwtToken: string) {
    console.log('Find order:', id, 'TenantId:OrderId', tenantId);
    try {
      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenantId=:t_id AND orderId=:o_id',
        ExpressionAttributeValues: {
          ':t_id': tenantId,
          ':o_id': id.split(':')[1]
        }
      });
      const result = await client.send(cmd);
      const item = result.Items[0];
      if (!item) {
        return;
      }
      const order = {
        ...item,
        orderProducts: JSON.parse(item.orderProducts)
      };
      return order;
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async fetchClient (tenantId: string, jwtToken: string) {
    return await this.clientFac.getClient(tenantId, jwtToken);
  }
}
