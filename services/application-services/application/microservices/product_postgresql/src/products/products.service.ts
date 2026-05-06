/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { v4 as uuid } from 'uuid';
import { Client } from 'pg';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { Signer } from '@aws-sdk/rds-signer';

/**
 * IAM token lifetime is 15 minutes.
 * Cache connections for 14 minutes to allow a 1-minute buffer before token expiry.
 */
const CONNECTION_TTL_MS = 14 * 60 * 1000;

interface CachedConnection {
  client: Client;
  createdAt: number;
}

@Injectable()
export class ProductsService implements OnModuleDestroy {
  private readonly dbPort = 5432;
  private readonly connectionCache = new Map<string, CachedConnection>();

  async onModuleDestroy() {
    for (const [, cached] of this.connectionCache) {
      try { await cached.client.end(); } catch { /* ignore */ }
    }
    this.connectionCache.clear();
  }

  /**
   * Get or create a cached IAM-authenticated PostgreSQL connection for a tenant.
   *
   * Flow:
   * 1. Check cache — if a valid (non-expired) connection exists, return it
   * 2. STS AssumeRole with a scoped-down session policy
   * 3. Generate an RDS IAM auth token via RDS Signer
   * 4. Create a PostgreSQL connection using the IAM token as password (TLS required)
   * 5. Cache the connection with a TTL of 14 minutes
   */
  private async getConnection(tenantName: string): Promise<Client> {
    const cached = this.connectionCache.get(tenantName);
    if (cached && (Date.now() - cached.createdAt) < CONNECTION_TTL_MS) {
      try {
        await cached.client.query('SELECT 1');
        return cached.client;
      } catch {
        this.connectionCache.delete(tenantName);
      }
    }

    if (cached) {
      try { await cached.client.end(); } catch { /* ignore */ }
      this.connectionCache.delete(tenantName);
    }

    try {
      const dbUser = `user_${tenantName}`;
      const database = `tenant_${tenantName}_db`;
      const iamArn = process.env['IAM_ARN'];
      const proxyEndpoint = process.env.PROXY_ENDPOINT;
      const region = process.env.AWS_REGION;
      const resource = process.env.CLUSTER_ENDPOINT_RESOURCE + dbUser;

      // STS AssumeRole with scoped-down session policy
      const sessionPolicy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: 'rds-db:connect',
          Resource: resource,
        }],
      };

      const stsClient = new STSClient({ region });
      const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
        RoleArn: iamArn,
        RoleSessionName: `tenant-${tenantName}`,
        Policy: JSON.stringify(sessionPolicy),
      }));

      const credentials = assumeRoleResponse.Credentials;

      // Generate IAM auth token
      const signer = new Signer({
        region,
        hostname: proxyEndpoint,
        port: this.dbPort,
        username: dbUser,
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
      });

      const dbToken = await signer.getAuthToken();

      // Create PostgreSQL connection with IAM token as password
      const client = new Client({
        host: proxyEndpoint,
        port: this.dbPort,
        user: dbUser,
        password: dbToken,
        database,
        ssl: { rejectUnauthorized: true },
      });

      await client.connect();

      this.connectionCache.set(tenantName, {
        client,
        createdAt: Date.now(),
      });

      return client;
    } catch (error) {
      console.error('Error creating IAM-authenticated connection:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Database connection failed' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(createProductDto: CreateProductDto, tenantId: string, tenantName: string) {
    const newProduct = { productId: uuid(), tenantId, ...createProductDto };
    console.log('Creating product:', newProduct);

    try {
      const client = await this.getConnection(tenantName);
      const query = `
        INSERT INTO products ("productId", "tenantId", name, price, sku, category)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      const result = await client.query(query, [
        newProduct.productId, newProduct.tenantId,
        newProduct.name, newProduct.price,
        newProduct.sku, newProduct.category,
      ]);
      return result;
    } catch (error) {
      console.error('Create product error:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Failed to create product' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(tenantId: string, tenantName: string) {
    console.log('Getting All Products for Tenant:', tenantId);

    try {
      const client = await this.getConnection(tenantName);
      const { rows } = await client.query('SELECT * FROM products');
      return rows.map(row => ({
        ...row,
        price: row.price != null ? Number(row.price) : row.price,
      }));
    } catch (error) {
      console.error('Find all products error:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Failed to retrieve products' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string, tenantId: string, tenantName: string) {
    console.log('Getting Product:', id);

    try {
      const client = await this.getConnection(tenantName);
      const { rows } = await client.query(
        'SELECT * FROM products WHERE "tenantId" = $1 AND "productId" = $2',
        [tenantId, id.split(':')[1]]
      );
      const row = rows[0] || null;
      if (row && row.price != null) row.price = Number(row.price);
      return row;
    } catch (error) {
      console.error('Find one product error:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Failed to retrieve product' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, tenantId: string, tenantName: string, updateProductDto: UpdateProductDto) {
    console.log('Updating Product:', id);

    try {
      const client = await this.getConnection(tenantName);
      const query = `
        UPDATE products
        SET name = $1, price = $2, sku = $3, category = $4
        WHERE "tenantId" = $5 AND "productId" = $6
      `;
      const result = await client.query(query, [
        updateProductDto.name, updateProductDto.price,
        updateProductDto.sku, updateProductDto.category,
        tenantId, id.split(':')[1],
      ]);
      return result;
    } catch (error) {
      console.error('Update product error:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Failed to update product' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
