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
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserDto } from './dto/user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { IstioAuthGuard } from '@app/auth/istio-auth.guard';
import { TenantCredentials } from '@app/auth/auth.decorator';

@Controller('users')
@UseGuards(IstioAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() userDto: UserDto, @TenantCredentials() tenant) {
    return await this.usersService.create(userDto, tenant.tenantId, tenant.tenantTier, tenant.tenantName);
  }

  @Get()
  async findAll(@TenantCredentials() tenant) {
    return await this.usersService.findAll(tenant.tenantId);
  }

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get(':id')
  async findOne(@Param('id') username: string) {
    return await this.usersService.findOne(username);
  }

  @Put(':id')
  async update(
    @Param('id') username: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.usersService.update(username, updateUserDto);
  }

  @Delete(':id')
  async remove(@Param('id') username: string) {
    return await this.usersService.delete(username);
  }
}
