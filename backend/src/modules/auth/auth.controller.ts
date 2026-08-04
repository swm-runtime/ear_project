import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { AuthService } from './services/auth.service';
import { LogoutRequestDto } from './dto/logout-request.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token-request.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token-response.dto';
import { SignUpRequestDto } from './dto/sign-up-request.dto';
import { SignUpResponseDto } from './dto/sign-up-response.dto';
import { SocialLoginRequestDto } from './dto/social-login-request.dto';
import { SocialLoginResponseDto } from './dto/social-login-response.dto';

/** auth-api.md 3장 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('social-login')
  @HttpCode(HttpStatus.OK)
  async socialLogin(
    @Body() request: SocialLoginRequestDto,
  ): Promise<SocialLoginResponseDto> {
    const result = await this.authService.socialLogin(
      {
        provider: request.provider,
        providerToken: request.provider_token,
        deviceId: request.device_id,
      },
      new Date(),
    );

    return SocialLoginResponseDto.from(result);
  }

  @Post('sign-up')
  async signUp(@Body() request: SignUpRequestDto): Promise<SignUpResponseDto> {
    const result = await this.authService.signUp(
      {
        signupToken: request.signup_token,
        deviceId: request.device_id,
        consents: request.consents.map((consent) => ({
          consentType: consent.consent_type,
          version: consent.version ?? null,
          isAgreed: consent.is_agreed,
        })),
      },
      new Date(),
    );

    return SignUpResponseDto.from(result);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() request: RefreshTokenRequestDto,
  ): Promise<RefreshTokenResponseDto> {
    const tokens = await this.authService.refresh(
      { refreshToken: request.refresh_token, deviceId: request.device_id },
      new Date(),
    );

    return RefreshTokenResponseDto.from(tokens);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: LogoutRequestDto,
  ): Promise<void> {
    await this.authService.logout(
      { userId: currentUser.id, deviceId: request.device_id },
      new Date(),
    );
  }
}
