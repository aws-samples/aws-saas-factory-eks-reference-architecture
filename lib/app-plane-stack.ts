import {
  CoreApplicationPlane,
  TenantLifecycleScriptJobProps,
  EventManager,
  ProvisioningScriptJob,
  DeprovisioningScriptJob
} from '@cdklabs/sbt-aws';
import { Stack, StackProps } from 'aws-cdk-lib';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';

export interface AppPlaneStackProps extends StackProps {
  readonly eventBusArn: string;
}

export class AppPlaneStack extends Stack {
  constructor(scope: Construct, id: string, props: AppPlaneStackProps) {
    super(scope, id, props);

    let eventBus;
    let eventManager;
    if (props?.eventBusArn) {
      eventBus = EventBus.fromEventBusArn(this, 'EventBus', props.eventBusArn);
      eventManager = new EventManager(this, 'EventManager', {
        eventBus: eventBus,
      });
    } else {
      eventManager = new EventManager(this, 'EventManager');
    }

    const provisioningJobRunnerProps: TenantLifecycleScriptJobProps = {
      eventManager,
      permissions: new PolicyDocument({
        statements: [
          new PolicyStatement({
            actions: ['*'],
            resources: ['*'],
            effect: Effect.ALLOW,
          }),
        ],
      }),
      script: fs.readFileSync('./scripts/provisioning.sh', 'utf8'),
      postScript: '',
      environmentStringVariablesFromIncomingEvent: [
        'tenantId',
        'tier',
        'tenantName',
        'email',
        'tenantStatus',
      ],
      environmentVariablesToOutgoingEvent: {
        tenantData: ['tenantConfig', 'tenantStatus'],
        tenantRegistrationData: ['registrationStatus'],
      }
      
    };

    const deprovisioningJobRunnerProps: TenantLifecycleScriptJobProps = {
      eventManager,
      permissions: new PolicyDocument({
        statements: [
          new PolicyStatement({
            actions: ['*'],
            resources: ['*'],
            effect: Effect.ALLOW,
          }),
        ],
      }),
      script: fs.readFileSync('./scripts/deprovisioning.sh', 'utf8'),
      environmentStringVariablesFromIncomingEvent: ['tenantId', 'tier'],
      environmentVariablesToOutgoingEvent: {
        tenantRegistrationData: ['registrationStatus']
      },
      
    };

    const provisioningScriptJob: ProvisioningScriptJob = new ProvisioningScriptJob(
      this,
      'provisioningScriptJob',
      provisioningJobRunnerProps
    );
    const deprovisioningScriptJob: DeprovisioningScriptJob = new DeprovisioningScriptJob(
      this,
      'deprovisioningScriptJob',
      deprovisioningJobRunnerProps
    );

    new CoreApplicationPlane(this, 'CoreApplicationPlane', {
      eventManager: eventManager,
      scriptJobs: [provisioningScriptJob, deprovisioningScriptJob]
    });
  }
}
