import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export interface CommonResourcesStackProps extends StackProps {
}

export class CommonResourcesStack extends Stack {
    constructor(scope: Construct, id: string, props: CommonResourcesStackProps) {
        super(scope, id, props);

        this.createPooledDynamoTables();
        this.createCommonDynamoTables();
    }

    private createCommonDynamoTables(): void {
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
    }

    private createPooledDynamoTables(): void {
        new dynamodb.Table(this, 'ProductsTable', {
            tableName: "Product",
            partitionKey: {
                name: "tenantId",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "productId",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // Shared Order table for Basic tier tenants (leading key isolation via ABAC)
        new dynamodb.Table(this, 'OrdersTable', {
            tableName: "Order",
            partitionKey: {
                name: "tenantId",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "orderId",
                type: dynamodb.AttributeType.STRING
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY
        });
    }
}