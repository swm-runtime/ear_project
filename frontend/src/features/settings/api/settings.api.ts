import { apiClient } from '@/shared/api/api-client';
import type { DevicePlatform } from '@/shared/lib/device-platform';

import { IS_SETTINGS_API_MOCKED } from '../settings.constants';
import type {
  MarketingConsent,
  PlaybackRate,
  SettingsSummary,
  UserSettings,
} from '../settings.types';
import type {
  MarketingConsentDto,
  MarketingConsentRequestDto,
  MarketingConsentResponseDto,
  SettingsSummaryResponseDto,
  UpdateSettingsRequestDto,
  UpdateSettingsResponseDto,
  UserSettingsDto,
} from './settings.dto';
import {
  mockFetchSettingsSummary,
  mockSubmitMarketingConsent,
  mockUpdateSettings,
} from './settings.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const settingsKeys = {
  all: ['settings'] as const,
  summary: () => [...settingsKeys.all, 'summary'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toUserSettings = (dto: UserSettingsDto): UserSettings => ({
  // 허용값 집합은 서버가 검증한다(settings-api.md 7장) — 응답 값은 계약상 PlaybackRate다
  defaultPlaybackRate: dto.default_playback_rate as PlaybackRate,
  isAutoExpandEnabled: dto.is_auto_expand_enabled,
  isDripNotificationEnabled: dto.is_drip_notification_enabled,
});

const toMarketingConsent = (dto: MarketingConsentDto): MarketingConsent => ({
  isAgreed: dto.is_agreed,
  agreedAt: dto.agreed_at,
});

const toSettingsSummary = (dto: SettingsSummaryResponseDto): SettingsSummary => ({
  account:
    dto.account === null
      ? null
      : {
          email: dto.account.email,
          isEmailVerified: dto.account.is_email_verified,
          isAdmin: dto.account.is_admin,
        },
  plan:
    dto.plan === null
      ? null
      : {
          status: dto.plan.status,
          tier: dto.plan.tier,
          planName: dto.plan.plan_name,
          dailyPlayLimit: dto.plan.daily_play_limit,
          renewsAt: dto.plan.renews_at,
          expiresAt: dto.plan.expires_at,
          hasPaymentIssue: dto.plan.has_payment_issue,
        },
  interestSummary:
    dto.interest_summary === null
      ? null
      : {
          count: dto.interest_summary.count,
          topTopics: dto.interest_summary.top_topics.map((topic) => ({
            id: topic.id,
            name: topic.name,
          })),
        },
  settings: toUserSettings(dto.settings),
  marketingConsent: toMarketingConsent(dto.marketing_consent),
  version: {
    latestVersion: dto.version.latest_version,
    minSupportedVersion: dto.version.min_supported_version,
    updateAvailable: dto.version.update_available,
  },
  failedSections: dto.failed_sections,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 설정 화면 조회(settings-api.md 4.1) — app_version은 업데이트 안내의 표시 판정용이다.
 * platform은 필수다 — 최신·최소 지원 버전이 플랫폼별로 달라(스토어 심사 주기) 서버가
 * 어느 쪽 값과 비교할지 이 값으로 정한다(domain.md 13.3, 개정 2026-08-09).
 */
export const fetchSettingsSummary = async (input: {
  appVersion: string;
  platform: DevicePlatform;
}): Promise<SettingsSummary> => {
  const data = IS_SETTINGS_API_MOCKED
    ? await mockFetchSettingsSummary(input.platform)
    : (
        await apiClient.get<SettingsSummaryResponseDto>('/users/me/settings', {
          params: { app_version: input.appVersion, platform: input.platform },
        })
      ).data;
  return toSettingsSummary(data);
};

/**
 * 설정 값 부분 변경(settings-api.md 4.2) — 절대값 저장이라 멱등키가 없다.
 * client_seq는 연타의 순서 문제용 — 서버는 저장·판정하지 않고 응답에 되돌린다.
 */
export const updateUserSettings = async (input: {
  patch: Partial<
    Pick<
      UserSettingsDto,
      'default_playback_rate' | 'is_drip_notification_enabled' | 'is_auto_expand_enabled'
    >
  >;
  clientSeq: number;
}): Promise<{ settings: UserSettings; clientSeq: number }> => {
  const body: UpdateSettingsRequestDto = { ...input.patch, client_seq: input.clientSeq };
  const data = IS_SETTINGS_API_MOCKED
    ? await mockUpdateSettings(body)
    : (await apiClient.patch<UpdateSettingsResponseDto>('/users/me/settings', body)).data;
  return { settings: toUserSettings(data.settings), clientSeq: data.client_seq };
};

/**
 * 마케팅 수신 동의·철회(settings-api.md 4.3) — consents에 이력 행을 추가하는 POST다.
 * PATCH에 싣지 않는다 — 저장 구조가 다르다(append-only).
 */
export const submitMarketingConsent = async (input: {
  isAgreed: boolean;
  clientSeq: number;
}): Promise<{ marketingConsent: MarketingConsent; clientSeq: number }> => {
  const body: MarketingConsentRequestDto = {
    is_agreed: input.isAgreed,
    client_seq: input.clientSeq,
  };
  const data = IS_SETTINGS_API_MOCKED
    ? await mockSubmitMarketingConsent(body)
    : (await apiClient.post<MarketingConsentResponseDto>('/users/me/consents/marketing', body))
        .data;
  return {
    marketingConsent: toMarketingConsent(data.marketing_consent),
    clientSeq: data.client_seq,
  };
};
