import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface CommonResourcesStackProps extends StackProps {
    readonly seedData: {
        appSiteDomain: string
        appCloudFrontId: string
        appHostedZoneId?: string
    }
}

export class CommonResourcesStack extends Stack {
    constructor(scope: Construct, id: string, props: CommonResourcesStackProps) {
        super(scope, id, props);

        this.createPooledDynamoTables();
        this.createCommonDynamoTables(props.seedData.appSiteDomain, props.seedData.appCloudFrontId, props.seedData.appHostedZoneId);
    }

    private createCommonDynamoTables(appSiteDomain: string, appCloudFrontId: string, appHostedZoneId?: string): void {
        const tenantTable = new dynamodb.Table(this, 'TenantTable', {
            tableName: "Tenant",
            partitionKey: {
                name: "TENANT_ID",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // TODO: address if we actually need this table any more.
        const metadataTable = new dynamodb.Table(this, 'MetadataTable', {
            tableName: "SAAS_PROVIDER_METADATA",
            partitionKey: {
                name: "DOMAIN_NAME",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });


        // put metadata
        const seedDataEntry = new cr.AwsCustomResource(this, 'initDBResource', {
            onCreate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: metadataTable.tableName,
                    Item: {
                        DOMAIN_NAME: { S: appSiteDomain },
                        HOSTED_ZONE_ID: { S: appHostedZoneId ?? "" },
                        APP_CLOUDFRONT_ID: { S: appCloudFrontId }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of('initDBData'),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [metadataTable.tableArn] }),
        });

        seedDataEntry.node.addDependency(metadataTable);
    }

    private createPooledDynamoTables(): void {
        new dynamodb.Table(this, 'ProductsTable', {
            tableName: "Product",
            partitionKey: {
                name: "TenantId",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "ProductId",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });
    }
}