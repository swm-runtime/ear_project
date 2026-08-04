import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { sha256Hex } from '@/common/utils/hash.util';
import { ConsentService } from '@/modules/user/services/consent.service';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider } from '@/modules/user/user.enum';
import { UserService } from '@/modules/user/services/user.service';

import { AuthService } from './auth.service';
import { SocialProviderClient } from '../providers/social-provider.client';
import { SocialProviderRegistry } from '../providers/social-provider.registry';
import { Session } from '../session.entity';
import { SessionRepository } from '../session.repository';
import { TokenService } from './token.service';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-04T09:00:00.000Z');
const REFRESH_TOKEN = 'refresh-token-value';

function buildUser(): User {
  return {
    id: USER_ID,
    provider: SocialProvider.KAKAO,
    providerUserId: 'kakao-1',
    role: 'user',
  } as User;
}

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    userId: USER_ID,
    refreshTokenHash: sha256Hex(REFRESH_TOKEN),
    deviceId: 'device-1',
    issuedAt: new Date(NOW.getTime() - 1000),
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    ...overrides,
  } as Session;
}

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let consentService: jest.Mocked<ConsentService>;
  let sessionRepository: jest.Mocked<SessionRepository>;
  let providerClient: jest.Mocked<SocialProviderClient>;

  beforeEach(() => {
    providerClient = {
      provider: SocialProvider.KAKAO,
      fetchProfile: jest.fn(() =>
        Promise.resolve({
          providerUserId: 'kakao-1',
          email: 'user@example.com',
          isEmailVerified: true,
          nickname: '지훈',
        }),
      ),
    } as unknown as jest.Mocked<SocialProviderClient>;

    const registry = {
      get: jest.fn(() => providerClient),
    } as unknown as SocialProviderRegistry;

    userService = {
      findByProvider: jest.fn(() => Promise.resolve(null)),
      getById: jest.fn(() => Promise.resolve(buildUser())),
      createUser: jest.fn(() => Promise.resolve(buildUser())),
    } as unknown as jest.Mocked<UserService>;

    consentService = {
      findPendingConsents: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<ConsentService>;

    sessionRepository = {
      create: jest.fn((value: Partial<Session>) => value as Session),
      save: jest.fn((value: Session) => Promise.resolve(value)),
      findByRefreshTokenHash: jest.fn(),
      revokeAllByUserId: jest.fn(),
      revokeByUserIdAndDeviceId: jest.fn(),
    } as unknown as jest.Mocked<SessionRepository>;

    const tokenService = new TokenService({
      sign: jest.fn(() => 'signed-token'),
      verify: jest.fn(),
    } as never);

    service = new AuthService(
      registry,
      userService,
      consentService,
      tokenService,
      sessionRepository,
    );
  });

  describe('socialLogin', () => {
    it('기존 계정이 없으면 계정을 만들지 않고 약관 동의를 요구한다', async () => {
      // given
      userService.findByProvider.mockResolvedValue(null);

      // when
      const result = await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );

      // then
      expect(result.status).toBe('consent_required');
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('기존 계정이 있으면 세션을 만들고 토큰을 발급한다', async () => {
      // given
      userService.findByProvider.mockResolvedValue(buildUser());

      // when
      const result = await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );

      // then
      expect(result.status).toBe('authenticated');
      expect(sessionRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('갱신하면 이전 세션을 폐기하고 새 refresh token을 발급한다', async () => {
      // given
      const session = buildSession();
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);

      // when
      const tokens = await service.refresh(
        { refreshToken: REFRESH_TOKEN, deviceId: 'device-1' },
        NOW,
      );

      // then
      expect(session.revokedAt).toEqual(NOW);
      expect(tokens.refreshToken).not.toBe(REFRESH_TOKEN);
    });

    it('이미 회전된 토큰이 다시 오면 해당 사용자 세션 전체를 무효화한다', async () => {
      // given
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(
        buildSession({ revokedAt: new Date(NOW.getTime() - 5000) }),
      );

      // when
      const refreshing = service.refresh(
        { refreshToken: REFRESH_TOKEN, deviceId: 'device-1' },
        NOW,
      );

      // then
      await expect(refreshing).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REUSED,
      });
      expect(sessionRepository.revokeAllByUserId).toHaveBeenCalledWith(
        USER_ID,
        NOW,
      );
    });

    it('만료된 refresh token은 재갱신 여지 없이 실패시킨다', async () => {
      // given
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(
        buildSession({ expiresAt: new Date(NOW.getTime() - 1000) }),
      );

      // when
      const refreshing = service.refresh(
        { refreshToken: REFRESH_TOKEN, deviceId: 'device-1' },
        NOW,
      );

      // then
      await expect(refreshing).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      });
    });

    it('존재하지 않는 refresh token은 실패시킨다', async () => {
      // given
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

      // when
      const refreshing = service.refresh(
        { refreshToken: REFRESH_TOKEN, deviceId: 'device-1' },
        NOW,
      );

      // then
      await expect(refreshing).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      });
    });
  });

  describe('logout', () => {
    it('로그아웃하면 해당 기기 세션만 폐기한다', async () => {
      // given
      const command = { userId: USER_ID, deviceId: 'device-1' };

      // when
      await service.logout(command, NOW);

      // then
      expect(sessionRepository.revokeByUserIdAndDeviceId).toHaveBeenCalledWith(
        USER_ID,
        'device-1',
        NOW,
      );
      expect(sessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
    });
  });
});
