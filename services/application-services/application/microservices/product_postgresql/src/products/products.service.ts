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

/**
 * Pool-mode connection cache key. Basic+PG+RLS uses a single connection
 * shared across all tenants (isolation via RLS, not per-tenant DB), so
 * we cache it under this fixed sentinel rather than a tenant-scoped key.
 */
const POOL_CACHE_KEY = '__basic_pool__';

interface CachedConnection {
  client: Client;
  createdAt: number;
}

/**
 * ProductsService — dual-mode data access for the EKS product microservice.
 *
 * Mode selection is made once at Pod start based on the env var the
 * Kustomize overlay injected:
 *
 *   Basic + PostgreSQL + RLS:
 *     TENANT_TIER  = "basic"
 *     TENANT_NAME  = ""       (empty — triggers basic-pool branch)
 *     IAM_ARN, PROXY_ENDPOINT, CLUSTER_ENDPOINT_RESOURCE present.
 *   → Pod-wide single `basic_pool_user` connection to `basic_pool_db`
 *     (cached 14 min). Per-tenant isolation is RLS session-binding
 *     (`SET LOCAL app.tenant_id = $1` inside a transaction, $1 from
 *     `x-tenant-id` header).
 *
 *   Standard/Premium + PostgreSQL:
 *     TENANT_TIER  = "standard" | "premium"
 *     TENANT_NAME  = "<Tenant.COMPANY_NAME>"    (non-empty)
 *   → Per-tenant connection to `tenant_<tenantName>_db` via
 *     `user_<tenantName>`, cached per-tenantName for 14 minutes. No
 *     session GUC — the DB itself is the isolation primitive; the RLS
 *     policy is a no-op defence-in-depth line.
 *
 * Mode detection uses the presence of `TENANT_NAME` rather than a
 * separate `BASIC_POOL_*` env set — single overlay per tier path, app
 * branches at runtime. Pool constants `basic_pool_db` / `basic_pool_user`
 * are hard-coded here; they already match the constants baked into
 * `lib/lambda/postgresql-database/postgresql_database.py`
 * (`BASIC_POOL_DB_NAME` / `BASIC_POOL_USERNAME`).
 */
const BASIC_POOL_DB_NAME = 'basic_pool_db';
const BASIC_POOL_USER_NAME = 'basic_pool_user';

@Injectable()
export class ProductsService implements OnModuleDestroy {
  private readonly dbPort = 5432;
  private readonly connectionCache = new Map<string, CachedConnection>();
  private readonly isBasicPoolMode: boolean;

  constructor() {
    // Basic pool mode ⇔ TENANT_NAME is absent/empty. Standard/Premium
    // always inject a non-empty TENANT_NAME.
    this.isBasicPoolMode = !process.env.TENANT_NAME;
    if (this.isBasicPoolMode) {
      console.log(
        `[ProductsService] Starting in Basic+PG+RLS pool mode ` +
        `(db=${BASIC_POOL_DB_NAME}, user=${BASIC_POOL_USER_NAME})`,
      );
    } else {
      console.log('[ProductsService] Starting in per-tenant DB mode');
    }
  }

  async onModuleDestroy() {
    for (const [, cached] of this.connectionCache) {
      try { await cached.client.end(); } catch { /* ignore */ }
    }
    this.connectionCache.clear();
  }

  // ================================================================
  // Connection acquisition
  // ================================================================

  /**
   * Get or create a cached IAM-authenticated PostgreSQL connection.
   *
   * In per-tenant mode, `tenantName` disambiguates the cache key and
   * selects the tenant DB/user. In Basic-pool mode, `tenantName` is
   * ignored — one shared connection to `basic_pool_db` is cached under
   * `POOL_CACHE_KEY`.
   */
  private async getConnection(tenantName: string): Promise<Client> {
    const cacheKey = this.isBasicPoolMode ? POOL_CACHE_KEY : tenantName;

    const cached = this.connectionCache.get(cacheKey);
    if (cached && (Date.now() - cached.createdAt) < CONNECTION_TTL_MS) {
      try {
        await cached.client.query('SELECT 1');
        return cached.client;
      } catch {
        this.connectionCache.delete(cacheKey);
      }
    }

    if (cached) {
      try { await cached.client.end(); } catch { /* ignore */ }
      this.connectionCache.delete(cacheKey);
    }

    try {
      const dbUser = this.isBasicPoolMode
        ? BASIC_POOL_USER_NAME
        : `user_${tenantName}`;
      const database = this.isBasicPoolMode
        ? BASIC_POOL_DB_NAME
        : `tenant_${tenantName}_db`;
      const iamArn = process.env['IAM_ARN']!;
      const proxyEndpoint = process.env.PROXY_ENDPOINT!;
      const region = process.env.AWS_REGION!;
      const resource = process.env.CLUSTER_ENDPOINT_RESOURCE! + dbUser;

      // Session policy scopes rds-db:connect to exactly this dbuser
      // resource — on Basic+PG it's `basic_pool_user`, on Std/Prem it's
      // `user_<tenantName>`.
      const sessionPolicy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: 'rds-db:connect',
          Resource: resource,
        }],
      };

      const sessionName = this.isBasicPoolMode
        ? 'basic-pool'
        : `tenant-${tenantName}`;

      const stsClient = new STSClient({ region });
      const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
        RoleArn: iamArn,
        RoleSessionName: sessionName,
        Policy: JSON.stringify(sessionPolicy),
      }));

      const credentials = assumeRoleResponse.Credentials;

      const signer = new Signer({
        region,
        hostname: proxyEndpoint,
        port: this.dbPort,
        username: dbUser,
        credentials: {
          accessKeyId: credentials!.AccessKeyId!,
          secretAccessKey: credentials!.SecretAccessKey!,
          sessionToken: credentials!.SessionToken!,
        },
      });

      const dbToken = await signer.getAuthToken();

      const client = new Client({
        host: proxyEndpoint,
        port: this.dbPort,
        user: dbUser,
        password: dbToken,
        database,
        ssl: { rejectUnauthorized: true },
      });

      await client.connect();

      this.connectionCache.set(cacheKey, {
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

  // ================================================================
  // RLS transaction wrapper (Basic+PG+RLS mode only)
  // ================================================================

  /**
   * Execute `fn(client)` inside a transaction that binds the session
   * GUC `app.tenant_id` to the given `tenantId`. This is the Basic+PG+
   * RLS primitive — without it, every tenant-scoped query returns zero
   * rows because `current_setting('app.tenant_id', true)` is NULL and
   * the RLS policy `USING (tenant_id = current_setting(…))` filters
   * out every row. That zero-rows fallback is intentional (safer than
   * leaking data), but a service that forgets the wrapper is still a
   * correctness defect equivalent to a cross-tenant read.
   *
   * `SET LOCAL` ties the GUC to the current transaction — it evaporates
   * at COMMIT/ROLLBACK, so connection pooling is safe.
   *
   * On any error, ROLLBACK is attempted (best-effort — if the client
   * itself is broken, a re-connect on the next request will evict the
   * cache). The original error is always re-thrown so the caller's
   * HttpException conversion runs normally.
   */
  private async withRlsBinding<T>(
    tenantId: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await this.getConnection('');
    await client.query('BEGIN');
    try {
      // Parameterised binding — never string-concatenate `tenantId`
      // into this statement even though Istio has validated the header.
      // Defence in depth against an authorizer regression.
      await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  /**
   * Mode-aware executor. On Basic+PG it wraps `fn` in the RLS binding
   * transaction; on per-tenant mode it just passes a live connection.
   */
  private async exec<T>(
    tenantId: string,
    tenantName: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    if (this.isBasicPoolMode) {
      return this.withRlsBinding(tenantId, fn);
    }
    const client = await this.getConnection(tenantName);
    return fn(client);
  }

  // ================================================================
  // CRUD
  // ================================================================

  async create(createProductDto: CreateProductDto, tenantId: string, tenantName: string) {
    const newProduct = { productId: uuid(), tenantId, ...createProductDto };
    console.log('Creating product:', newProduct);

    try {
      // Schema differences across the two paths:
      //   per-tenant DB:      columns are ("productId", "tenantId", ...)
      //                       camelCase, as in lib/lambda/.../sql/00_products.sql
      //   Basic pool DB:      columns are (tenant_id, "productId", ...)
      //                       tenant_id is snake_case and DEFAULT is
      //                       current_setting('app.tenant_id', true), so
      //                       INSERTs can omit it — but we include it
      //                       explicitly for two reasons:
      //                       (a) reject mismatched values via the RLS
      //                           WITH CHECK clause, and
      //                       (b) keep the SQL identical across branches
      //                           modulo column naming.
      const isBasic = this.isBasicPoolMode;
      const query = isBasic
        ? `INSERT INTO products (tenant_id, "productId", name, price, sku, category)
           VALUES ($1, $2, $3, $4, $5, $6)`
        : `INSERT INTO products ("productId", "tenantId", name, price, sku, category)
           VALUES ($1, $2, $3, $4, $5, $6)`;
      const params = isBasic
        ? [newProduct.tenantId, newProduct.productId, newProduct.name,
           newProduct.price, newProduct.sku, newProduct.category]
        : [newProduct.productId, newProduct.tenantId, newProduct.name,
           newProduct.price, newProduct.sku, newProduct.category];
      const result = await this.exec(tenantId, tenantName,
        (c) => c.query(query, params));
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
      // On Basic+PG path the `SELECT *` is still filtered — the RLS
      // policy clamps rows to the session's app.tenant_id. On the
      // per-tenant path the database scope itself is the filter, so
      // there's no `WHERE tenantId = $1` needed.
      const { rows } = await this.exec(tenantId, tenantName,
        (c) => c.query('SELECT * FROM products'));
      return rows.map((row: any) => ({
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
      // Per-tenant path uses the camelCase "tenantId" column; Basic+PG
      // path uses snake_case tenant_id (already filtered by RLS, so the
      // predicate is redundant but cheap — keeps the query shape
      // auditable).
      const isBasic = this.isBasicPoolMode;
      const query = isBasic
        ? 'SELECT * FROM products WHERE tenant_id = $1 AND "productId" = $2'
        : 'SELECT * FROM products WHERE "tenantId" = $1 AND "productId" = $2';
      const productId = id.includes(':') ? id.split(':')[1] : id;
      const { rows } = await this.exec(tenantId, tenantName,
        (c) => c.query(query, [tenantId, productId]));
      const row = rows[0] || null;
      if (row && row.price != null) row.price = Number(row.price);
      // On RLS-rejected access the WHERE above silently filters the row
      // out — no row found is indistinguishable from "not your tenant",
      // which is the intended safety fallback (Req §6.5a). Returning
      // null here yields a 404 upstream, never a 500.
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
      const isBasic = this.isBasicPoolMode;
      const query = isBasic
        ? `UPDATE products
             SET name = $1, price = $2, sku = $3, category = $4
           WHERE tenant_id = $5 AND "productId" = $6`
        : `UPDATE products
             SET name = $1, price = $2, sku = $3, category = $4
           WHERE "tenantId" = $5 AND "productId" = $6`;
      const productId = id.includes(':') ? id.split(':')[1] : id;
      const result = await this.exec(tenantId, tenantName, (c) => c.query(query, [
        updateProductDto.name, updateProductDto.price,
        updateProductDto.sku, updateProductDto.category,
        tenantId, productId,
      ]));

      // Req §6.5a — RLS rejections must surface as 404, not 500. On
      // Basic+PG, an UPDATE that matches 0 rows can mean either (a) the
      // productId genuinely does not exist under this tenant, or
      // (b) the row exists but belongs to another tenant (RLS filtered
      // it out). Both cases are 404 to the caller — deliberately
      // indistinguishable so an attacker can't enumerate other tenants'
      // productIds by comparing 404 vs 403 responses.
      if (result.rowCount === 0) {
        throw new HttpException(
          { status: HttpStatus.NOT_FOUND, error: 'Product not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('Update product error:', error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Failed to update product' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
