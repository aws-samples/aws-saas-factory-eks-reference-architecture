/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';
import { TokenVendingMachine } from '@app/auth/token-vending-machine';

@Injectable()
export class ClientFactoryService {
  private irsaClient: DynamoDBDocumentClient;

  /**
   * Returns a DynamoDB client based on tenant tier:
   * - Basic: Shared table with STS AssumeRole (ABAC leading key isolation)
   * - Standard/Premium: Per-tenant table with IRSA (ServiceAccount credentials)
   */
  public async getClient(
    tenantId: string,
    jwtToken: string
  ): Promise<DynamoDBDocumentClient> {
    const tenantTier = process.env.TENANT_TIER || 'standard';

    if (tenantTier.toLowerCase() === 'basic') {
      return this.getAbacClient(jwtToken);
    }
    return this.getIrsaClient();
  }

  /**
   * Basic tier: STS AssumeRole with ABAC tags for leading key isolation
   */
  private async getAbacClient(jwtToken: string): Promise<DynamoDBDocumentClient> {
    const tvm = new TokenVendingMachine(false);
    const credsJson = await tvm.assumeRole(jwtToken, 3600);
    const creds = JSON.parse(credsJson);
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';

    return DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region,
        credentials: {
          accessKeyId: creds.AccessKeyId,
          secretAccessKey: creds.SecretAccessKey,
          sessionToken: creds.SessionToken,
        },
      })
    );
  }

  /**
   * Standard/Premium tier: IRSA credentials from ServiceAccount
   */
  private getIrsaClient(): DynamoDBDocumentClient {
    if (!this.irsaClient) {
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';
      this.irsaClient = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region })
      );
    }
    return this.irsaClient;
  }
}
