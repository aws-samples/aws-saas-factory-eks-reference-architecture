/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { IstioAuthGuard } from './istio-auth.guard';

@Module({
  providers: [IstioAuthGuard],
  exports: [IstioAuthGuard],
})
export class AuthModule {}
