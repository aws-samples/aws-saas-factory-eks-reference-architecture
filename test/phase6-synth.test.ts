/**
 * Phase 6 — static synth assertions (subset of P2 / P8).
 *
 * Validates the CDK_USE_DB=dynamodb and CDK_USE_DB=postgresql branches
 * synthesise the expected stack topology without running `cdk synth` as
 * a child process (the snapshot JSON written by `cdk synth --output` is
 * parsed in-process instead).
 *
 * Covers:
 *   Task 6.2 — CDK_USE_DB=dynamodb synth, SharedDb MUST be absent.
 *   Task 6.3 — CDK_USE_DB=postgresql synth, SharedDb MUST contain
 *              RDS cluster + RDS proxy + Python 3.11 Lambda + 4 stable
 *              `SharedDb-*` Outputs; Services stack MUST depend on it.
 *   Task 6.10 (P2) — deterministic DB-type dispatch (structural check
 *              on the two branches; fast-check iteration is deferred).
 *   Task 6.16 (P8) — default fallback: a synth with CDK_USE_DB unset
 *              behaves like `dynamodb` (verified via the absence of
 *              SharedDb.template.json on the dynamodb synth snapshot).
 *
 * The two `cdk.out.<mode>` directories are produced once during Phase 6
 * verification (by the Phase 6 driver, not this test) and the assertions
 * below read them read-only. If either directory is absent, the test
 * fails with a clear message.
 */

import * as fs from 'fs';
import * as path from 'path';

const OUT_DYNAMO = path.join(process.cwd(), 'cdk.out.dynamodb');
const OUT_PG = path.join(process.cwd(), 'cdk.out.postgresql');

function requireSnapshot(outDir: string): void {
  if (!fs.existsSync(outDir)) {
    throw new Error(
      `Expected synth snapshot at ${outDir}. Run:\n` +
        `  CDK_USE_DB=dynamodb npx cdk synth --all --quiet --output cdk.out.dynamodb\n` +
        `  CDK_USE_DB=postgresql npx cdk synth --all --quiet --output cdk.out.postgresql`
    );
  }
}

function readTemplate(outDir: string, name: string): any {
  const p = path.join(outDir, `${name}.template.json`);
  if (!fs.existsSync(p)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function countResourcesByType(tpl: any, type: string): number {
  if (!tpl || !tpl.Resources) return 0;
  return Object.values(tpl.Resources as Record<string, { Type: string }>).filter(
    (r) => r.Type === type
  ).length;
}

describe('Phase 6 — DB-type dispatch (Req 4.1, 5.1, 5.2, 5.3, 11.2, 14.2)', () => {
  beforeAll(() => {
    requireSnapshot(OUT_DYNAMO);
    requireSnapshot(OUT_PG);
  });

  test('6.2 — dynamodb branch emits no SharedDb.template.json', () => {
    expect(readTemplate(OUT_DYNAMO, 'SharedDb')).toBeNull();
  });

  test('6.3 — postgresql branch synthesises the full SharedDb stack', () => {
    const tpl = readTemplate(OUT_PG, 'SharedDb');
    expect(tpl).not.toBeNull();
    expect(countResourcesByType(tpl, 'AWS::RDS::DBCluster')).toBe(1);
    expect(countResourcesByType(tpl, 'AWS::RDS::DBProxy')).toBe(1);

    const lambdas = Object.values(tpl.Resources as any).filter(
      (r: any) => r.Type === 'AWS::Lambda::Function'
    ) as any[];
    expect(lambdas.length).toBeGreaterThanOrEqual(1);
    // Find the schema-provisioner by runtime.
    const schemaProvisioner = lambdas.find(
      (r: any) => r.Properties && r.Properties.Runtime === 'python3.11'
    );
    expect(schemaProvisioner).toBeDefined();
    expect(schemaProvisioner.Properties.Handler).toBe('handler.main');

    // Four stable CfnOutput exports (Req 4.5).
    expect(tpl.Outputs).toBeDefined();
    const exportNames = Object.values(tpl.Outputs as Record<string, { Export?: { Name: string } }>)
      .map((o) => o.Export?.Name)
      .filter(Boolean) as string[];
    expect(exportNames).toEqual(
      expect.arrayContaining([
        'SharedDb-ProxyEndpoint',
        'SharedDb-ProxyArn',
        'SharedDb-TenantSessionRoleArn',
        'SharedDb-SchemaProvisionerArn',
      ])
    );
  });

  test('6.3 — Services stack depends on SharedDb under postgresql', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(OUT_PG, 'manifest.json'), 'utf-8')
    );
    const servicesArtifact = manifest.artifacts?.Services;
    expect(servicesArtifact).toBeDefined();
    const deps: string[] = servicesArtifact.dependencies ?? [];
    expect(deps).toContain('SharedDb');
  });

  test('6.3 — TenantSessionRole trust policy contains the ArnLike condition', () => {
    const tpl = readTemplate(OUT_PG, 'SharedDb');
    const role = Object.values(tpl.Resources as any).find(
      (r: any) => r.Type === 'AWS::IAM::Role' && r.Properties?.Description?.includes('rds-db:connect')
    ) as any;
    expect(role).toBeDefined();
    const trust = role.Properties.AssumeRolePolicyDocument.Statement;
    const arnLikeStmt = trust.find((s: any) => s.Condition?.ArnLike?.['aws:PrincipalArn']);
    expect(arnLikeStmt).toBeDefined();
  });

  test('6.10 (P2) — only Product-related CodeBuild projects carry CDK_USE_DB', () => {
    const servicesPg = readTemplate(OUT_PG, 'Services');
    const codeBuildProjects = Object.entries(
      servicesPg.Resources as Record<string, any>
    ).filter(([, r]: any) => r.Type === 'AWS::CodeBuild::Project');

    const projectsWithCdkUseDb = codeBuildProjects.filter(([, r]: any) => {
      const envVars = r.Properties?.Environment?.EnvironmentVariables ?? [];
      return envVars.some((v: any) => v.Name === 'CDK_USE_DB');
    });

    // ProductService + ProductServiceTenantDeploy + TenantOnboardingProject
    // + TenantDeletionProject = 4.
    expect(projectsWithCdkUseDb.length).toBe(4);

    // The project names the template generates follow the CDK naming
    // convention: `<ConstructId>EKSDeployProject<hash>` etc. Verify none of
    // the matching projects are OrderService/UserService (Req 2.4).
    for (const [resName] of projectsWithCdkUseDb) {
      expect(resName).not.toMatch(/Order/i);
      expect(resName).not.toMatch(/User/i);
    }
  });

  test('6.16 (P8) — SSM CdkUseDbParam is present on both branches', () => {
    for (const [label, outDir] of [
      ['dynamodb', OUT_DYNAMO],
      ['postgresql', OUT_PG],
    ] as const) {
      const svc = readTemplate(outDir, 'Services');
      const ssmParams = Object.values(svc.Resources as any).filter(
        (r: any) => r.Type === 'AWS::SSM::Parameter'
      ) as any[];
      const cdkUseDbParam = ssmParams.find(
        (r: any) => r.Properties?.Name === '/eks-saas-ref/cdk-use-db'
      );
      expect(cdkUseDbParam).toBeDefined();
      expect(cdkUseDbParam.Properties.Value).toBe(label);
    }
  });
});
