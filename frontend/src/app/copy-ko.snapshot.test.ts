/* eslint-disable no-restricted-imports -- 한국어 카피 회귀는 각 feature 의 카피 객체를 직접 읽어야 한다(공개 API 는 카피를 내보내지 않고, index 는 네이티브 의존을 끌어온다). 테스트 전용 */
import { describe, expect, it, jest } from '@jest/globals';

import { MONITORING_COPY } from '@/shared/monitoring/monitoring.copy';


import { APP_UPDATE_COPY } from '@/features/app-update/app-update.copy';
import { AUTH_COPY } from '@/features/auth/auth.copy';
import { CAREER_COPY } from '@/features/career/career.copy';
import { CONTENT_DETAIL_COPY } from '@/features/content-detail/content-detail.copy';
import { EXPLORE_COPY } from '@/features/explore/explore.copy';
import { INTEREST_COPY } from '@/features/interest/interest.copy';
import { LIBRARY_COPY } from '@/features/library/library.copy';
import { NOTICE_COPY } from '@/features/notice/notice.copy';
import { NOTIFICATION_COPY } from '@/features/notification/notification.copy';
import { ONBOARDING_COPY } from '@/features/onboarding/onboarding.copy';
import { PLAYER_COPY } from '@/features/player/player.copy';
import { PROFILE_COPY } from '@/features/profile/profile.copy';
import { SETTINGS_COPY } from '@/features/settings/settings.copy';
import { SHARE_COPY } from '@/features/share/share.copy';
import { SUBSCRIPTION_COPY } from '@/features/subscription/subscription.copy';

// onboarding 카피가 알림 feature 의 공개 API 를 거쳐 알림 카피를 읽는다 — 무거운 네이티브 의존을 피해 카피만 꺼내 준다
jest.mock('@/features/notification', () => ({
  NOTIFICATION_COPY: jest.requireActual<{ NOTIFICATION_COPY: unknown }>(
    '@/features/notification/notification.copy',
  ).NOTIFICATION_COPY,
}));

/**
 * 한국어 카피 회귀(KAN-194 완료 조건 "기기 언어 ko → 종전 문구와 1:1 동일"). 스냅숏은 **i18n 전환 전 코드로 만들었다** —
 * 카피를 ko/en 으로 나눈 뒤에도 이 테스트가 그대로 통과해야 한다. 함수형 카피는 대표 인자 두 벌로 불러 결과를 남긴다.
 */
const SAMPLE_ARGS: readonly unknown[][] = [
  [3, 3, 3, 3],
  ['가나다', '2026-10-15T00:00:00.000Z', '라마', '바사'],
];

const serialize = (value: unknown): unknown => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') {
    return SAMPLE_ARGS.map((args) => {
      try {
        return serialize((value as (...a: unknown[]) => unknown)(...args.slice(0, value.length)));
      } catch {
        return '[throws]';
      }
    });
  }
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serialize(entry)]),
  );
};

const COPIES = {
  APP_UPDATE_COPY,
  AUTH_COPY,
  CAREER_COPY,
  CONTENT_DETAIL_COPY,
  EXPLORE_COPY,
  INTEREST_COPY,
  LIBRARY_COPY,
  NOTICE_COPY,
  NOTIFICATION_COPY,
  ONBOARDING_COPY,
  PLAYER_COPY,
  PROFILE_COPY,
  SETTINGS_COPY,
  SHARE_COPY,
  SUBSCRIPTION_COPY,
  MONITORING_COPY,
};

describe('한국어 카피 회귀 — i18n 전환 전과 1:1', () => {
  it.each(Object.entries(COPIES))('%s', (_name, copy) => {
    expect(serialize(copy)).toMatchSnapshot();
  });
});
