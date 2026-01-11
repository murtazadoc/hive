import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/public.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =====================================================
  // PROFILE MANAGEMENT
  // =====================================================
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile', type: UserResponseDto })
  async getProfile(@UserId() userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated', type: UserResponseDto })
  async updateProfile(
    @UserId() userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // =====================================================
  // BUSINESSES
  // =====================================================
  @Get('businesses')
  @ApiOperation({ summary: 'Get all businesses for current user (owned & member)' })
  @ApiResponse({ status: 200, description: 'User businesses' })
  async getUserBusinesses(@UserId() userId: string) {
    return this.usersService.getUserBusinesses(userId);
  }

  // =====================================================
  // CONTEXT SWITCHER
  // =====================================================
  @Get('contexts')
  @ApiOperation({ summary: 'Get available contexts for context switcher' })
  @ApiResponse({ status: 200, description: 'Available contexts (personal + businesses)' })
  async getAvailableContexts(@UserId() userId: string) {
    return this.usersService.getAvailableContexts(userId);
  }

  // =====================================================
  // ACTIVITY LOG
  // =====================================================
  @Get('activity')
  @ApiOperation({ summary: 'Get user activity log' })
  @ApiResponse({ status: 200, description: 'Activity log entries' })
  async getActivityLog(
    @UserId() userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getActivityLog(userId, limit);
  }

  // =====================================================
  // ACCOUNT DELETION
  // =====================================================
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user account' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 409, description: 'Cannot delete - transfer businesses first' })
  async deleteAccount(@UserId() userId: string) {
    return this.usersService.deleteAccount(userId);
  }
}
