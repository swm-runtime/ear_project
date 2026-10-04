import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { fetchSignupTrial, toPlanTrial } from './profile.api';
import type { ProfilePlanDto, ProfileSummaryResponseDto } from './profile.dto';

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
