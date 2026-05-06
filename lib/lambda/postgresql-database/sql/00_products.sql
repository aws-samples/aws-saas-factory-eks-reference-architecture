-- Per-tenant Product microservice table.
-- Schema ported 1:1 from
-- refer/saas-ecs/server/lib/shared-infra/postgresql-database/sql/00_products.sql

CREATE TABLE IF NOT EXISTS products (
    "productId" VARCHAR(36) PRIMARY KEY,
    "tenantId"  VARCHAR(255),
    sku         VARCHAR(255),
    category    VARCHAR(255),
    name        VARCHAR(255),
    price       DECIMAL(10, 2)
);
