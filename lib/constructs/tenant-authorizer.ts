import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';

/**
 * Props for {@link TenantAuthorizer}.
 *
 * All properties are optional; defaults follow the ECS sister reference pattern
 * (`refer/saas-ecs/server/lib/shared-infra/api-gateway.ts`) with EKS-specific
 * adjustments documented in `.kiro/specs/api-gateway-lambda-authorizer/design.md`.
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
   * Logical name assigned to the API Gateway REQUEST Authorizer.
   *
   * @default 'TenantAuthorizer'
   */
  readonly authorizerName?: string;

  /**
   * API Gateway authorizer result cache TTL. Per design §Deferred decisions,
   * 300 seconds balances revocation latency against Lambda invocation count.
   *
   * @default Duration.seconds(300)
   */
  readonly resultsCacheTtl?: Duration;
}

/**
 * API Gateway REQUEST Authorizer (Python Lambda) that validates a Cognito JWT
 * and surfaces tenant claims (`custom:tenant-id`, `custom:tenantTier`,
 * `custom:tenantName`, `custom:userRole`) as authorizer context for
 * downstream integration-request header injection.
 *
 * The Lambda has **no** DynamoDB or STS permissions (see Requirements 7.4 /
 * 15.6). The tenant's Cognito UserPool is discovered by extracting
 * `iss` from the JWT, matching the ECS sister reference approach.
 *
 * Docker daemon is required locally for CDK synth/deploy because
 * `PythonFunction` bundles dependencies in a Lambda-compatible container.
 */
export class TenantAuthorizer extends Construct {
  /** The REQUEST Authorizer ready to be attached to an API Gateway method. */
  public readonly authorizer: apigw.RequestAuthorizer;

  /** The underlying Python Lambda function. Exposed for log/metric wiring. */
  public readonly lambdaFunction: lambda_python.PythonFunction;

  constructor(scope: Construct, id: string, props: TenantAuthorizerProps = {}) {
    super(scope, id);

    const idpName = props.idpName ?? 'Cognito';
    const authorizerName = props.authorizerName ?? 'TenantAuthorizer';
    const resultsCacheTtl = props.resultsCacheTtl ?? Duration.seconds(300);

    // --- IAM Role (minimal permissions) --------------------------------------
    // CloudWatch Logs + X-Ray only. No DynamoDB, no STS AssumeRole.
    const role = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description:
        'Execution role for TenantAuthorizer Lambda. Logs + X-Ray only; ' +
        'no DynamoDB, no STS AssumeRole (Requirements 7.4 / 15.6).',
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

    // --- API Gateway REQUEST Authorizer --------------------------------------
    this.authorizer = new apigw.RequestAuthorizer(this, 'Authorizer', {
      handler: this.lambdaFunction,
      identitySources: [apigw.IdentitySource.header('Authorization')],
      resultsCacheTtl,
      authorizerName,
    });
  }
}
