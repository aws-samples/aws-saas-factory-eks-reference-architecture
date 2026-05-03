/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { type CreateProductDto } from './dto/create-product.dto';
import { type UpdateProductDto } from './dto/update-product.dto';
import { v4 as uuid } from 'uuid';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { ClientFactoryService } from '@app/client-factory';

@Injectable()
export class ProductsService {
  constructor (private readonly clientFac: ClientFactoryService) {}
  // tableName: string = process.env.PRODUCT_TABLE_NAME;
  tableName: string = process.env.TABLE_NAME;

  async create (createProductDto: CreateProductDto, tenantId: string, jwtToken: string) {
    const newProduct = {
      ...createProductDto,
      productId: uuid(),
      tenantId: tenantId
    };
    console.log('Creating product:', newProduct);

    try {
      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new PutCommand({
        Item: newProduct,
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
    console.log('Getting All Products for Tenant:', tenantId);
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
      return JSON.stringify(response.Items);
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
    try {
      console.log('Getting Product: ', id);
      console.log('Getting Product: productID ', id.split(':')[1]);

      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenantId=:t_id AND productId=:p_id',
        ExpressionAttributeValues: {
          ':t_id': tenantId,
          ':p_id': id.split(':')[1]
        }
      });
      const response = await client.send(cmd);
      return JSON.stringify(response.Items?.[0]);
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

  async update (
    id: string,
    tenantId: string,
    updateProductDto: UpdateProductDto,
    jwtToken: string
  ) {
    try {
      console.log('Updating Product: ', id);
      const client = await this.fetchClient(tenantId, jwtToken);
      const cmd = new UpdateCommand({
        TableName: this.tableName,
        Key: {
          tenantId: tenantId,
          productId: id.split(':')[1]
        },
        UpdateExpression:
          'set #name = :n, #price = :p, #sku = :s, #category = :d',
        ExpressionAttributeValues: {
          ':n': updateProductDto.name,
          ':p': updateProductDto.price,
          ':s': updateProductDto.sku,
          ':d': updateProductDto.category
        },
        ExpressionAttributeNames: {
          '#name': 'name',
          '#price': 'price',
          '#sku': 'sku',
          '#category': 'category'
        }
      });

      const response = await client.send(cmd);
      console.log('Update Response:', response);
      return JSON.stringify(updateProductDto);
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
