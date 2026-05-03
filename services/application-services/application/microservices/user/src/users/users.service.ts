/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { type UserDto } from './dto/user.dto';
import { type UpdateUserDto } from './dto/update-user.dto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  ListUsersInGroupCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
  GetGroupCommand,
  CreateGroupCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UserInfo } from './entities/user.entity';

@Injectable()
export class UsersService {
  cognitoClient: CognitoIdentityProviderClient =
    new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

  userPoolId: string = process.env.COGNITO_USER_POOL_ID;

  async create(userDto: UserDto, tenantId: string, tenantTier: string, tenantName: string) {
    console.log('Creating user:', userDto);
    try {
      await this.cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: userDto.userEmail,
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email', Value: userDto.userEmail },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:tenant-id', Value: tenantId },
            { Name: 'custom:userRole', Value: userDto.userRole || 'TenantUser' },
            { Name: 'custom:tenantTier', Value: tenantTier },
            { Name: 'custom:tenantName', Value: tenantName },
          ],
        })
      );

      // Ensure tenant group exists
      const groupInput = { GroupName: tenantId, UserPoolId: this.userPoolId };
      try {
        await this.cognitoClient.send(new GetGroupCommand(groupInput));
      } catch {
        await this.cognitoClient.send(
          new CreateGroupCommand({
            ...groupInput,
            Description: `${tenantId}'s group`,
            Precedence: 0,
          })
        );
      }

      await this.cognitoClient.send(
        new AdminAddUserToGroupCommand({
          ...groupInput,
          Username: userDto.userEmail,
        })
      );

      return { message: 'User created successfully' };
    } catch (error) {
      console.error(error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAll(tenantId: string) {
    console.log('Getting All Users for Tenant:', tenantId);
    try {
      // Ensure tenant group exists before listing
      try {
        await this.cognitoClient.send(
          new GetGroupCommand({ GroupName: tenantId, UserPoolId: this.userPoolId })
        );
      } catch {
        // Group doesn't exist yet — return empty list
        return [];
      }

      const response = await this.cognitoClient.send(
        new ListUsersInGroupCommand({
          UserPoolId: this.userPoolId,
          GroupName: tenantId,
        })
      );

      const users: UserInfo[] = [];
      for (const user of response.Users || []) {
        const attrs = (user.Attributes || []).reduce(
          (acc, { Name, Value }) => ({ ...acc, [Name]: Value }),
          {} as Record<string, string>
        );

        const userInfo = new UserInfo();
        userInfo.username = user.Username;
        userInfo.email = attrs['email'];
        userInfo.user_role = attrs['custom:userRole'];
        userInfo.status = user.UserStatus;
        userInfo.enabled = user.Enabled;
        userInfo.created = user.UserCreateDate;
        userInfo.modified = user.UserLastModifiedDate;
        users.push(userInfo);
      }
      return users;
    } catch (error) {
      console.error(error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOne(userName: string) {
    try {
      const response = await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: userName,
        })
      );
      return response;
    } catch (error) {
      console.error(error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async update(userName: string, updateUserDto: UpdateUserDto) {
    try {
      await this.cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: this.userPoolId,
          Username: userName,
          UserAttributes: [
            { Name: 'email', Value: updateUserDto.userEmail },
          ],
        })
      );
      return updateUserDto;
    } catch (error) {
      console.error(error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async delete(username: string) {
    try {
      await this.cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: this.userPoolId,
          Username: username,
        })
      );
      return { message: 'User deleted successfully' };
    } catch (error) {
      console.error(error);
      throw new HttpException(
        { status: HttpStatus.INTERNAL_SERVER_ERROR, error },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
