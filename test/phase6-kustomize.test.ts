/**
 * Phase 6 — Kustomize overlay env-var assertions (Req 6.*, 7.*, 11.3).
 *
 * Covers:
 *   Task 6.4 — overlays/dynamodb rendered Deployment env keys =
 *              {TABLE_NAME, AWS_REGION, TENANT_TIER, IAM_ROLE_ARN,
 *               REQUEST_TAG_KEYS_MAPPING_ATTRIBUTES}
 *   Task 6.5 — overlays/postgresql rendered Deployment env keys =
 *              {IAM_ARN, PROXY_ENDPOINT, CLUSTER_ENDPOINT_RESOURCE,
 *               TENANT_NAME, AWS_REGION, TENANT_TIER}
 *   Task 6.11 (P3) — no cross-DB env-var leakage — each overlay's env
 *              key set is exactly one of the two canonical sets.
 *
 * Shells out to `kubectl kustomize` (kustomize ships with kubectl >= v1.14).
 * Writes a transient svc-acc-patch.yaml before invocation so the JSON6902
 * patch target resolves (CodeBuild generates this per-tenant at runtime;
 * the test creates a dummy copy to let kustomize render the base).
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const PRODUCT_KUSTOMIZE_ROOT = path.join(
  process.cwd(),
  'services',
  'application-services',
  'kubernetes',
  'products'
);
const BASE_PATCH_DIR = path.join(PRODUCT_KUSTOMIZE_ROOT, 'base', 'patches');
const TRANSIENT_PATCH = path.join(BASE_PATCH_DIR, 'svc-acc-patch.yaml');
const TEMPLATE_PATCH = path.join(BASE_PATCH_DIR, 'svc-acc-patch-template.yaml');

const DYNAMO_CANONICAL = new Set([
  'TABLE_NAME',
  'AWS_REGION',
  'TENANT_TIER',
  'IAM_ROLE_ARN',
  'REQUEST_TAG_KEYS_MAPPING_ATTRIBUTES',
]);

const POSTGRES_CANONICAL = new Set([
  'IAM_ARN',
  'PROXY_ENDPOINT',
  'CLUSTER_ENDPOINT_RESOURCE',
  'TENANT_NAME',
  'AWS_REGION',
  'TENANT_TIER',
]);

function setupTransientPatch(): void {
  // Create the transient JSON6902 patch file the base kustomization
  // references. CodeBuild pre_build generates this per-tenant.
  const templateContent = fs.readFileSync(TEMPLATE_PATCH, 'utf-8');
  fs.writeFileSync(TRANSIENT_PATCH, templateContent + '  value: test-service-account\n');
}

function teardownTransientPatch(): void {
  if (fs.existsSync(TRANSIENT_PATCH)) {
    fs.unlinkSync(TRANSIENT_PATCH);
  }
}

function kustomizeBuild(overlayName: string): any[] {
  const overlay = path.join(PRODUCT_KUSTOMIZE_ROOT, 'overlays', overlayName);
  const out = execSync(`kubectl kustomize "${overlay}"`, { encoding: 'utf-8' });
  return yaml.loadAll(out);
}

function productDeploymentEnvKeys(overlayName: string): Set<string> {
  const docs = kustomizeBuild(overlayName);
  const deployment = docs.find(
    (d: any) =>
      d && d.kind === 'Deployment' && d.metadata && d.metadata.name === 'product'
  );
  expect(deployment).toBeDefined();
  const env = deployment.spec.template.spec.containers.find(
    (c: any) => c.name === 'product'
  ).env;
  return new Set(env.map((e: any) => e.name));
}

describe('Phase 6 — Kustomize overlay env-var sets (Req 6.*, 7.*)', () => {
  beforeAll(() => setupTransientPatch());
  afterAll(() => teardownTransientPatch());

  test('6.4 — overlays/dynamodb env keys exactly match canonical dynamodb set', () => {
    const keys = productDeploymentEnvKeys('dynamodb');
    expect([...keys].sort()).toEqual([...DYNAMO_CANONICAL].sort());
  });

  test('6.5 — overlays/postgresql env keys exactly match canonical postgresql set', () => {
    const keys = productDeploymentEnvKeys('postgresql');
    expect([...keys].sort()).toEqual([...POSTGRES_CANONICAL].sort());
  });

  test('6.11 (P3) — no env-key leakage between overlays', () => {
    const dynamoKeys = productDeploymentEnvKeys('dynamodb');
    const pgKeys = productDeploymentEnvKeys('postgresql');
    // Dynamo-exclusive keys MUST NOT appear in postgresql overlay.
    for (const k of ['TABLE_NAME', 'IAM_ROLE_ARN', 'REQUEST_TAG_KEYS_MAPPING_ATTRIBUTES']) {
      expect(pgKeys.has(k)).toBe(false);
    }
    // Postgres-exclusive keys MUST NOT appear in dynamodb overlay.
    for (const k of ['IAM_ARN', 'PROXY_ENDPOINT', 'CLUSTER_ENDPOINT_RESOURCE', 'TENANT_NAME']) {
      expect(dynamoKeys.has(k)).toBe(false);
    }
    // AWS_REGION and TENANT_TIER appear in both and are not leakage.
    expect(dynamoKeys.has('AWS_REGION')).toBe(true);
    expect(pgKeys.has('AWS_REGION')).toBe(true);
    expect(dynamoKeys.has('TENANT_TIER')).toBe(true);
    expect(pgKeys.has('TENANT_TIER')).toBe(true);
  });
});
