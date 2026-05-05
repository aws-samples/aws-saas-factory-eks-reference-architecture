import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';

/**
 * Props for {@link TenantAuthorizer}.
 *
 * All properties are optional; defaults follow the ECS sister reference pattern
 * (`refer/saas-ecs/server/lib/shared-infra/api-gateway.ts`) with EKS-specific
 * adjustments documented in `.kiro/specs/api-gateway-lambda-authorizer/design.md`
 * and `.kiro/specs/spec-driven-api-gateway/design.md`.
 */
export interface TenantAuthorizerProps {
  /**
   * Name of the Identity Provider used to decide which authorizer strategy
   * the Lambda should load. Passed to the Lambda as the JSON environment
   * variable `IDP_DETAILS`.
   *
   * @default 'Cognito'
   */
  readonly idpName?: string;

  /**
   * Reserved for compatibility with the previous `api-gateway-lambda-authorizer`
   * feature. The L2 `apigw.RequestAuthorizer` was removed when this stack
   * switched to a Swagger/SpecRestApi-based API definition — the Swagger
   * `securityDefinitions.sharedApigatewayTenantApiAuthorizer` block now carries
   * the `authorizerResultTtlInSeconds` value directly. Kept in the props
   * interface so upstream callers don't break; currently ignored.
   *
   * @deprecated since `spec-driven-api-gateway`. Edit the Swagger file to
   *   change the cache TTL.
   */
  readonly resultsCacheTtl?: Duration;

  /**
   * Reserved for compatibility. See `resultsCacheTtl`.
   *
   * @deprecated since `spec-driven-api-gateway`.
   */
  readonly authorizerName?: string;
}

/**
 * Python 3.10 Lambda that validates a Cognito JWT and surfaces tenant claims
 * (`custom:tenant-id`, `custom:tenantTier`, `custom:tenantName`,
 * `custom:userRole`) as authorizer context.
 *
 * ## Usage
 *
 * The Lambda is **referenced from `lib/tenant-api.json`** through the
 * `{{authorizer_function}}` placeholder that `lib/api-stack.ts` substitutes
 * at synth time. Callers only need `tenantAuthorizer.lambdaFunction.functionName`
 * (for the placeholder) and `tenantAuthorizer.lambdaFunction` itself (to grant
 * API Gateway permission to invoke it).
 *
 * This construct does **not** create an `apigw.RequestAuthorizer` (L2) —
 * that resource is produced by CloudFormation from the inline Swagger body
 * when `SpecRestApi` synthesizes. See `.kiro/specs/spec-driven-api-gateway/`.
 *
 * The Lambda has no DynamoDB or STS permissions. The tenant's Cognito
 * UserPool is discovered by extracting `iss` from the JWT, matching the ECS
 * sister reference approach.
 *
 * Docker daemon is required locally for CDK synth/deploy because
 * `PythonFunction` bundles dependencies in a Lambda-compatible container.
 */
export class TenantAuthorizer extends Construct {
  /** The underlying Python Lambda function. */
  public readonly lambdaFunction: lambda_python.PythonFunction;

  constructor(scope: Construct, id: string, props: TenantAuthorizerProps = {}) {
    super(scope, id);

    const idpName = props.idpName ?? 'Cognito';

    // --- IAM Role (minimal permissions) --------------------------------------
    // CloudWatch Logs + X-Ray only. No DynamoDB, no STS AssumeRole.
    const role = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description:
        'Execution role for TenantAuthorizer Lambda. Logs + X-Ray only; ' +
        'no DynamoDB, no STS AssumeRole.',
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      })
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        resources: ['*'],
      })
    );

    // --- Python Lambda -------------------------------------------------------
    this.lambdaFunction = new lambda_python.PythonFunction(this, 'Function', {
      entry: path.join(__dirname, '../resources/tenant-authorizer'),
      index: 'tenant_authorizer.py',
      handler: 'lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_10,
      tracing: lambda.Tracing.ACTIVE,
      role,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        IDP_DETAILS: JSON.stringify({ name: idpName }),
      },
    });
  }
}
