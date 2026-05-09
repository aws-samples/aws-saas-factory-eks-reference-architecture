"""
Schema_Provisioner_Lambda (EKS SaaS ref) — structurally ported from
the ECS sister reference
(`refer/saas-ecs/server/lib/shared-infra/postgresql-database/postgresql_database.py`).

Two simplifications vs. the ECS reference — removed to keep the scope
of this Lambda limited to the `product` microservice only:

  1. The DGIS-specific schema set (`01_schema.sql`, `02_seed_codes.sql`,
     `03_seed_data.sql`) and the associated `__TENANT_CO_CD__` token
     replacement are removed. This Lambda only provisions the
     `products` table per tenant DB.
  2. No custom `logger` module is imported; we use plain `print` for
     CloudWatch visibility, matching the style of other Lambdas in
     this project.

Everything else — create-vs-delete dispatch, tenant role creation,
per-tenant DB creation, RDS Proxy Auth registration / removal with
state polling — is a 1:1 port of the ECS reference.

CloudFormation custom-resource contract:

    Create:  { "tenantName": "<n>"[, "action": "create"] }   (default action)
    Delete:  { "tenantName": "<n>",  "action": "delete" }

Environment variables (set by SharedDbStack in CDK):

    DB_PROXY_ENDPOINT  RDS Proxy DNS (Lambda does NOT connect to the
                       proxy; master DDL goes straight to the cluster,
                       matching ECS. Kept for parity / future use.)
    DB_ENDPOINT        Aurora cluster writer endpoint (master uses this)
    DB_NAME            master database name (= 'sbtsaasdb')
    DB_PROXY_NAME      RDS Proxy name (used for ModifyDBProxy)
    DB_SECRET_ARN      master Secrets Manager secret ARN
    REGION             AWS region
"""

import json
import os
import re
import string
import urllib.request
from os import environ

import boto3
import psycopg2
import psycopg2.extensions

# ---------- environment ----------
PROXY_ENDPOINT = environ.get('DB_PROXY_ENDPOINT')
DB_ENDPOINT    = environ.get('DB_ENDPOINT')
PORT           = 5432
DB_NAME        = environ.get('DB_NAME')
PROXY_NAME     = environ.get('DB_PROXY_NAME')
SECRET_ARN     = environ.get('DB_SECRET_ARN')
REGION         = environ.get('REGION')

secrets_manager = boto3.client('secretsmanager')
rds             = boto3.client('rds')


# ----------------------------------------------------------------
# Schema loader — reads every .sql file in the sibling sql/ dir and
# returns their concatenation. For this project, sql/ contains a
# single 00_products.sql; we keep the directory-scan shape so adding
# another .sql file is a pure content change.
# ----------------------------------------------------------------
def load_schema():
    schema_dir = os.path.join(os.path.dirname(__file__), 'sql')
    sql_files = sorted(f for f in os.listdir(schema_dir) if f.endswith('.sql'))
    if not sql_files:
        raise FileNotFoundError(f'No .sql files found in {schema_dir}')
    combined = []
    for sql_file in sql_files:
        with open(os.path.join(schema_dir, sql_file), 'r') as f:
            content = f.read()
        print(f'Loaded {sql_file} ({len(content)} chars)')
        combined.append(content)
    return '\n'.join(combined)


def execute_schema(conn):
    raw = load_schema()
    print(f'Schema SQL loaded ({len(raw)} chars)')
    cur = conn.cursor()
    cur.execute(raw)
    conn.commit()
    cur.close()
    print('Schema execution complete')


# ----------------------------------------------------------------
# Connection helpers
# ----------------------------------------------------------------
def get_admin_connection(db_name=None):
    secret_value = json.loads(
        secrets_manager.get_secret_value(SecretId=SECRET_ARN)['SecretString']
    )
    conn = psycopg2.connect(
        host=DB_ENDPOINT,
        user=secret_value['username'],
        password=secret_value['password'],
        port=PORT,
        dbname=db_name or DB_NAME,
    )
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    return conn


def run_sql(conn, sql, params=None):
    cur = conn.cursor()
    cur.execute(sql, params)
    try:
        rows = cur.fetchall()
    except psycopg2.ProgrammingError:
        rows = []
    cur.close()
    return rows


# ----------------------------------------------------------------
# Handler
# ----------------------------------------------------------------
def lambda_handler(event, context):
    """Entry point supporting BOTH invocation styles:
      - CloudFormation CustomResource (event has `ResponseURL`): wrap
        `_do_work` with cfn-response PUT so CFN doesn't wait the full
        1-hour CustomResource timeout.
      - Direct Lambda invoke (e.g., `aws lambda invoke` or the Step
        Functions fallback): same logic, no ResponseURL send.
    """
    if 'ResponseURL' in event:
        return _cfn_handler(event, context)
    return _do_work(event)


def _send_cfn_response(event, context, status, reason=''):
    body = json.dumps({
        'Status': status,
        'Reason': reason or f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': event.get('PhysicalResourceId', context.log_stream_name),
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'NoEcho': False,
        'Data': {},
    }).encode('utf-8')
    req = urllib.request.Request(
        event['ResponseURL'], data=body, method='PUT',
        headers={'Content-Type': '', 'Content-Length': str(len(body))},
    )
    with urllib.request.urlopen(req) as resp:  # nosec B310 — CFN URL
        resp.read()


def _cfn_handler(event, context):
    try:
        _do_work(event)
        _send_cfn_response(event, context, 'SUCCESS')
    except Exception as exc:  # pylint: disable=broad-except
        print(f'CFN handler error: {exc}')
        # Always SUCCESS on Delete — failing a delete would leave the
        # stack in DELETE_FAILED and block teardown. The delete helpers
        # already swallow "not found" errors; anything further is best-
        # effort.
        status = 'SUCCESS' if event.get('RequestType') == 'Delete' else 'FAILED'
        _send_cfn_response(event, context, status, str(exc))


def _do_work(event):
    # Support both direct invocation (`{"tenantName": "..."}`) and
    # CloudFormation CustomResource events (tenantName lives under
    # ResourceProperties).
    props = event.get('ResourceProperties', event)

    # For CFN CustomResource, map RequestType → action.
    request_type = event.get('RequestType', '')
    if request_type == 'Delete':
        action = 'delete'
    elif request_type in ('Create', 'Update'):
        action = 'create'
    else:
        action = props.get('action', 'create')

    # =====================================================================
    # Basic-pool bootstrap branch (Shared_Db_Stack deploy time, NOT tenant
    # onboarding). Trigger: `cr.AwsCustomResource` fires a Lambda invoke
    # with `action=bootstrap_basic_pool` (create/update) or
    # `action=teardown_basic_pool` (delete). Unlike the per-tenant branch
    # below, there is no `tenantName` — this is a one-shot setup of the
    # shared `basic_pool_db` + `basic_pool_user` + RLS-enforced table
    # DDL. See requirements §5.10–11 of the product-db-selection spec.
    # The Shared_Db_Stack's AwsCustomResource encodes these actions via
    # `ResourceProperties.action`, so the RequestType→action mapping
    # above is bypassed when props['action'] is one of the basic_pool
    # keywords.
    # =====================================================================
    explicit_action = props.get('action')
    if explicit_action == 'bootstrap_basic_pool':
        print('Action: bootstrap_basic_pool')
        bootstrap_basic_pool()
        print('bootstrap_basic_pool: success')
        return
    if explicit_action == 'teardown_basic_pool':
        print('Action: teardown_basic_pool')
        teardown_basic_pool()
        print('teardown_basic_pool: success')
        return

    tenant_name = props.get('tenantName')
    if not tenant_name:
        raise ValueError('Tenant name is required')
    if not re.match(r'^[a-zA-Z0-9_-]+$', tenant_name):
        raise ValueError(f'Invalid tenant name: {tenant_name}')

    print(f'tenant_name: {tenant_name}')
    print(f'action: {action}')

    conn = None
    try:
        conn = get_admin_connection()

        if action == 'delete':
            delete_tenant(conn, tenant_name)
        else:
            db_name = f'tenant_{tenant_name}_db'
            rows = run_sql(
                conn,
                'SELECT 1 FROM pg_database WHERE datname = %s',
                (db_name,),
            )
            if not rows:
                print(f'Database for tenant {tenant_name} does not exist. Creating now...')
                create_tenant_database_and_tables(conn, tenant_name)
            else:
                print(f'Database for tenant {tenant_name} already exists. Ensuring tables and Proxy Auth...')
                ensure_tables_exist(conn, tenant_name)
                ensure_proxy_auth_registered(tenant_name)

        print('Success')
    except Exception as e:
        error_statement = f'Database connection failed due to {e}'
        print(error_statement)
        raise Exception(f'Database operation ({action}) failed due to {error_statement}')
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


# ----------------------------------------------------------------
# Create path
# ----------------------------------------------------------------
def create_tenant_database_and_tables(conn, tenant_name):
    db_username   = f'user_{tenant_name}'
    db_name       = f'tenant_{tenant_name}_db'
    user_password = generate_password(32)

    # Create / refresh tenant role.
    rows = run_sql(conn, 'SELECT 1 FROM pg_roles WHERE rolname = %s', (db_username,))
    if not rows:
        run_sql(conn, f'CREATE ROLE {db_username} WITH LOGIN PASSWORD %s', (user_password,))
    else:
        print(f'Role {db_username} already exists, updating password')
        run_sql(conn, f'ALTER ROLE {db_username} WITH PASSWORD %s', (user_password,))

    # Grant admin membership on the tenant role (required for PostgreSQL 16+).
    run_sql(conn, f'GRANT {db_username} TO CURRENT_USER')

    # Create tenant database owned by the tenant role.
    rows = run_sql(conn, 'SELECT 1 FROM pg_database WHERE datname = %s', (db_name,))
    if not rows:
        run_sql(conn, f'CREATE DATABASE {db_name} OWNER {db_username}')
    else:
        print(f'Database {db_name} already exists')

    run_sql(conn, f'GRANT CONNECT ON DATABASE {db_name} TO {db_username}')
    conn.close()

    # Switch connection to the tenant database to create tables.
    print(f'Connecting to tenant database {db_name} to create tables...')
    tenant_conn = get_admin_connection(db_name)
    run_sql(tenant_conn, f'GRANT USAGE ON SCHEMA public TO {db_username}')
    run_sql(tenant_conn, f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {db_username}')
    run_sql(tenant_conn, f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {db_username}')
    run_sql(tenant_conn, f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {db_username}')
    run_sql(tenant_conn, f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {db_username}')

    print(f'Executing schema for tenant {tenant_name}...')
    execute_schema(tenant_conn)
    tables = run_sql(tenant_conn, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    print(f'Tables in {db_name}: {tables}')
    tenant_conn.close()

    # Register per-tenant secret + RDS Proxy Auth.
    secret_name = f'rds_proxy_multitenant/proxy_secret_for_user_{tenant_name}'
    secret_string = {
        'username':              db_username,
        'password':              user_password,
        'engine':                'postgres',
        'port':                  PORT,
        'dbname':                db_name,
        'dbClusterIdentifier':   'proxy',
    }

    try:
        response = secrets_manager.create_secret(
            Name=secret_name,
            Description=f'Proxy secret created for tenant {tenant_name}',
            SecretString=json.dumps(secret_string),
            Tags=[{'Key': 'Tenant', 'Value': tenant_name}],
        )
        secret_arn = response['ARN']
    except secrets_manager.exceptions.ResourceExistsException:
        print(f'Secret {secret_name} already exists, reusing')
        response   = secrets_manager.describe_secret(SecretId=secret_name)
        secret_arn = response['ARN']
        secrets_manager.update_secret(
            SecretId=secret_name, SecretString=json.dumps(secret_string),
        )

    update_rds_proxy({'SecretArn': secret_arn, 'IAMAuth': 'REQUIRED'})


def ensure_tables_exist(conn, tenant_name):
    db_name     = f'tenant_{tenant_name}_db'
    db_username = f'user_{tenant_name}'
    try:
        conn.close()
        tenant_conn = get_admin_connection(db_name)

        run_sql(tenant_conn, f'GRANT USAGE ON SCHEMA public TO {db_username}')
        run_sql(tenant_conn, f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {db_username}')
        run_sql(tenant_conn, f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {db_username}')
        run_sql(tenant_conn, f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {db_username}')
        run_sql(tenant_conn, f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {db_username}')

        execute_schema(tenant_conn)
        tenant_conn.close()
        print(f'Tables ensured for tenant {tenant_name}')
    except Exception as e:
        print(f'Error ensuring tables for tenant {tenant_name}: {e}')


# ----------------------------------------------------------------
# Delete path
# ----------------------------------------------------------------
def delete_tenant(conn, tenant_name):
    db_username = f'user_{tenant_name}'
    db_name     = f'tenant_{tenant_name}_db'
    secret_name = f'rds_proxy_multitenant/proxy_secret_for_user_{tenant_name}'

    remove_proxy_auth(tenant_name, secret_name)

    try:
        run_sql(conn, f"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{db_name}' AND pid <> pg_backend_pid()
        """)
        run_sql(conn, f'DROP DATABASE IF EXISTS {db_name}')
        print(f'Dropped database: {db_name}')
        run_sql(conn, f'DROP ROLE IF EXISTS {db_username}')
        print(f'Dropped role: {db_username}')
    except Exception as e:
        print(f'Error dropping database/role for tenant {tenant_name}: {e}')

    try:
        secrets_manager.delete_secret(SecretId=secret_name, ForceDeleteWithoutRecovery=True)
        print(f'Deleted secret: {secret_name}')
    except secrets_manager.exceptions.ResourceNotFoundException:
        print(f'Secret not found (already deleted): {secret_name}')
    except Exception as e:
        print(f'Error deleting secret {secret_name}: {e}')


# ----------------------------------------------------------------
# RDS Proxy Auth list helpers (stateful — poll proxy status)
# ----------------------------------------------------------------
def ensure_proxy_auth_registered(tenant_name):
    secret_name = f'rds_proxy_multitenant/proxy_secret_for_user_{tenant_name}'
    try:
        response   = secrets_manager.describe_secret(SecretId=secret_name)
        secret_arn = response['ARN']
        current_auth = rds.describe_db_proxies(DBProxyName=PROXY_NAME)['DBProxies'][0]['Auth']
        registered   = [a.get('SecretArn', '') for a in current_auth]
        if secret_arn in registered:
            print(f'Proxy Auth already registered for tenant {tenant_name}')
            return
        print(f'Proxy Auth missing for tenant {tenant_name}, registering now...')
        update_rds_proxy({'SecretArn': secret_arn, 'IAMAuth': 'REQUIRED'})
    except secrets_manager.exceptions.ResourceNotFoundException:
        print(f'Secret not found for tenant {tenant_name}, skipping Proxy Auth check')
    except Exception as e:
        print(f'Error ensuring Proxy Auth for tenant {tenant_name}: {e}')
        raise


def remove_proxy_auth(tenant_name, secret_name):
    import random
    import time

    max_retries, base_delay = 40, 20

    try:
        response          = secrets_manager.describe_secret(SecretId=secret_name)
        target_secret_arn = response['ARN']
    except secrets_manager.exceptions.ResourceNotFoundException:
        print(f'Secret not found for tenant {tenant_name}, skipping Proxy Auth removal')
        return
    except Exception as e:
        print(f'Error describing secret {secret_name}: {e}')
        return

    for attempt in range(max_retries):
        try:
            proxy_info                 = rds.describe_db_proxies(DBProxyName=PROXY_NAME)['DBProxies'][0]
            current_auth, proxy_status = proxy_info['Auth'], proxy_info['Status']
            registered                 = [a.get('SecretArn', '') for a in current_auth]

            if target_secret_arn not in registered:
                print(f'Proxy Auth not registered for tenant {tenant_name}, nothing to remove')
                return
            if proxy_status != 'available':
                wait_time = base_delay + random.uniform(0, 5)
                print(f'RDS Proxy status: {proxy_status}, waiting {wait_time:.0f}s... (attempt {attempt + 1}/{max_retries})')
                time.sleep(wait_time)
                continue

            new_auth = [a for a in current_auth if a.get('SecretArn', '') != target_secret_arn]
            rds.modify_db_proxy(DBProxyName=PROXY_NAME, Auth=new_auth)
            print(f'Successfully removed Proxy Auth for tenant {tenant_name}')
            return
        except rds.exceptions.InvalidDBProxyStateFault:
            time.sleep(base_delay + random.uniform(0, 5))
        except Exception as e:
            print(f'Error removing Proxy Auth for tenant {tenant_name}: {e}')
            raise

    raise Exception(f'Failed to remove Proxy Auth after {max_retries} retries for tenant {tenant_name}')


def update_rds_proxy(proxy_auth):
    import random
    import time

    max_retries, base_delay = 40, 20
    target_secret_arn       = proxy_auth['SecretArn']

    for attempt in range(max_retries):
        try:
            proxy_info                 = rds.describe_db_proxies(DBProxyName=PROXY_NAME)['DBProxies'][0]
            current_auth, proxy_status = proxy_info['Auth'], proxy_info['Status']
            registered                 = [a.get('SecretArn', '') for a in current_auth]

            if target_secret_arn in registered:
                print(f'Proxy Auth already registered: {target_secret_arn}')
                return
            if proxy_status != 'available':
                wait_time = base_delay + random.uniform(0, 5)
                print(f'RDS Proxy status: {proxy_status}, waiting {wait_time:.0f}s... (attempt {attempt + 1}/{max_retries})')
                time.sleep(wait_time)
                continue

            current_auth.append(proxy_auth)
            rds.modify_db_proxy(DBProxyName=PROXY_NAME, Auth=current_auth)
            print(f'Successfully updated RDS Proxy with {proxy_auth}')
            return
        except rds.exceptions.InvalidDBProxyStateFault:
            time.sleep(base_delay + random.uniform(0, 5))
        except Exception as e:
            print(f'Error updating RDS Proxy for {proxy_auth}: {e}')
            raise

    raise Exception(f'Failed to update RDS Proxy after {max_retries} retries for {proxy_auth}')


def generate_password(length):
    import secrets as sec
    characters = string.ascii_letters + string.digits
    return ''.join(sec.choice(characters) for _ in range(length))


# ================================================================
# Basic-pool bootstrap / teardown (Shared_Db_Stack deploy time)
# ================================================================
# Contract — requirements.md §5.10–11:
#
#   bootstrap_basic_pool  (onCreate / onUpdate)
#     1. Create database `basic_pool_db` if missing.
#     2. Create role `basic_pool_user` with LOGIN and `rds_iam` (but
#        NOT BYPASSRLS). Idempotent.
#     3. Connect to `basic_pool_db` and execute every .sql file in
#        sql/basic_pool/ in lexicographic order. Each .sql is expected
#        to be idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
#     4. Register `basic_pool_user` with RDS Proxy (IAM auth), creating
#        a Secrets Manager secret dedicated to the pool user.
#
#   teardown_basic_pool  (onDelete)
#     Fires only when Shared_Db_Stack itself is being destroyed. Not
#     triggered by day-to-day tenant onboarding/offboarding.
#     1. Remove the pool user's Proxy Auth entry from RDS Proxy.
#     2. Drop database `basic_pool_db` (with connection termination).
#     3. Drop role `basic_pool_user`.
#     4. Delete the pool user's Secrets Manager secret.
#
# Both actions are idempotent and MUST NOT raise on "already exists"
# (bootstrap) or "not found" (teardown) conditions — CFN may invoke
# Update with identical properties and may retry Delete.

BASIC_POOL_DB_NAME    = 'basic_pool_db'
BASIC_POOL_USERNAME   = 'basic_pool_user'
BASIC_POOL_SECRET_NAME = 'rds_proxy_multitenant/proxy_secret_for_user_basic_pool'


# Basic-pool schema is now applied via the shared `execute_schema()` helper
# — sql/ is a single flat tree used by both the per-tenant path and the
# Basic pool path. `basic_pool_user` GRANTs inside the .sql files are
# guarded by `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname =
# 'basic_pool_user')` so they are silently skipped on per-tenant DBs.


def bootstrap_basic_pool():
    # Step 1 + 2 (role + database) run against the master DB.
    admin = get_admin_connection()
    try:
        # Create pool role (idempotent). NOLOGIN would break IAM auth, so
        # we ensure LOGIN. Grant `rds_iam` so RDS Proxy IAM auth works.
        rows = run_sql(admin, 'SELECT 1 FROM pg_roles WHERE rolname = %s',
                       (BASIC_POOL_USERNAME,))
        if not rows:
            print(f'[basic_pool] Creating role {BASIC_POOL_USERNAME}')
            # Use a random initial password; IAM auth bypasses it but the
            # role still needs one to be set.
            initial_pw = generate_password(32)
            run_sql(admin,
                    f'CREATE ROLE {BASIC_POOL_USERNAME} WITH LOGIN PASSWORD %s',
                    (initial_pw,))
        else:
            print(f'[basic_pool] Role {BASIC_POOL_USERNAME} already exists — '
                  f'rotating password for Secrets Manager sync')
            initial_pw = generate_password(32)
            run_sql(admin,
                    f'ALTER ROLE {BASIC_POOL_USERNAME} WITH PASSWORD %s',
                    (initial_pw,))

        # rds_iam role membership is required for IAM auth on RDS.
        # GRANT is idempotent.
        try:
            run_sql(admin, f'GRANT rds_iam TO {BASIC_POOL_USERNAME}')
        except Exception as e:
            # `rds_iam` may not exist on non-AWS PostgreSQL — tolerate it.
            print(f'[basic_pool] GRANT rds_iam skipped: {e}')

        # Admin membership on the pool role (PostgreSQL 16+ quirk —
        # required before we can ALTER OWNER).
        run_sql(admin, f'GRANT {BASIC_POOL_USERNAME} TO CURRENT_USER')

        # Create the pool database (idempotent). We do NOT give OWNER =
        # basic_pool_user; the admin owns the DB and basic_pool_user has
        # only CONNECT + CRUD. This prevents `basic_pool_user` from
        # altering table DDL at runtime.
        rows = run_sql(admin, 'SELECT 1 FROM pg_database WHERE datname = %s',
                       (BASIC_POOL_DB_NAME,))
        if not rows:
            print(f'[basic_pool] Creating database {BASIC_POOL_DB_NAME}')
            run_sql(admin, f'CREATE DATABASE {BASIC_POOL_DB_NAME}')
        else:
            print(f'[basic_pool] Database {BASIC_POOL_DB_NAME} already exists')

        run_sql(admin,
                f'GRANT CONNECT ON DATABASE {BASIC_POOL_DB_NAME} TO {BASIC_POOL_USERNAME}')
    finally:
        admin.close()

    # Step 3: connect to basic_pool_db and apply the RLS schema.
    pool_admin = get_admin_connection(BASIC_POOL_DB_NAME)
    try:
        # public schema usage + default privileges for the pool user.
        run_sql(pool_admin, f'GRANT USAGE ON SCHEMA public TO {BASIC_POOL_USERNAME}')
        run_sql(pool_admin,
                f'GRANT SELECT, INSERT, UPDATE, DELETE '
                f'ON ALL TABLES IN SCHEMA public TO {BASIC_POOL_USERNAME}')
        run_sql(pool_admin,
                f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public '
                f'TO {BASIC_POOL_USERNAME}')
        run_sql(pool_admin,
                f'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES '
                f'TO {BASIC_POOL_USERNAME}')
        run_sql(pool_admin,
                f'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                f'GRANT USAGE, SELECT ON SEQUENCES TO {BASIC_POOL_USERNAME}')

        # Reuse the shared execute_schema() helper — same sql/ tree as
        # per-tenant path. basic_pool_user GRANTs in the .sql files are
        # guarded; per-tenant GRANTs are no-ops on the pool DB.
        print('[basic_pool] Applying shared schema tree to basic_pool_db')
        execute_schema(pool_admin)

        tables = run_sql(pool_admin,
                         "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        print(f'[basic_pool] Tables in {BASIC_POOL_DB_NAME}: {tables}')

        # Assert RLS is FORCED on every tenant-scoped table. Any table
        # that has a `tenant_id` column is considered tenant-scoped.
        rls_missing = run_sql(pool_admin, """
            SELECT c.relname
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN pg_attribute a ON a.attrelid = c.oid
             WHERE n.nspname = 'public'
               AND c.relkind = 'r'
               AND a.attname = 'tenant_id'
               AND NOT a.attisdropped
               AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
        """)
        if rls_missing:
            # Don't raise — just loudly warn. A broken schema SQL should
            # fail at CREATE TABLE time, not here. But if someone forgot
            # `FORCE ROW LEVEL SECURITY` on a new table, we want it in
            # CloudWatch.
            print(f'[basic_pool] WARNING: tables missing FORCE RLS: {rls_missing}')
    finally:
        pool_admin.close()

    # Step 4: Secrets Manager + RDS Proxy Auth.
    secret_string = {
        'username':              BASIC_POOL_USERNAME,
        'password':              initial_pw,
        'engine':                'postgres',
        'port':                  PORT,
        'dbname':                BASIC_POOL_DB_NAME,
        'dbClusterIdentifier':   'proxy',
    }
    try:
        response = secrets_manager.create_secret(
            Name=BASIC_POOL_SECRET_NAME,
            Description='Proxy secret for the Basic-pool shared IAM user',
            SecretString=json.dumps(secret_string),
            Tags=[{'Key': 'Role', 'Value': 'basic-pool-shared'}],
        )
        secret_arn = response['ARN']
    except secrets_manager.exceptions.ResourceExistsException:
        print(f'[basic_pool] Secret {BASIC_POOL_SECRET_NAME} already exists, reusing')
        response   = secrets_manager.describe_secret(SecretId=BASIC_POOL_SECRET_NAME)
        secret_arn = response['ARN']
        secrets_manager.update_secret(
            SecretId=BASIC_POOL_SECRET_NAME,
            SecretString=json.dumps(secret_string),
        )

    update_rds_proxy({'SecretArn': secret_arn, 'IAMAuth': 'REQUIRED'})


def teardown_basic_pool():
    # Step 1: remove Proxy Auth entry for the pool user's secret.
    try:
        remove_proxy_auth('basic_pool', BASIC_POOL_SECRET_NAME)
    except Exception as e:
        print(f'[basic_pool] Error removing Proxy Auth: {e}')

    # Step 2 + 3: drop database and role.
    admin = get_admin_connection()
    try:
        run_sql(admin, f"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{BASIC_POOL_DB_NAME}' AND pid <> pg_backend_pid()
        """)
        run_sql(admin, f'DROP DATABASE IF EXISTS {BASIC_POOL_DB_NAME}')
        print(f'[basic_pool] Dropped database {BASIC_POOL_DB_NAME}')
        run_sql(admin, f'DROP ROLE IF EXISTS {BASIC_POOL_USERNAME}')
        print(f'[basic_pool] Dropped role {BASIC_POOL_USERNAME}')
    except Exception as e:
        print(f'[basic_pool] Error dropping DB/role: {e}')
    finally:
        admin.close()

    # Step 4: delete Secrets Manager secret.
    try:
        secrets_manager.delete_secret(
            SecretId=BASIC_POOL_SECRET_NAME,
            ForceDeleteWithoutRecovery=True,
        )
        print(f'[basic_pool] Deleted secret {BASIC_POOL_SECRET_NAME}')
    except secrets_manager.exceptions.ResourceNotFoundException:
        print(f'[basic_pool] Secret not found (already deleted): {BASIC_POOL_SECRET_NAME}')
    except Exception as e:
        print(f'[basic_pool] Error deleting secret: {e}')
