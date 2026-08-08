import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { Plan } from '@/modules/subscription/entities/plan.entity';
import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { SubscriptionStatus } from '@/modules/subscription/subscription.enum';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { SocialProvider, UserTier } from '@/modules/user/user.enum';

import { PlanStatus, ProfileSection } from './profile.enum';
import { ProfileOrchestrator } from './profile.orchestrator';

/** 2026-08-08(토) 18:00 KST — 이번 주는 8-03(월)에 시작한다 */
const NOW = new Date('2026-08-08T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = 'cccccccc-1111-4111-8111-111111111111';
const HIDDEN_TOPIC_ID = 'dddddddd-1111-4111-8111-111111111111';

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

function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: 'sub-1',
    userId: USER_ID,
    tier: UserTier.PRO,
    status: SubscriptionStatus.ACTIVE,
    isAutoRenew: true,
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  } as Subscription;
}

function buildPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    tier: UserTier.PRO,
    name: '프로',
    dailyPlayLimit: null,
    ...overrides,
  } as Plan;
}

function buildInterest(topicId: string): UserInterest {
  return { userId: USER_ID, topicId, isActive: true } as UserInterest;
}

function buildTopic(id: string, name: string, isVisible = true): Topic {
  return { id, name, isVisible } as Topic;
}

describe('ProfileOrchestrator', () => {
  let orchestrator: ProfileOrchestrator;
  let userService: jest.Mocked<Pick<UserService, 'getById'>>;
  let subscriptionService: jest.Mocked<
    Pick<SubscriptionService, 'findCurrent'>
  >;
  let planService: jest.Mocked<Pick<PlanService, 'findByTier'>>;
  let userInterestService: jest.Mocked<
    Pick<UserInterestService, 'findAllActive'>
  >;
  let topicService: jest.Mocked<Pick<TopicService, 'findAllByIds'>>;
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
    subscriptionService = { findCurrent: jest.fn().mockResolvedValue(null) };
    planService = {
      findByTier: jest.fn().mockResolvedValue(
        buildPlan({
          tier: UserTier.LIGHT,
          name: '라이트',
          dailyPlayLimit: 2,
        }),
      ),
    };
    userInterestService = { findAllActive: jest.fn().mockResolvedValue([]) };
    topicService = { findAllByIds: jest.fn().mockResolvedValue([]) };
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
      planService as unknown as PlanService,
      userInterestService as unknown as UserInterestService,
      topicService as unknown as TopicService,
      libraryService as unknown as LibraryService,
      playbackService as unknown as PlaybackService,
      contentService as unknown as ContentService,
    );
  });

  describe('getSummary — 플랜 카드', () => {
    it('구독 행이 없으면 무료로 판정하고 요금제 한도를 함께 내려준다', async () => {
      // given — 무료 사용자는 subscriptions 행이 없다(domain.md 8.2)
      subscriptionService.findCurrent.mockResolvedValue(null);

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — "하루 N편"의 N은 하드코딩이 아니라 plans 값이다
      expect(result.plan).toMatchObject({
        status: PlanStatus.FREE,
        tier: UserTier.LIGHT,
        dailyPlayLimit: 2,
        renewsAt: null,
        expiresAt: null,
        hasPaymentIssue: false,
      });
    });

    it('만료·환불 행만 있으면 무료다', async () => {
      // given
      subscriptionService.findCurrent.mockResolvedValue(
        buildSubscription({ status: SubscriptionStatus.EXPIRED }),
      );

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.plan?.status).toBe(PlanStatus.FREE);
      expect(result.plan?.tier).toBe(UserTier.LIGHT);
    });

    it('자동 갱신 중이면 구독 상태이고 다음 결제일을 내려준다', async () => {
      // given
      subscriptionService.findCurrent.mockResolvedValue(buildSubscription());
      planService.findByTier.mockResolvedValue(buildPlan());

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — renews_at과 expires_at은 같은 컬럼이지만 의미가 달라 필드를 나눈다
      expect(result.plan).toMatchObject({
        status: PlanStatus.SUBSCRIBED,
        tier: UserTier.PRO,
        planName: '프로',
        renewsAt: new Date('2026-09-01T00:00:00.000Z'),
        expiresAt: null,
      });
    });

    it('자동 갱신이 꺼져 있으면 해지 예약이고 이용 종료일을 내려준다', async () => {
      // given
      subscriptionService.findCurrent.mockResolvedValue(
        buildSubscription({ isAutoRenew: false }),
      );
      planService.findByTier.mockResolvedValue(buildPlan());

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.plan).toMatchObject({
        status: PlanStatus.CANCEL_SCHEDULED,
        renewsAt: null,
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      });
    });

    it('결제 유예 상태면 경고 플래그를 세운다', async () => {
      // given
      subscriptionService.findCurrent.mockResolvedValue(
        buildSubscription({ status: SubscriptionStatus.GRACE }),
      );
      planService.findByTier.mockResolvedValue(buildPlan());

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.plan?.status).toBe(PlanStatus.GRACE);
      expect(result.plan?.hasPaymentIssue).toBe(true);
    });
  });

  describe('getSummary — 관심 주제 요약', () => {
    it('관리자가 숨긴 주제도 개수와 대표 목록에 포함한다', async () => {
      // given — 편집 화면과 같은 기준을 써야 개수가 어긋나지 않는다
      userInterestService.findAllActive.mockResolvedValue([
        buildInterest(TOPIC_ID),
        buildInterest(HIDDEN_TOPIC_ID),
      ]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
        buildTopic(HIDDEN_TOPIC_ID, '숨긴 주제', false),
      ]);

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then
      expect(result.interestSummary?.count).toBe(2);
      expect(
        result.interestSummary?.topTopics.map((topic) => topic.name),
      ).toEqual(['커리어', '숨긴 주제']);
    });

    it('대표 주제는 앞 3개까지만 내려준다', async () => {
      // given
      const interests = Array.from({ length: 5 }, (_, index) =>
        buildInterest(`topic-${index}`),
      );
      userInterestService.findAllActive.mockResolvedValue(interests);
      topicService.findAllByIds.mockResolvedValue(
        interests.map((interest, index) =>
          buildTopic(interest.topicId, `주제${index}`),
        ),
      );

      // when
      const result = await orchestrator.getSummary(USER_ID, NOW);

      // then — 나머지는 화면이 +N으로 접는다
      expect(result.interestSummary?.count).toBe(5);
      expect(result.interestSummary?.topTopics).toHaveLength(3);
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
      subscriptionService.findCurrent.mockRejectedValue(new Error('db down'));

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
