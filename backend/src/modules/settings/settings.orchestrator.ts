import { Injectable, Logger } from '@nestjs/common';

import { isVersionLowerThan } from '@/common/utils/semver.util';
import { EnvironmentVariables } from '@/config/env.validation';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { ConsentService } from '@/modules/user/services/consent.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { CURRENT_CONSENT_VERSIONS } from '@/modules/user/user.constant';
import { ConsentType, UserRole } from '@/modules/user/user.enum';
import { UserSettingView } from '@/modules/user/user.types';

import { ConfigService } from '@nestjs/config';

import { TOP_TOPIC_LIMIT } from './settings.constant';
import { SettingsSection } from './settings.enum';
import {
  AppVersionView,
  MarketingConsentView,
  SettingsAccountView,
  SettingsSummaryResult,
  UpdateSettingsCommand,
} from './settings.types';

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 유스케이스라 Orchestrator를 둔다.
 * **자기 Repository·Entity를 갖지 않는다**(`onboarding` · `profile`과 같은 형태).
 *
 * 설정은 대부분 하위 기능으로 연결하는 허브라, 이 모듈이 소유하는 것은 셋뿐이다
 * (`settings-api.md` 1장) — 화면 조회 · 설정 값 변경 · 마케팅 동의·철회.
 *
 * **`user_settings`를 직접 다루지 않는다.** 그 테이블의 소유자는 user 모듈이므로
 * `UserSettingService`를 호출한다(domain.md 2장 · architecture.md 4.3).
 */
@Injectable()
export class SettingsOrchestrator {
  private readonly logger = new Logger(SettingsOrchestrator.name);

  constructor(
    private readonly userService: UserService,
    private readonly userSettingService: UserSettingService,
    private readonly consentService: ConsentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly userInterestService: UserInterestService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * settings-api.md 4.1 — 계정·구독 요약 + 설정값 + 동의 상태 + 버전을 한 번에.
   *
   * **조회를 항목별로 나누지 않는다**(3장 설계 메모) — 계정·구독 카드와 토글 값이 한 화면에
   * 함께 뜨기 때문이다. 대신 **섹션 단위로 실패를 흡수한다.**
   *
   * `settings` · `marketingConsent` · `version`은 실패를 흡수하지 않는다. 토글 기준값이 없으면
   * 낙관적 UI를 시작할 수 없어, 반쪽짜리 화면을 그리는 것보다 전체 실패가 정직하다.
   */
  async getSummary(
    userId: string,
    appVersion: string,
  ): Promise<SettingsSummaryResult> {
    const failedSections: SettingsSection[] = [];

    const [settings, marketingConsent, account, plan, interestSummary] =
      await Promise.all([
        this.userSettingService.getSettings(userId),
        this.buildMarketingConsent(userId),
        this.buildAccount(userId).catch((error: unknown) => {
          this.logSectionFailure(SettingsSection.ACCOUNT, userId, error);
          failedSections.push(SettingsSection.ACCOUNT);
          return null;
        }),
        this.subscriptionService
          .buildPlanView(userId)
          .catch((error: unknown) => {
            this.logSectionFailure(SettingsSection.PLAN, userId, error);
            failedSections.push(SettingsSection.PLAN);
            return null;
          }),
        this.userInterestService
          .buildSummary(userId, TOP_TOPIC_LIMIT)
          .catch((error: unknown) => {
            this.logSectionFailure(
              SettingsSection.INTEREST_SUMMARY,
              userId,
              error,
            );
            failedSections.push(SettingsSection.INTEREST_SUMMARY);
            return null;
          }),
      ]);

    return {
      account,
      plan,
      interestSummary,
      settings,
      marketingConsent,
      version: this.buildVersion(appVersion),
      failedSections,
    };
  }

  /**
   * settings-api.md 4.2 — 배속·자동 확장·이어 PICK 알림의 즉시 저장.
   *
   * **알림 토글 ON 저장에 OS 권한을 요구하지 않는다.** 권한은 기기 단위 값이라 서버가 검증할
   * 수 없고, 권한 없는 기기에는 발송 판정이 어차피 보내지 않는다(`notification.md` 4.2).
   * ON 시도를 막는 것은 클라이언트의 안내 게이트다(3장 설계 메모).
   */
  async updateSettings(
    userId: string,
    command: UpdateSettingsCommand,
  ): Promise<UserSettingView> {
    return this.userSettingService.updateSettings(userId, command);
  }

  /**
   * settings-api.md 4.3 — 마케팅 수신 동의·철회.
   *
   * **켜든 끄든 `consents`에 새 행을 추가한다**(append-only — domain.md 3.2). 기존 행을
   * UPDATE 하면 이력 테이블이 아니게 되고, 2년 재확인의 기산점(최신 동의 행의 `agreed_at`)을
   * 잃는다.
   *
   * **같은 값의 중복 도착도 행을 추가한다.** 상태는 최신 행 기준이라 결과가 변하지 않고,
   * 재동의가 "같은 값의 새 행"으로 표현되기 때문에 스킵 최적화를 두면 기산점이 갱신되지 않는다.
   */
  async recordMarketingConsent(
    userId: string,
    isAgreed: boolean,
    now: Date,
  ): Promise<MarketingConsentView> {
    await this.consentService.recordConsents(
      userId,
      [
        {
          consentType: ConsentType.MARKETING,
          // 마케팅 동의는 버전이 없다(domain.md 3.2) — 상수를 그대로 따른다
          version: CURRENT_CONSENT_VERSIONS[ConsentType.MARKETING],
          isAgreed,
        },
      ],
      now,
    );

    return this.buildMarketingConsent(userId);
  }

  // --- 섹션별 조립 ---

  private async buildAccount(userId: string): Promise<SettingsAccountView> {
    const user = await this.userService.getById(userId);

    return {
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      // 판정은 서버가 한다 — role enum을 그대로 내려 클라이언트가 해석하게 하지 않는다
      isAdmin: user.role === UserRole.ADMIN,
    };
  }

  /**
   * 현재 마케팅 동의 상태 = `consents`의 `marketing` **최신 행**이다(domain.md 3.2).
   *
   * 가입 시 동의 3종이 항상 기록되므로 행이 없는 경우는 정상적으로 없지만,
   * **방어적으로 미동의로 본다** — 없는 동의를 있다고 읽으면 수신 거부자에게 발송된다.
   */
  private async buildMarketingConsent(
    userId: string,
  ): Promise<MarketingConsentView> {
    const states = await this.consentService.findCurrentStates(userId);
    const marketing = states.find(
      (state) => state.consentType === ConsentType.MARKETING,
    );

    return {
      isAgreed: marketing?.isAgreed ?? false,
      agreedAt: marketing?.agreedAt ?? null,
    };
  }

  /**
   * 버전 안내. **원천은 테이블이 아니라 배포 설정이다**(합의 2026-08-06 — domain.md 13.3).
   *
   * **강제 업데이트 판정은 하지 않는다.** 설정까지 들어온 세션은 스플래시의 관문을 이미
   * 통과했으므로 여기서는 안내만 한다(`settings-api.md` 4.1). `minSupportedVersion`은
   * 화면이 참고할 수 있게 함께 내려주되 이 응답이 차단하지 않는다.
   */
  private buildVersion(appVersion: string): AppVersionView {
    const latestVersion = this.configService.get('LATEST_APP_VERSION', {
      infer: true,
    });
    const minSupportedVersion = this.configService.get(
      'MIN_SUPPORTED_APP_VERSION',
      { infer: true },
    );

    return {
      latestVersion,
      minSupportedVersion,
      updateAvailable: isVersionLowerThan(appVersion, latestVersion),
    };
  }

  private logSectionFailure(
    section: SettingsSection,
    userId: string,
    error: unknown,
  ): void {
    // 부분 실패는 화면이 흡수하는 정상 경로이지만, 반복되면 조치가 필요하므로 warn이다
    this.logger.warn('settings section failed', {
      section,
      userId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}
