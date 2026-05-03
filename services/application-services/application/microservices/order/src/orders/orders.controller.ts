/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TenantCredentials } from '@app/auth/auth.decorator';
import { IstioAuthGuard } from '@app/auth/istio-auth.guard';

@Controller('orders')
@UseGuards(IstioAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @TenantCredentials() tenant,
    @Req() req,
  ) {
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    await this.ordersService.create(createOrderDto, tenant.tenantId, jwtToken);
  }

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get()
  async findAll(@TenantCredentials() tenant, @Req() req) {
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    return await this.ordersService.findAll(tenant?.tenantId, jwtToken);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @TenantCredentials() tenant,
    @Req() req,
  ) {
    const jwtToken = req.headers.authorization?.replace('Bearer ', '') || '';
    return await this.ordersService.findOne(id, tenant?.tenantId, jwtToken);
  }
}
