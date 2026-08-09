import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { PlanStatus } from '@/modules/subscription/subscription.enum';
import { PlanView } from '@/modules/subscription/subscription.types';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { SocialProvider, UserTier } from '@/modules/user/user.enum';

import { ProfileSection } from './profile.enum';
import { ProfileOrchestrator } from './profile.orchestrator';

/** 2026-08-08(토) 18:00 KST — 이번 주는 8-03(월)에 시작한다 */
const NOW = new Date('2026-08-08T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = 'cccccccc-1111-4111-8111-111111111111';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    provider: SocialProvider.KAKAO,
    nickname: '수현',
    email: 'user@example.com',
    isEmailVerified: false,
    tier: UserTier.LIGHT,
    jobCategory: '기획',
    jobTitle: '서비스 기획',
    yearsOfExperience: 4,
    // 가입 주는 2026-07-27(월) — 이번 주보다 두 주 앞이다
    createdAt: new Date('2026-07-29T00:00:00.000Z'),
    ...overrides,
  } as User;
}

/** 무료 사용자 기본값 — 4분기 판정 자체는 SubscriptionService의 spec이 덮는다 */
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

describe('ProfileOrchestrator', () => {
  let orchestrator: ProfileOrchestrator;
  let userService: jest.Mocked<Pick<UserService, 'getById'>>;
  let subscriptionService: jest.Mocked<
    Pick<SubscriptionService, 'buildPlanView'>
  >;
  let userInterestService: jest.Mocked<
    Pick<UserInterestService, 'buildSummary'>
  >;
  let libraryService: jest.Mocked<
    Pick<LibraryService, 'countCompletedContents'>
  >;
  let playbackService: jest.Mocked<
    Pick<
      PlaybackService,
      | 'sumListenedSec'
      | 'findPlayDates'
      | 'sumListenedSecByDates'
      | 'sumListenedSecByContent'
    >
  >;
  let contentService: jest.Mocked<Pick<ContentService, 'findTopicViews'>>;

  beforeEach(() => {
    userService = { getById: jest.fn().mockResolvedValue(buildUser()) };
    subscriptionService = {
      buildPlanView: jest.fn().mockResolvedValue(buildPlanView()),
    };
    userInterestService = {
      buildSummary: jest.fn().mockResolvedValue({ count: 0, topTopics: [] }),
    };
    libraryService = { countCompletedContents: jest.fn().mockResolvedValue(0) };
    playbackService = {
      sumListenedSec: jest.fn().mockResolvedValue(0),
      findPlayDates: jest.fn().mockResolvedValue([]),
      sumListenedSecByDates: jest.fn().mockResolvedValue(new Map()),
      sumListenedSecByContent: jest.fn().mockResolvedValue([]),
    };
    contentService = { findTopicViews: jest.fn().mockResolvedValue([]) };

    orchestrator = new ProfileOrchestrator(
      userService as unknown as UserService,
      subscriptionService as unknown as SubscriptionService,
      userInterestService as unknown as UserInterestService,
      libraryService as unknown as LibraryService,
      playbackService as unknown as PlaybackService,
      contentService as unknown as ContentService,
    );
  });

  describe('getSummary — 플랜 카드', () => {
    it('구독 모듈이 조립한 플랜을 그대로 싣는다', async () => {
      // given — 4분기 판정은 SubscriptionService.buildPlanView가 소유한다.
      // 프로필·설정이 같은 함수를 부르므로(settings-api.md 4.1) 여기서 다시 판정하지 않는다
      const planView = {
        status: PlanStatus.SUBSCRIBED,
        tier: UserTier.PRO,
        planName: '프로',
        dailyPlayLimit: null,
        renewsAt: new Date('2026-09-01T00:00:00.000Z'),
        expiresAt: null,
        hasPaymentIssue: false,
      };
      subscriptionService.buildPlanView.mockResolvedValue(planView);

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.plan).toEqual(planView);
      expect(subscriptionService.buildPlanView).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('getSummary — 관심 주제 요약', () => {
    it('대표 주제 상한을 넘겨 interest 모듈에 조립을 맡긴다', async () => {
      // given — 숨김 주제 포함·선택 순서 규칙은 UserInterestService.buildSummary가 소유한다
      const summary = {
        count: 3,
        topTopics: [{ id: TOPIC_ID, name: '커리어' }],
      };
      userInterestService.buildSummary.mockResolvedValue(summary);

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 상한(3)은 프로필 화면의 규칙이라 호출부가 정한다
      expect(result.interestSummary).toEqual(summary);
      expect(userInterestService.buildSummary).toHaveBeenCalledWith(USER_ID, 3);
    });
  });

  describe('getSummary — 통계', () => {
    it('청취 기록이 없으면 세 지표가 0이고 실패로 처리하지 않는다', async () => {
      // given / when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.statsSummary).toEqual({
        completedContentCount: 0,
        totalListenedSec: 0,
        streakDays: 0,
      });
      expect(result.failedSections).toEqual([]);
    });

    it('이번 주 그래프를 함께 내려주고 다음 주는 없다고 알린다', async () => {
      // given
      playbackService.sumListenedSecByDates.mockResolvedValue(
        new Map([['2026-08-03', 1220]]),
      );

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 기본 표시가 이번 주이므로 next_week_start는 항상 null이다
      expect(result.weeklyListening).toMatchObject({
        weekStart: '2026-08-03',
        dailyListenedSec: [1220, 0, 0, 0, 0, 0, 0],
        previousWeekStart: '2026-07-27',
        nextWeekStart: null,
      });
    });

    it('가입 주가 이번 주면 이전 주가 없다고 알린다', async () => {
      // given — 이번 주에 가입한 사용자
      userService.getById.mockResolvedValue(
        buildUser({ createdAt: new Date('2026-08-05T00:00:00.000Z') }),
      );

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 화살표 활성 여부를 서버가 정한다
      expect(result.weeklyListening?.previousWeekStart).toBeNull();
    });
  });

  describe('getSummary — 부분 실패', () => {
    it('구독 조회만 실패하면 플랜만 비우고 나머지는 정상 응답한다', async () => {
      // given
      subscriptionService.buildPlanView.mockRejectedValue(new Error('db down'));

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 화면 전체를 에러로 덮지 않는다(profile.md 4.8)
      expect(result.plan).toBeNull();
      expect(result.failedSections).toEqual([ProfileSection.PLAN]);
      expect(result.user.nickname).toBe('수현');
      expect(result.statsSummary).not.toBeNull();
    });

    it('통계 조회가 실패하면 세 영역을 한 덩어리로 비운다', async () => {
      // given — 화면이 통계를 한 영역으로 실패 처리한다
      playbackService.sumListenedSec.mockRejectedValue(new Error('timeout'));

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.statsSummary).toBeNull();
      expect(result.weeklyListening).toBeNull();
      expect(result.topicDistribution).toBeNull();
      expect(result.failedSections).toEqual([ProfileSection.STATS]);
    });

    it('커리어는 실패 대상이 아니며 미입력이면 null로 내려간다', async () => {
      // given
      userService.getById.mockResolvedValue(
        buildUser({
          jobCategory: null,
          jobTitle: null,
          yearsOfExperience: null,
        }),
      );

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 미입력(null)은 정상이며 failed_sections에 담기지 않는다
      expect(result.career).toEqual({
        jobCategory: null,
        jobTitle: null,
        yearsOfExperience: null,
      });
      expect(result.failedSections).not.toContain(ProfileSection.STATS);
    });

    it('저장된 정수 연차를 구간 라벨로 되돌려 준다', async () => {
      // given / when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 계약은 구간 라벨이고 저장 표현은 백엔드 소관이다
      expect(result.career.yearsOfExperience).toBe('4-6');
    });
  });

  describe('getWeeklyListening', () => {
    it('이전 주 라벨로 그 주의 막대를 돌려준다', async () => {
      // given
      playbackService.sumListenedSecByDates.mockResolvedValue(
        new Map([['2026-07-28', 3600]]),
      );

      // when
      const result = await orchestrator.getWeeklyListening(
        USER_ID,
        '2026-07-27',
        NOW,
      );

      // then
      expect(result).toMatchObject({
        weekStart: '2026-07-27',
        dailyListenedSec: [0, 3600, 0, 0, 0, 0, 0],
        nextWeekStart: '2026-08-03',
      });
    });

    it('월요일이 아닌 라벨은 형식 오류로 거절한다', async () => {
      // given — 2026-07-28은 화요일이다
      const call = orchestrator.getWeeklyListening(USER_ID, '2026-07-28', NOW);

      // when / then
      await expect(call).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
      });
      await expect(call).rejects.toBeInstanceOf(BusinessException);
    });

    it('가입 주보다 앞선 주는 범위 밖으로 거절한다', async () => {
      // given — 가입 주는 2026-07-27이다
      const call = orchestrator.getWeeklyListening(USER_ID, '2026-07-20', NOW);

      // when / then
      await expect(call).rejects.toMatchObject({
        errorCode: ErrorCode.STATS_WEEK_OUT_OF_RANGE,
      });
    });

    it('미래 주는 범위 밖으로 거절한다', async () => {
      // given
      const call = orchestrator.getWeeklyListening(USER_ID, '2026-08-10', NOW);

      // when / then
      await expect(call).rejects.toMatchObject({
        errorCode: ErrorCode.STATS_WEEK_OUT_OF_RANGE,
      });
    });

    it('가입 주를 조회하면 이전 주가 없다고 알린다', async () => {
      // given / when
      const result = await orchestrator.getWeeklyListening(
        USER_ID,
        '2026-07-27',
        NOW,
      );

      // then
      expect(result.previousWeekStart).toBeNull();
    });
  });
});
