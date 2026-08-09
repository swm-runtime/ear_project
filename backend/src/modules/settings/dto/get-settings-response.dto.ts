import { PlanStatus } from '@/modules/subscription/subscription.enum';
import { UserTier } from '@/modules/user/user.enum';

import { SettingsSection } from '../settings.enum';
import { SettingsSummaryResult } from '../settings.types';

class SettingsAccountDto {
  /** `null`이면 "등록되지 않음" */
  readonly email: string | null;
  /** `email`과 **함께 내려준다** — 한쪽만으로는 미등록·미인증·인증됨 셋을 구분할 수 없다 */
  readonly is_email_verified: boolean;
  /** [관리자] 섹션 노출 판단 전용. **접근 통제가 아니다** */
  readonly is_admin: boolean;
}

/** `profile-api.md` 4.1의 `plan`과 **같은 모양**이다 — 조립 함수도 같은 것을 쓴다 */
class SettingsPlanDto {
  readonly status: PlanStatus;
  readonly tier: UserTier;
  readonly plan_name: string;
  /** `null`은 무제한 티어. "하루 N편"의 N은 이 값이다 — 2를 하드코딩하지 않는다 */
  readonly daily_play_limit: number | null;
  readonly renews_at: string | null;
  readonly expires_at: string | null;
  /** `true`면 구독 섹션에 경고색 + "결제에 문제가 있어요" */
  readonly has_payment_issue: boolean;
}

class SettingsTopicDto {
  readonly id: string;
  readonly name: string;
}

class SettingsInterestSummaryDto {
  readonly count: number;
  readonly top_topics: SettingsTopicDto[];
}

class SettingsValuesDto {
  readonly default_playback_rate: number;
  /** 주제 자동 확장(P1). 미구현 상태에서는 화면이 섹션을 숨긴다 — 값은 내려주되 그리지 않는다 */
  readonly is_auto_expand_enabled: boolean;
  /** 사용자 노출 명칭은 "이어 PICK 알림"이다. **필드명은 유지한다**(domain.md 3.5) */
  readonly is_drip_notification_enabled: boolean;
}

class MarketingConsentDto {
  readonly is_agreed: boolean;
  readonly agreed_at: string | null;
}

class AppVersionDto {
  readonly latest_version: string;
  readonly min_supported_version: string;
  /** `app_version < latest_version` 판정 결과. **비교를 서버가 한다** */
  readonly update_available: boolean;
}

/**
 * settings-api.md 4.1 — 계정·구독 요약 + 설정값 + 동의 상태 + 버전을 한 번에.
 *
 * **`settings` · `marketing_consent` · `version`은 `null`이 될 수 없다.** 셋이 실패하면
 * 응답 전체가 실패한다 — 토글 기준값 없이 낙관적 UI를 시작할 수 없기 때문이다.
 * `failed_sections`가 담는 것은 `account` · `plan` · `interest_summary` 셋뿐이다.
 */
export class GetSettingsResponseDto {
  readonly account: SettingsAccountDto | null;
  readonly plan: SettingsPlanDto | null;
  readonly interest_summary: SettingsInterestSummaryDto | null;
  readonly settings: SettingsValuesDto;
  readonly marketing_consent: MarketingConsentDto;
  readonly version: AppVersionDto;
  readonly failed_sections: SettingsSection[];

  static from(result: SettingsSummaryResult): GetSettingsResponseDto {
    return {
      account: result.account
        ? {
            email: result.account.email,
            is_email_verified: result.account.isEmailVerified,
            is_admin: result.account.isAdmin,
          }
        : null,
      plan: result.plan
        ? {
            status: result.plan.status,
            tier: result.plan.tier,
            plan_name: result.plan.planName,
            daily_play_limit: result.plan.dailyPlayLimit,
            renews_at: result.plan.renewsAt?.toISOString() ?? null,
            expires_at: result.plan.expiresAt?.toISOString() ?? null,
            has_payment_issue: result.plan.hasPaymentIssue,
          }
        : null,
      interest_summary: result.interestSummary
        ? {
            count: result.interestSummary.count,
            top_topics: result.interestSummary.topTopics.map((topic) => ({
              id: topic.id,
              name: topic.name,
            })),
          }
        : null,
      settings: {
        default_playback_rate: result.settings.defaultPlaybackRate,
        is_auto_expand_enabled: result.settings.isAutoExpandEnabled,
        is_drip_notification_enabled: result.settings.isDripNotificationEnabled,
      },
      marketing_consent: {
        is_agreed: result.marketingConsent.isAgreed,
        agreed_at: result.marketingConsent.agreedAt?.toISOString() ?? null,
      },
      version: {
        latest_version: result.version.latestVersion,
        min_supported_version: result.version.minSupportedVersion,
        update_available: result.version.updateAvailable,
      },
      failed_sections: result.failedSections,
    };
  }
}
