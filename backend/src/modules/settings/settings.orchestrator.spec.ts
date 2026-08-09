import { ConfigService } from '@nestjs/config';

import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { PlanStatus } from '@/modules/subscription/subscription.enum';
import { PlanView } from '@/modules/subscription/subscription.types';
import { User } from '@/modules/user/entities/user.entity';
import { ConsentService } from '@/modules/user/services/consent.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import {
  ConsentType,
  DevicePlatform,
  PlaybackRate,
  SocialProvider,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

import { SettingsSection } from './settings.enum';
import { SettingsOrchestrator } from './settings.orchestrator';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-09T09:00:00.000Z');
/**
 * **두 플랫폼의 값을 일부러 다르게 둔다.** 같은 값으로 두면 플랫폼을 잘못 골라도 테스트가
 * 통과해, 이 분기가 실제로 동작하는지 확인할 수 없다 — Android 심사가 먼저 끝난 상황이다.
 */
const LATEST_VERSION_IOS = '1.4.0';
const LATEST_VERSION_ANDROID = '1.5.0';
const MIN_SUPPORTED_VERSION_IOS = '1.1.0';
const MIN_SUPPORTED_VERSION_ANDROID = '1.2.0';

const APP_VERSIONS: Record<string, string> = {
  LATEST_APP_VERSION_IOS: LATEST_VERSION_IOS,
  LATEST_APP_VERSION_ANDROID: LATEST_VERSION_ANDROID,
  MIN_SUPPORTED_APP_VERSION_IOS: MIN_SUPPORTED_VERSION_IOS,
  MIN_SUPPORTED_APP_VERSION_ANDROID: MIN_SUPPORTED_VERSION_ANDROID,
};

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    provider: SocialProvider.KAKAO,
    nickname: '수현',
    email: 'user@example.com',
    isEmailVerified: false,
    role: UserRole.USER,
    tier: UserTier.LIGHT,
    ...overrides,
  } as User;
}

function buildPlanView(): PlanView {
  return {
    status: PlanStatus.FREE,
    tier: UserTier.LIGHT,
    planName: '라이트',
    dailyPlayLimit: 2,
    renewsAt: null,
    expiresAt: null,
    hasPaymentIssue: false,
  };
}

function buildDefaultSettings() {
  return {
    defaultPlaybackRate: PlaybackRate.NORMAL,
    isAutoExpandEnabled: true,
    isDripNotificationEnabled: true,
  };
}

describe('SettingsOrchestrator', () => {
  let orchestrator: SettingsOrchestrator;
  let userService: jest.Mocked<Pick<UserService, 'getById'>>;
  let userSettingService: jest.Mocked<
    Pick<UserSettingService, 'getSettings' | 'updateSettings'>
  >;
  let consentService: jest.Mocked<
    Pick<ConsentService, 'findCurrentStates' | 'recordConsents'>
  >;
  let subscriptionService: jest.Mocked<
    Pick<SubscriptionService, 'buildPlanView'>
  >;
  let userInterestService: jest.Mocked<
    Pick<UserInterestService, 'buildSummary'>
  >;

  beforeEach(() => {
    userService = { getById: jest.fn().mockResolvedValue(buildUser()) };
    userSettingService = {
      getSettings: jest.fn().mockResolvedValue(buildDefaultSettings()),
      updateSettings: jest.fn().mockResolvedValue(buildDefaultSettings()),
    };
    consentService = {
      findCurrentStates: jest.fn().mockResolvedValue([]),
      recordConsents: jest.fn().mockResolvedValue([]),
    };
    subscriptionService = {
      buildPlanView: jest.fn().mockResolvedValue(buildPlanView()),
    };
    userInterestService = {
      buildSummary: jest.fn().mockResolvedValue({ count: 0, topTopics: [] }),
    };

    const configService = {
      get: jest.fn((key: string) => APP_VERSIONS[key]),
    };

    orchestrator = new SettingsOrchestrator(
      userService as unknown as UserService,
      userSettingService as unknown as UserSettingService,
      consentService as unknown as ConsentService,
      subscriptionService as unknown as SubscriptionService,
      userInterestService as unknown as UserInterestService,
      configService as unknown as ConfigService<never, true>,
    );
  });

  describe('getSummary — 계정', () => {
    it('이메일과 인증 여부를 함께 내려준다', async () => {
      // given — 한쪽만으로는 미등록·미인증·인증됨 세 상태를 구분할 수 없다
      userService.getById.mockResolvedValue(
        buildUser({ email: 'user@example.com', isEmailVerified: false }),
      );

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.account).toMatchObject({
        email: 'user@example.com',
        isEmailVerified: false,
      });
    });

    it('이메일 미등록이면 null로 내려간다', async () => {
      // given
      userService.getById.mockResolvedValue(buildUser({ email: null }));

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then — null은 "등록되지 않음"이며 실패가 아니다
      expect(result.account?.email).toBeNull();
      expect(result.failedSections).toEqual([]);
    });

    it('일반 계정은 관리자 메뉴 노출 플래그가 꺼진다', async () => {
      // given
      userService.getById.mockResolvedValue(buildUser({ role: UserRole.USER }));

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then — role enum을 그대로 내려 클라이언트가 해석하게 하지 않는다
      expect(result.account?.isAdmin).toBe(false);
    });

    it('관리자 계정은 관리자 메뉴 노출 플래그가 켜진다', async () => {
      // given
      userService.getById.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN }),
      );

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.account?.isAdmin).toBe(true);
    });
  });

  describe('getSummary — 마케팅 수신 동의', () => {
    it('consents의 최신 행을 현재 상태로 내려준다', async () => {
      // given — 상태의 소유자는 user_settings가 아니라 consents다(domain.md 3.2)
      const agreedAt = new Date('2026-05-01T09:00:00.000Z');
      consentService.findCurrentStates.mockResolvedValue([
        {
          consentType: ConsentType.MARKETING,
          version: null,
          isAgreed: true,
          agreedAt,
        },
      ]);

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.marketingConsent).toEqual({ isAgreed: true, agreedAt });
    });

    it('동의 행이 없으면 미동의로 본다', async () => {
      // given — 없는 동의를 있다고 읽으면 수신 거부자에게 발송된다
      consentService.findCurrentStates.mockResolvedValue([]);

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.marketingConsent).toEqual({
        isAgreed: false,
        agreedAt: null,
      });
    });
  });

  describe('getSummary — 버전', () => {
    it('앱 버전이 최신보다 낮으면 업데이트 안내를 켠다', async () => {
      // given / when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.3.0',
        DevicePlatform.IOS,
      );

      // then — 비교를 서버가 한다
      expect(result.version).toEqual({
        latestVersion: LATEST_VERSION_IOS,
        minSupportedVersion: MIN_SUPPORTED_VERSION_IOS,
        updateAvailable: true,
      });
    });

    it('앱 버전이 최신과 같으면 업데이트 안내를 끈다', async () => {
      // given / when
      const result = await orchestrator.getSummary(
        USER_ID,
        LATEST_VERSION_IOS,
        DevicePlatform.IOS,
      );

      // then
      expect(result.version.updateAvailable).toBe(false);
    });

    it('최소 지원 버전보다 낮아도 여기서 차단하지 않는다', async () => {
      // given — 강제 업데이트 판정은 스플래시 소관이고 설정은 안내만 한다
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.0.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.version.updateAvailable).toBe(true);
      expect(result.settings).not.toBeNull();
    });

    it('android는 android의 값을 내려준다', async () => {
      // given / when — 같은 요청을 플랫폼만 바꿔 보낸다
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.3.0',
        DevicePlatform.ANDROID,
      );

      // then — 두 값 모두 android 것이다. 최소 지원만 ios에서 오면 화면이 두 값을 나란히 읽을 수 없다
      expect(result.version).toEqual({
        latestVersion: LATEST_VERSION_ANDROID,
        minSupportedVersion: MIN_SUPPORTED_VERSION_ANDROID,
        updateAvailable: true,
      });
    });

    it('같은 앱 버전이라도 플랫폼에 따라 업데이트 안내가 갈린다', async () => {
      // given — android만 1.5.0이 배포됐고 ios는 심사 대기다. 두 사용자 모두 1.4.0을 쓴다
      const [ios, android] = await Promise.all([
        orchestrator.getSummary(USER_ID, '1.4.0', DevicePlatform.IOS),
        orchestrator.getSummary(USER_ID, '1.4.0', DevicePlatform.ANDROID),
      ]);

      // then — ios는 받을 것이 없으므로 배지를 띄우지 않는다. 단일 값 판정이 틀리는 지점이다
      expect(ios.version.updateAvailable).toBe(false);
      expect(android.version.updateAvailable).toBe(true);
    });
  });

  describe('getSummary — 설정값', () => {
    it('설정 행이 없는 사용자도 기본값을 받는다', async () => {
      // given — 조회가 쓰기를 유발하지 않는다. 행 생성은 첫 PATCH다
      userSettingService.getSettings.mockResolvedValue(buildDefaultSettings());

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.settings).toEqual({
        defaultPlaybackRate: PlaybackRate.NORMAL,
        isAutoExpandEnabled: true,
        isDripNotificationEnabled: true,
      });
    });
  });

  describe('getSummary — 부분 실패', () => {
    it('구독 조회만 실패하면 플랜만 비우고 나머지는 정상 응답한다', async () => {
      // given
      subscriptionService.buildPlanView.mockRejectedValue(new Error('db down'));

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then — 서버 값이 필요 없는 메뉴는 계속 동작해야 한다
      expect(result.plan).toBeNull();
      expect(result.failedSections).toEqual([SettingsSection.PLAN]);
      expect(result.account).not.toBeNull();
      expect(result.settings).not.toBeNull();
    });

    it('계정 조회만 실패하면 관리자 메뉴가 노출되지 않는다', async () => {
      // given — 안전한 기본값은 false다(settings-api.md 4.1)
      userService.getById.mockRejectedValue(new Error('db down'));

      // when
      const result = await orchestrator.getSummary(
        USER_ID,
        '1.4.0',
        DevicePlatform.IOS,
      );

      // then
      expect(result.account).toBeNull();
      expect(result.failedSections).toEqual([SettingsSection.ACCOUNT]);
    });

    it('설정값 조회가 실패하면 응답 전체가 실패한다', async () => {
      // given — 토글 기준값이 없으면 낙관적 UI를 시작할 수 없다
      userSettingService.getSettings.mockRejectedValue(new Error('db down'));

      // when / then
      await expect(
        orchestrator.getSummary(USER_ID, '1.4.0', DevicePlatform.IOS),
      ).rejects.toThrow();
    });
  });

  describe('updateSettings', () => {
    it('보낸 필드만 user 모듈에 넘긴다', async () => {
      // given — 보내지 않은 필드는 건드리지 않는다
      const updated = {
        ...buildDefaultSettings(),
        isDripNotificationEnabled: false,
      };
      userSettingService.updateSettings.mockResolvedValue(updated);

      // when
      const result = await orchestrator.updateSettings(USER_ID, {
        isDripNotificationEnabled: false,
      });

      // then
      expect(userSettingService.updateSettings).toHaveBeenCalledWith(USER_ID, {
        isDripNotificationEnabled: false,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('recordMarketingConsent', () => {
    it('철회도 행을 추가한다 — 기존 행을 갱신하지 않는다', async () => {
      // given — append-only다(domain.md 3.2). UPDATE 하면 이력 테이블이 아니게 된다
      consentService.findCurrentStates.mockResolvedValue([
        {
          consentType: ConsentType.MARKETING,
          version: null,
          isAgreed: false,
          agreedAt: NOW,
        },
      ]);

      // when
      const result = await orchestrator.recordMarketingConsent(
        USER_ID,
        false,
        NOW,
      );

      // then
      expect(consentService.recordConsents).toHaveBeenCalledWith(
        USER_ID,
        [
          {
            consentType: ConsentType.MARKETING,
            version: null,
            isAgreed: false,
          },
        ],
        NOW,
      );
      expect(result).toEqual({ isAgreed: false, agreedAt: NOW });
    });

    it('같은 값이 다시 와도 행을 추가한다', async () => {
      // given — 재동의가 "같은 값의 새 행"으로 표현되므로 스킵하면 2년 재확인 기산점이 안 밀린다
      consentService.findCurrentStates.mockResolvedValue([
        {
          consentType: ConsentType.MARKETING,
          version: null,
          isAgreed: true,
          agreedAt: NOW,
        },
      ]);

      // when
      await orchestrator.recordMarketingConsent(USER_ID, true, NOW);

      // then
      expect(consentService.recordConsents).toHaveBeenCalledTimes(1);
    });
  });
});
