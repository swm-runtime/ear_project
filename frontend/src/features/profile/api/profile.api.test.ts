import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PROFILE_COPY } from '../profile.copy';
import { fetchSignupTrial, toListeningHighlight, toPlanTrial } from './profile.api';
import type { ProfilePlanDto, ProfileSummaryResponseDto, WeeklyListeningDto } from './profile.dto';

// 테스트 환경은 __DEV__ 라 mock 경로를 탄다 — 응답 DTO 만 바꿔 끼워 변환을 검증한다
const mockFetchProfileSummary = jest.fn<() => Promise<ProfileSummaryResponseDto>>();
jest.mock('./profile.mock', () => ({
  mockFetchProfileSummary: () => mockFetchProfileSummary(),
  mockFetchWeeklyListening: jest.fn(),
}));
jest.mock('@/shared/api/api-client', () => ({ apiClient: { get: jest.fn() } }));

const PLAN_TRIAL_FREE: ProfilePlanDto = {
  status: 'free',
  tier: 'trial',
  plan_name: '무료 체험',
  daily_play_limit: null,
  renews_at: null,
  expires_at: null,
  has_payment_issue: false,
};

const summaryWith = (plan: ProfilePlanDto | null): ProfileSummaryResponseDto => ({
  user: {
    nickname: null,
    profile_image_url: null,
    provider: 'kakao',
    email: null,
    is_email_verified: false,
  },
  plan,
  interest_summary: null,
  career: { job_category: null, job_title: null, years_of_experience: null },
  stats_summary: null,
  weekly_listening: null,
  topic_distribution: null,
  failed_sections: plan === null ? ['plan'] : [],
});

beforeEach(() => {
  mockFetchProfileSummary.mockReset();
});

describe('profile.api 가입 체험 변환', () => {
  describe('toPlanTrial', () => {
    it('plan.trial을 그대로 옮긴다 — 날짜·한도를 다시 계산하지 않는다', () => {
      expect(
        toPlanTrial({
          ends_at: '2026-10-09T19:00:00.000Z',
          last_free_date: '2026-10-09',
          daily_play_limit_after: 2,
        }),
      ).toEqual({
        endsAt: '2026-10-09T19:00:00.000Z',
        lastFreeDate: '2026-10-09',
        dailyPlayLimitAfter: 2,
      });
    });

    it('null이면 체험 아님이다', () => {
      expect(toPlanTrial(null)).toBeNull();
    });

    it('필드가 없으면(운영 반영 전 서버) 체험 아님으로 읽는다', () => {
      expect(toPlanTrial(undefined)).toBeNull();
    });
  });

  describe('fetchSignupTrial', () => {
    it('프로필 요약의 plan.trial을 돌려준다', async () => {
      // given
      mockFetchProfileSummary.mockResolvedValue(
        summaryWith({
          ...PLAN_TRIAL_FREE,
          trial: {
            ends_at: '2026-10-09T19:00:00.000Z',
            last_free_date: '2026-10-09',
            daily_play_limit_after: 3,
          },
        }),
      );
      // when
      const trial = await fetchSignupTrial();
      // then
      expect(trial?.lastFreeDate).toBe('2026-10-09');
      expect(trial?.dailyPlayLimitAfter).toBe(3);
    });

    it('플랜 섹션이 부분 실패(plan null)면 체험 아님으로 읽는다 — 팝업을 띄우지 않는다', async () => {
      mockFetchProfileSummary.mockResolvedValue(summaryWith(null));
      await expect(fetchSignupTrial()).resolves.toBeNull();
    });
  });
});

describe('profile.api 주간 한 줄 변환(KAN-170)', () => {
  const week = (extra: Partial<WeeklyListeningDto>): WeeklyListeningDto => ({
    week_start: '2026-10-05',
    daily_listened_sec: [600, 0, 0, 0, 0, 0, 0],
    previous_week_start: null,
    next_week_start: null,
    ...extra,
  });

  it('서버가 고른 종류를 그대로 옮긴다 — 순위를 다시 매기지 않는다', () => {
    // given — 상위 % 값도 있지만 서버가 전주보다 더를 골랐다(앱이 우선순위를 다시 판정하지 않는다)
    const dto = week({
      listening_top_percent: 12,
      listening_highlight: { kind: 'more_than_previous', diff_sec: 720 },
    });
    // then
    expect(toListeningHighlight(dto)).toEqual({ kind: 'moreThanPrevious', diffSec: 720 });
  });

  it('null 이면 그리지 않는다 — 상위 % 로 대신하지 않는다', () => {
    expect(
      toListeningHighlight(week({ listening_top_percent: 12, listening_highlight: null })),
    ).toBeNull();
  });

  it('필드가 없는 서버(반영 전)는 상위 % 만 있던 때처럼 그린다', () => {
    expect(toListeningHighlight(week({ listening_top_percent: 7 }))).toEqual({
      kind: 'topPercent',
      percent: 7,
    });
    expect(toListeningHighlight(week({}))).toBeNull();
  });

  it('모르는 kind 는 그리지 않는다', () => {
    const dto = week({
      listening_highlight: {
        kind: 'streak',
        days: 3,
      } as unknown as WeeklyListeningDto['listening_highlight'],
    });
    expect(toListeningHighlight(dto)).toBeNull();
  });
});

describe('PROFILE_COPY.stats.highlight', () => {
  it('이번 주와 지난 주의 앞말이 다르다 — 지난 주 화면에 "이번 주"가 나오지 않는다', () => {
    expect(PROFILE_COPY.stats.highlight({ kind: 'listenedDays', days: 3 }, true)).toMatchObject({
      lead: '이번 주',
      main: '3일 들었어요',
    });
    expect(PROFILE_COPY.stats.highlight({ kind: 'listenedDays', days: 3 }, false).lead).toBe(
      '그 주',
    );
    expect(
      PROFILE_COPY.stats.highlight({ kind: 'moreThanPrevious', diffSec: 720 }, true),
    ).toMatchObject({
      lead: '지난주보다',
      main: '12분 더',
    });
    expect(
      PROFILE_COPY.stats.highlight({ kind: 'moreThanPrevious', diffSec: 4260 }, false),
    ).toMatchObject({
      lead: '전주보다',
      main: '1시간 11분 더',
    });
  });

  it('상위 % 는 주와 무관하게 같은 문구다', () => {
    expect(PROFILE_COPY.stats.highlight({ kind: 'topPercent', percent: 3 }, false)).toMatchObject({
      lead: '다른 사용자 대비',
      main: '상위 3%',
    });
  });
});
