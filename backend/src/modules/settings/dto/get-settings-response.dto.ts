import { AudioQuality } from '@/modules/content/content.enum';
import { PlanStatus } from '@/modules/subscription/subscription.enum';
import { InviteGrantDto } from '@/modules/subscription/dto/invite-grant.dto';
import { TrialDto } from '@/modules/subscription/dto/trial.dto';
import { PendingPlanDto } from '@/modules/subscription/dto/pending-plan.dto';
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
  /** 가입 체험 중일 때만 값이 있다 — 종료일·이후 한도(`subscription.md` 4.8). 아니면 `null` */
  readonly trial: TrialDto | null;
  /** 초대 코드로 받은 요금제 — 지급 중일 때만 값이 있다(`subscription-api.md` 4.8) */
  readonly grant: InviteGrantDto | null;
  /** 다운그레이드 예약(KAN-161) — `{ tier, plan_name, effective_at }`, 없으면 `null`. 구독 조회의 `pending_plan` 과 같은 값 */
  readonly pending_plan: PendingPlanDto | null;
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
  /**
   * 적용 중인 음질(player.md 4.9 — KAN-141). 고른 값, 고른 적 없으면 티어가 허용하는 가장 높은 선택지(2026-10-06).
   * 허용 밖일 수 있다(구독 만료 뒤 남은 선택) — 값은 그대로, 재생은 서버가 깎는다
   */
  readonly preferred_audio_quality: AudioQuality;
  /** 음질 선택지(렌더되는 것만 — compressed · lossless) 오름차순 + 이 티어의 허용 여부. `allowed = false`는 잠금으로 그린다 */
  readonly audio_qualities: AudioQualityOptionDto[];
}

class AudioQualityOptionDto {
  readonly quality: AudioQuality;
  readonly allowed: boolean;
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
            trial: TrialDto.from(result.plan.trial),
            grant: InviteGrantDto.from(result.plan.grant),
            pending_plan: PendingPlanDto.from(result.plan.pendingPlan),
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
        preferred_audio_quality: result.effectiveAudioQuality,
        audio_qualities: result.audioQualities,
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
