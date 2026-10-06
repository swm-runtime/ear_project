import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { sha256Hex } from '@/common/utils/hash.util';
import { ConsentService } from '@/modules/user/services/consent.service';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider } from '@/modules/user/user.enum';
import { UserService } from '@/modules/user/services/user.service';

import { AuthService } from './auth.service';
import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { SignupAlertService } from './signup-alert.service';
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
  let signupAlertService: SignupAlertService;
  let userService: jest.Mocked<UserService>;
  let consentService: jest.Mocked<ConsentService>;
  let sessionRepository: jest.Mocked<SessionRepository>;
  let deviceTokenService: jest.Mocked<DeviceTokenService>;
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
          profileImageUrl: 'https://k.kakaocdn.net/dn/profile.jpg',
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
      syncProfileImageUrl: jest.fn((user: User) => Promise.resolve(user)),
      grantExistingUserTrial: jest.fn((user: User) => Promise.resolve(user)),
    } as unknown as jest.Mocked<UserService>;

    consentService = {
      findPendingConsents: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<ConsentService>;

    deviceTokenService = {
      invalidateByUserIdAndDeviceId: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<DeviceTokenService>;

    sessionRepository = {
      create: jest.fn((value: Partial<Session>) => value as Session),
      save: jest.fn((value: Session) => Promise.resolve(value)),
      findByRefreshTokenHash: jest.fn(),
      revokeIfActive: jest.fn(() => Promise.resolve(true)),
      revokeAllByUserId: jest.fn(),
      revokeByUserIdAndDeviceId: jest.fn(),
    } as unknown as jest.Mocked<SessionRepository>;

    // 서명한 페이로드를 그대로 돌려주는 목 — signup token 왕복(발급→검증)을 spec 안에서 닫는다
    let lastSignedPayload: unknown;
    const tokenService = new TokenService(
      {
        sign: jest.fn((payload: unknown) => {
          lastSignedPayload = payload;
          return 'signed-token';
        }),
        verify: jest.fn(() => lastSignedPayload),
      } as never,
      { get: jest.fn() } as never,
    );

    // 웹훅이 없으면 꺼진 상태 — spec 에서는 호출만 세고 실제로 나가지 않는다
    signupAlertService = new SignupAlertService(
      new SlackAlertService({ get: jest.fn(() => undefined) } as never),
    );
    jest.spyOn(signupAlertService, 'notify');

    service = new AuthService(
      registry,
      userService,
      consentService,
      tokenService,
      sessionRepository,
      deviceTokenService,
      signupAlertService,
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

    it('기존 계정 로그인마다 제공자 프로필 사진 URL을 최신값으로 맞춘다', async () => {
      // given
      const user = buildUser();
      userService.findByProvider.mockResolvedValue(user);

      // when
      await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );

      // then
      expect(userService.syncProfileImageUrl).toHaveBeenCalledWith(
        user,
        'https://k.kakaocdn.net/dn/profile.jpg',
      );
    });

    it('기존 계정 로그인은 체험 도입 전 가입자 지급을 거친 사용자를 돌려준다', async () => {
      // given — 로그인 응답의 user.tier에 체험이 바로 실려야 한다(subscription.md 4.8)
      const user = buildUser();
      const granted = {
        ...user,
        trialEndsAt: new Date('2026-10-18T19:00:00.000Z'),
      } as User;
      userService.findByProvider.mockResolvedValue(user);
      userService.grantExistingUserTrial.mockResolvedValue(granted);

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
      expect(userService.grantExistingUserTrial).toHaveBeenCalledWith(
        user,
        NOW,
      );
      expect(result).toMatchObject({ status: 'authenticated', user: granted });
    });

    it('가입 시 signup token에 실린 프로필 사진 URL로 계정을 만든다', async () => {
      // given
      userService.findByProvider.mockResolvedValue(null);
      const login = await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );
      if (login.status !== 'consent_required') {
        throw new Error('consent_required를 기대했다');
      }

      // when
      await service.signUp(
        {
          signupToken: login.signupToken,
          deviceId: 'device-1',
          consents: [],
        },
        NOW,
      );

      // then
      expect(userService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          profileImageUrl: 'https://k.kakaocdn.net/dn/profile.jpg',
        }),
        NOW,
      );
    });

    it('계정이 새로 생기면 가입 알림을 부른다', async () => {
      // given
      userService.findByProvider.mockResolvedValue(null);
      const login = await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );
      if (login.status !== 'consent_required')
        throw new Error('consent_required를 기대했다');

      // when
      await service.signUp(
        { signupToken: login.signupToken, deviceId: 'device-1', consents: [] },
        NOW,
      );

      // then
      expect(signupAlertService.notify).toHaveBeenCalledWith(
        SocialProvider.KAKAO,
        NOW,
      );
    });

    it('이미 계정이 있으면 알리지 않는다 — signup token 재호출은 가입이 아니다', async () => {
      // given — 토큰을 받아둔 뒤, 계정이 이미 생긴 상태로 바꾼다
      userService.findByProvider.mockResolvedValue(null);
      const login = await service.socialLogin(
        {
          provider: SocialProvider.KAKAO,
          providerToken: 'token',
          deviceId: 'device-1',
        },
        NOW,
      );
      if (login.status !== 'consent_required')
        throw new Error('consent_required를 기대했다');
      userService.findByProvider.mockResolvedValue({ id: 'user-1' } as never);

      // when
      await service.signUp(
        { signupToken: login.signupToken, deviceId: 'device-1', consents: [] },
        NOW,
      );

      // then — 계정을 만들지도, 알리지도 않는다
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(signupAlertService.notify).not.toHaveBeenCalled();
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

      // then — 폐기는 조건부 UPDATE(revokeIfActive)로 원자적으로 일어난다
      expect(sessionRepository.revokeIfActive).toHaveBeenCalledWith(
        session.id,
        NOW,
      );
      expect(tokens.refreshToken).not.toBe(REFRESH_TOKEN);
    });

    it('동시 갱신 경합에서 지면 재사용으로 판정하지 않고 갱신만 실패시킨다', async () => {
      // given — 같은 토큰으로 겹친 두 요청 중 뒤늦게 폐기를 시도한 쪽
      sessionRepository.findByRefreshTokenHash.mockResolvedValue(
        buildSession(),
      );
      sessionRepository.revokeIfActive.mockResolvedValue(false);

      // when
      const refreshing = service.refresh(
        { refreshToken: REFRESH_TOKEN, deviceId: 'device-1' },
        NOW,
      );

      // then — 전 세션 무효화(탈취 판정)로 번지지 않는다
      await expect(refreshing).rejects.toMatchObject({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      });
      expect(sessionRepository.revokeAllByUserId).not.toHaveBeenCalled();
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

    it('로그아웃하면 그 기기의 푸시 토큰 등록을 무효화한다', async () => {
      // given — 로그아웃한 기기로 이전 사용자의 드립 알림이 가면 안 된다(notification.md 7)
      const command = { userId: USER_ID, deviceId: 'device-1' };

      // when
      await service.logout(command, NOW);

      // then
      expect(
        deviceTokenService.invalidateByUserIdAndDeviceId,
      ).toHaveBeenCalledWith(USER_ID, 'device-1', NOW);
    });
  });
});
