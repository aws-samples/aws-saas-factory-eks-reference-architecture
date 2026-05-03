/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { ClientFactoryService } from './client-factory.service';

@Module({
  providers: [ClientFactoryService],
  exports: [ClientFactoryService]
})
export class ClientFactoryModule {}
