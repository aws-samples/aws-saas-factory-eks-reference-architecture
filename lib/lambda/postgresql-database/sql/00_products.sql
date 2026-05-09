-- =========================================================================
-- Product microservice — unified schema (RLS-backed)
-- =========================================================================
-- Single schema file used by ALL tiers (Basic pool + Standard/Premium
-- per-tenant DBs). RLS is enforced on every tier:
--   · Basic   — multiple tenants share basic_pool_db; RLS is the
--               primary isolation mechanism.
--   · Standard/Premium — each tenant has its own tenant_<name>_db; the
--               database itself is the primary isolation boundary and
--               RLS acts as a defense-in-depth second line (forgetting
--               SET LOCAL returns zero rows instead of leaking).
--
-- Tenant binding:
--   BEGIN;
--   SELECT set_config('app.tenant_id', $1, true);  -- $1 := x-tenant-id
--   <queries>;
--   COMMIT;
--
-- GRANTs are conditional on the pool user existing. In the per-tenant
-- path the GRANT is silently skipped and the Lambda's post-schema
-- GRANT block (create_tenant_database_and_tables / ensure_tables_exist)
-- grants CRUD to user_<tenantName>.
-- =========================================================================

CREATE TABLE IF NOT EXISTS products (
    tenant_id   TEXT          NOT NULL DEFAULT current_setting('app.tenant_id', true),
    "productId" VARCHAR(36)   NOT NULL,
    sku         VARCHAR(255),
    category    VARCHAR(255),
    name        VARCHAR(255),
    price       DECIMAL(10, 2),
    PRIMARY KEY (tenant_id, "productId")
);

ALTER TABLE products ENABLE  ROW LEVEL SECURITY;
ALTER TABLE products FORCE   ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_rls_policy ON products;
CREATE POLICY products_rls_policy ON products
    FOR ALL
    USING      (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX IF NOT EXISTS products_productid_tenant_idx
    ON products ("productId", tenant_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'basic_pool_user') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON products TO basic_pool_user';
    END IF;
END
$$;
