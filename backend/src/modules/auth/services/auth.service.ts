import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { sha256Hex } from '@/common/utils/hash.util';
import { ConsentService } from '@/modules/user/services/consent.service';
import { User } from '@/modules/user/entities/user.entity';
import {
  CURRENT_CONSENT_VERSIONS,
  REQUIRED_CONSENT_TYPES,
} from '@/modules/user/user.constant';
import { ConsentType } from '@/modules/user/user.enum';
import { UserService } from '@/modules/user/services/user.service';

import { DEFAULT_NICKNAME } from '../auth.constant';
import {
  AuthenticatedResult,
  IssuedTokens,
  LogoutCommand,
  RefreshTokenCommand,
  SignUpCommand,
  SocialLoginCommand,
  SocialLoginResult,
} from '../auth.types';
import { SocialProviderRegistry } from '../providers/social-provider.registry';
import { SessionRepository } from '../session.repository';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly socialProviderRegistry: SocialProviderRegistry,
    private readonly userService: UserService,
    private readonly consentService: ConsentService,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  /**
   * auth-api.md 4.1 — 소셜 토큰을 검증하고 기존 계정 여부를 판정한다.
   * **신규는 이 시점에 계정을 만들지 않는다.** 계정은 약관 동의(4.2)에서 생성된다.
   */
  async socialLogin(
    command: SocialLoginCommand,
    now: Date,
  ): Promise<SocialLoginResult> {
    const client = this.socialProviderRegistry.get(command.provider);
    const profile = await client.fetchProfile(command.providerToken);

    const user = await this.userService.findByProvider(
      command.provider,
      profile.providerUserId,
    );

    if (!user) {
      const signupToken = this.tokenService.issueSignupToken(
        command.provider,
        profile,
        now,
      );
      this.logger.log('social login requires consent', {
        provider: command.provider,
      });

      return {
        status: 'consent_required',
        signupToken: signupToken.token,
        signupTokenExpiresAt: signupToken.expiresAt,
        requiredConsents: [
          ...REQUIRED_CONSENT_TYPES.map((consentType) => ({
            consentType,
            version: CURRENT_CONSENT_VERSIONS[consentType],
            isRequired: true,
          })),
          {
            consentType: ConsentType.MARKETING,
            version: CURRENT_CONSENT_VERSIONS[ConsentType.MARKETING],
            isRequired: false,
          },
        ],
      };
    }

    const tokens = await this.issueSession(user, command.deviceId, now);
    this.logger.log('social login succeeded', {
      provider: command.provider,
      user_id: user.id,
    });

    return {
      status: 'authenticated',
      tokens,
      user,
      pendingConsents: await this.consentService.findPendingConsents(user.id),
    };
  }

  /** auth-api.md 4.2 — 약관 동의를 기록하고 계정을 생성한다 */
  async signUp(
    command: SignUpCommand,
    now: Date,
  ): Promise<AuthenticatedResult> {
    const payload = this.tokenService.verifySignupToken(command.signupToken);

    const existing = await this.userService.findByProvider(
      payload.provider,
      payload.providerUserId,
    );

    // 같은 signup token으로 두 번 호출된 경우 계정을 또 만들지 않는다
    const user =
      existing ??
      (await this.userService.createUser(
        {
          provider: payload.provider,
          providerUserId: payload.providerUserId,
          email: payload.email,
          isEmailVerified: payload.isEmailVerified,
          nickname: payload.nickname ?? DEFAULT_NICKNAME,
          consents: command.consents,
        },
        now,
      ));

    const tokens = await this.issueSession(user, command.deviceId, now);
    this.logger.log('sign up completed', {
      provider: payload.provider,
      user_id: user.id,
    });

    return {
      status: 'authenticated',
      tokens,
      user,
      pendingConsents: await this.consentService.findPendingConsents(user.id),
    };
  }

  /**
   * auth-api.md 4.3 — 갱신 시 refresh token을 **회전**한다.
   * 이미 회전된 토큰이 다시 오면 탈취로 보고 해당 사용자 세션 전체를 무효화한다.
   */
  async refresh(
    command: RefreshTokenCommand,
    now: Date,
  ): Promise<IssuedTokens> {
    const refreshTokenHash = sha256Hex(command.refreshToken);
    const session =
      await this.sessionRepository.findByRefreshTokenHash(refreshTokenHash);

    if (!session) {
      throw this.refreshTokenInvalid();
    }

    if (session.revokedAt) {
      await this.sessionRepository.revokeAllByUserId(session.userId, now);
      this.logger.error('refresh token reuse detected', undefined, {
        user_id: session.userId,
      });

      throw new BusinessException({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REUSED,
        message: '다시 로그인해주세요',
        logLevel: 'error',
      });
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      throw this.refreshTokenInvalid();
    }

    const user = await this.userService.getById(session.userId);

    session.revokedAt = now;
    await this.sessionRepository.save(session);

    return this.issueSession(user, command.deviceId, now);
  }

  /** auth-api.md 4.4 — 해당 기기 세션만 폐기한다. 다른 기기 세션은 유지된다 */
  async logout(command: LogoutCommand, now: Date): Promise<void> {
    await this.sessionRepository.revokeByUserIdAndDeviceId(
      command.userId,
      command.deviceId,
      now,
    );

    // TODO(notification 모듈 도입 시): 푸시 토큰(`device_tokens`) 등록도 함께 해제한다 (auth.md 4.2)
    this.logger.log('logout completed', { user_id: command.userId });
  }

  private async issueSession(
    user: User,
    deviceId: string,
    now: Date,
  ): Promise<IssuedTokens> {
    const accessToken = this.tokenService.issueAccessToken(user, now);
    const refreshToken = this.tokenService.issueRefreshToken(now);

    await this.sessionRepository.save(
      this.sessionRepository.create({
        userId: user.id,
        // 원문 토큰을 저장하지 않는다 (domain.md 3.3)
        refreshTokenHash: sha256Hex(refreshToken.token),
        deviceId,
        issuedAt: now,
        expiresAt: refreshToken.expiresAt,
      }),
    );

    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken: refreshToken.token,
    };
  }

  /** 갱신 실패는 재갱신 여지 없이 명확히 실패시킨다 (architecture.md 9.1 — 무한 루프 방지) */
  private refreshTokenInvalid(): BusinessException {
    return new BusinessException({
      status: HttpStatus.UNAUTHORIZED,
      errorCode: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      message: '다시 로그인해주세요',
    });
  }
}
