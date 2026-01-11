import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RegisterDto,
  RequestOtpDto,
  VerifyOtpDto,
  LoginWithPasswordDto,
  LoginWithOtpDto,
  RefreshTokenDto,
  ResetPasswordDto,
  OtpPurpose,
  TokenResponseDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // =====================================================
  // REGISTRATION
  // =====================================================
  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: dto.phoneNumber },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });

    if (existingUser) {
      if (existingUser.phoneNumber === dto.phoneNumber) {
        throw new ConflictException('Phone number already registered');
      }
      if (dto.email && existingUser.email === dto.email) {
        throw new ConflictException('Email already registered');
      }
    }

    // Hash password if provided
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : null;

    // Create user
    const user = await this.prisma.user.create({
      data: {
        phoneNumber: dto.phoneNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        phoneVerified: false, // Will be verified via OTP
      },
    });

    // Generate OTP for phone verification
    await this.createOtp(dto.phoneNumber, OtpPurpose.REGISTRATION);

    // Log activity
    await this.logActivity(user.id, 'user_registered', { method: 'phone' });

    return {
      message: 'Registration successful. Please verify your phone number.',
      userId: user.id,
    };
  }

  // =====================================================
  // OTP MANAGEMENT
  // =====================================================
  async requestOtp(dto: RequestOtpDto) {
    const { phoneNumber, purpose } = dto;

    // For login/reset, check if user exists
    if (purpose !== OtpPurpose.REGISTRATION) {
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new BadRequestException('Phone number not registered');
      }

      if (user.isBanned) {
        throw new UnauthorizedException('Account is banned');
      }
    }

    // Create and send OTP
    const otp = await this.createOtp(phoneNumber, purpose);

    // In production, send via SMS gateway (Africa's Talking, Twilio, etc.)
    // For now, return in response (ONLY FOR DEVELOPMENT)
    return {
      message: 'OTP sent successfully',
      expiresIn: 300, // 5 minutes
      // Remove this in production!
      ...(this.configService.get('NODE_ENV') === 'development' && { otp: otp.code }),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phoneNumber, code, purpose } = dto;

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phoneNumber,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (otpRecord.attempts >= 3) {
      throw new BadRequestException('Too many attempts. Please request a new OTP');
    }

    if (otpRecord.code !== code) {
      // Increment attempts
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid OTP');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });

    // If registration verification, mark phone as verified
    if (purpose === OtpPurpose.REGISTRATION) {
      const user = await this.prisma.user.update({
        where: { phoneNumber },
        data: { phoneVerified: true },
      });

      // Generate tokens for auto-login after verification
      return this.generateTokens(user);
    }

    // For login purpose, generate tokens
    if (purpose === OtpPurpose.LOGIN) {
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      return this.generateTokens(user);
    }

    return { verified: true };
  }

  private async createOtp(phoneNumber: string, purpose: string) {
    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Invalidate previous OTPs for same phone/purpose
    await this.prisma.otpCode.updateMany({
      where: {
        phoneNumber,
        purpose,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create new OTP (expires in 5 minutes)
    const otp = await this.prisma.otpCode.create({
      data: {
        phoneNumber,
        code,
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return otp;
  }

  // =====================================================
  // LOGIN
  // =====================================================
  async loginWithPassword(dto: LoginWithPasswordDto) {
    const { phoneNumber, password } = dto;

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Account is banned: ' + user.banReason);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.logActivity(user.id, 'login', { method: 'password' });

    return this.generateTokens(user);
  }

  async loginWithOtp(dto: LoginWithOtpDto) {
    // Verify OTP handles the token generation
    return this.verifyOtp({
      phoneNumber: dto.phoneNumber,
      code: dto.code,
      purpose: OtpPurpose.LOGIN,
    });
  }

  // =====================================================
  // TOKEN MANAGEMENT
  // =====================================================
  private async generateTokens(user: any): Promise<TokenResponseDto> {
    const payload = {
      sub: user.id,
      phone: user.phoneNumber,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN') || '15m',
    });

    const refreshToken = uuidv4();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: 'Bearer',
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    // Find valid refresh tokens for comparison
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      include: { user: true },
    });

    // Find matching token
    let validToken = null;
    let user = null;

    for (const token of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isMatch) {
        validToken = token;
        user = token.user;
        break;
      }
    }

    if (!validToken || !user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.isBanned || !user.isActive) {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: validToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    return this.generateTokens(user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Revoke specific token
      const tokens = await this.prisma.refreshToken.findMany({
        where: { userId },
      });

      for (const token of tokens) {
        const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
        if (isMatch) {
          await this.prisma.refreshToken.update({
            where: { id: token.id },
            data: { revokedAt: new Date() },
          });
          break;
        }
      }
    } else {
      // Revoke all tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.logActivity(userId, 'logout');

    return { message: 'Logged out successfully' };
  }

  // =====================================================
  // PASSWORD RESET
  // =====================================================
  async resetPassword(dto: ResetPasswordDto) {
    // Verify OTP first
    await this.verifyOtp({
      phoneNumber: dto.phoneNumber,
      code: dto.code,
      purpose: OtpPurpose.PASSWORD_RESET,
    });

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { phoneNumber: dto.phoneNumber },
      data: { passwordHash },
    });

    // Revoke all refresh tokens for security
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (user) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.logActivity(user.id, 'password_reset');
    }

    return { message: 'Password reset successful. Please login again.' };
  }

  // =====================================================
  // HELPERS
  // =====================================================
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isActive: true,
        isBanned: true,
        phoneVerified: true,
        emailVerified: true,
      },
    });

    if (!user || user.isBanned || !user.isActive) {
      return null;
    }

    return user;
  }

  private async logActivity(
    userId: string,
    action: string,
    details: Record<string, any> = {},
  ) {
    await this.prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
      },
    });
  }
}
