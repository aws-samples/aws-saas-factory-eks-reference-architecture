/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NestFactory } from '@nestjs/core';
import { ProductsModule } from './products/products.module';

async function bootstrap () {
  const app = await NestFactory.create(ProductsModule);
  app.setGlobalPrefix('/');
  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    methods: '*'
  });
  await app.listen(3010);
}
bootstrap();
