import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ipTracker } from '@/common/guards/rate-limit.guard';
import {
  RATE_LIMIT_AUTH_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '@/common/rate-limit.constant';

import { AuthService } from './services/auth.service';

/**
 * 인증 라우트 한도(architecture.md 9.6) — 사용자가 아직 없으니 **IP**로 센다.
 * 전역 가드가 토큰을 보고 사용자로 세는 규칙을 여기서는 명시적으로 끈다:
 * 갱신 요청은 유효한 access token을 들고 올 수 있어 그대로 두면 IP 한도가 비켜 간다.
 */
const AUTH_THROTTLE = {
  default: {
    limit: RATE_LIMIT_AUTH_PER_MINUTE,
    ttl: RATE_LIMIT_WINDOW_MS,
    getTracker: ipTracker,
  },
};
import { LogoutRequestDto } from './dto/logout-request.dto';
import { PipelineLoginRequestDto } from './dto/pipeline-login-request.dto';
import { PipelineLoginResponseDto } from './dto/pipeline-login-response.dto';
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
  @Throttle(AUTH_THROTTLE)
  async socialLogin(
    @Body() request: SocialLoginRequestDto,
  ): Promise<SocialLoginResponseDto> {
    const result = await this.authService.socialLogin(
      {
        provider: request.provider,
        providerToken: request.provider_token,
        deviceId: request.device_id,
        nonce: request.nonce,
      },
      new Date(),
    );

    return SocialLoginResponseDto.from(result);
  }

  /** 파이프라인 웹 SSO — 서버 간 어서션으로 관리자 세션 발급 (changes/pending/pipeline-sso-login.md) */
  @Post('pipeline-login')
  @HttpCode(HttpStatus.OK)
  async pipelineLogin(
    @Body() request: PipelineLoginRequestDto,
  ): Promise<PipelineLoginResponseDto> {
    const tokens = await this.authService.pipelineLogin(
      { assertion: request.assertion, deviceId: request.device_id },
      new Date(),
    );

    return PipelineLoginResponseDto.from(tokens);
  }

  /**
   * 재시도로 계정이 두 개 생기지 않게 한다 (auth-api.md 3장 ★).
   *
   * **멱등 캐시를 쓰지 않는다.** 응답에 `refresh_token` 원문이 실려 있어, 캐시에 넣으면
   * `idempotency_keys.response_body`에 **평문 30일짜리 자격증명이 남는다** —
   * `sessions`가 해시만 저장하는 이유(domain.md 3.3)를 이 한 테이블이 무력화한다.
   *
   * 그러면서 중복 방지에 보태는 것도 없다. 순차 재시도는 `signUp`의
   * `findByProvider` → `existing ?? createUser`가 막고, 동시 요청은
   * `uq_users_provider_provider_user_id`가 막는다(`UserService.createUser`가 흡수한다).
   * `Idempotency-Key` 헤더는 계속 받는다 — 클라이언트의 5xx 자동 재시도 조건이다.
   */
  @Post('sign-up')
  @Throttle(AUTH_THROTTLE)
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
  @Throttle(AUTH_THROTTLE)
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
