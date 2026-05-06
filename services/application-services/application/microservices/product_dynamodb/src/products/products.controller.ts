/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { IstioAuthGuard } from '@app/auth/istio-auth.guard';
import { TenantCredentials } from '@app/auth/auth.decorator';

@Controller('products')
@UseGuards(IstioAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(
    @Body() createProductDto: CreateProductDto,
    @TenantCredentials() tenant,
    @Req() req,
  ) {
    console.log('Create product', tenant);
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    await this.productsService.create(createProductDto, tenant.tenantId, jwtToken);
  }

  @Get()
  async findAll(@TenantCredentials() tenant, @Req() req) {
    console.log('Get products', tenant);
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    return await this.productsService.findAll(tenant.tenantId, jwtToken);
  }

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @TenantCredentials() tenant,
    @Req() req,
  ) {
    console.log('Get One product', tenant);
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    return await this.productsService.findOne(id, tenant.tenantId, jwtToken);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @TenantCredentials() tenant,
    @Req() req,
  ) {
    console.log(tenant);
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    return await this.productsService.update(id, tenant.tenantId, updateProductDto, jwtToken);
  }
}
