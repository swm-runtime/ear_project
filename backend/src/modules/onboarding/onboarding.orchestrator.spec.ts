import { DataSource } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import { FirstDripService } from '@/modules/drip/services/first-drip.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserOnboardingService } from '@/modules/user/services/user-onboarding.service';
import { OnboardingStep } from '@/modules/user/user.enum';

import { RecommendationSectionType } from './onboarding.enum';
import { OnboardingOrchestrator } from './onboarding.orchestrator';

const NOW = new Date('2026-05-20T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_C = 'cccccccc-1111-4111-8111-111111111111';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    onboardingCompleted: false,
    onboardingStep: OnboardingStep.PICK,
    onboardingCompletedAt: null,
    jobCategory: null,
    jobTitle: null,
    yearsOfExperience: null,
    ...overrides,
  } as User;
}

function buildContents(prefix: string, count: number): Content[] {
  return Array.from(
    { length: count },
    (_value, index) => ({ id: `${prefix}-${index + 1}` }) as Content,
  );
}

describe('OnboardingOrchestrator', () => {
  let orchestrator: OnboardingOrchestrator;
  let userOnboardingService: jest.Mocked<UserOnboardingService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let contentService: jest.Mocked<ContentService>;
  let contentStatService: jest.Mocked<ContentStatService>;
  let libraryService: jest.Mocked<LibraryService>;
  let firstDripService: jest.Mocked<FirstDripService>;
  let user: User;

  beforeEach(() => {
    user = buildUser();

    const realOnboardingService = new UserOnboardingService(
      {} as never,
      {} as never,
    );

    userOnboardingService = {
      getUser: jest.fn().mockImplementation(() => Promise.resolve(user)),
      // 완료 여부 판정은 실제 구현을 그대로 쓴다 — 여기서 검증하려는 규칙이다
      assertNotCompleted: jest
        .fn()
        .mockImplementation((target: User) =>
          realOnboardingService.assertNotCompleted(target),
        ),
      assertCompleted: jest
        .fn()
        .mockImplementation((target: User) =>
          realOnboardingService.assertCompleted(target),
        ),
      advanceStep: jest.fn(),
      updateCareer: jest.fn(),
      complete: jest.fn().mockImplementation((target: User, now: Date) => {
        target.onboardingCompleted = true;
        target.onboardingCompletedAt = now;
        return Promise.resolve(target);
      }),
    } as unknown as jest.Mocked<UserOnboardingService>;

    userInterestService = {
      findActiveTopicIds: jest
        .fn()
        .mockResolvedValue([TOPIC_A, TOPIC_B, TOPIC_C]),
      hasActiveInterest: jest.fn().mockResolvedValue(true),
      replaceOnboardingSelection: jest.fn(),
      findAllActive: jest.fn(),
    } as unknown as jest.Mocked<UserInterestService>;

    contentService = {
      findCandidates: jest.fn().mockResolvedValue([]),
      findTopicViews: jest.fn().mockResolvedValue([]),
      resolvePickTargets: jest.fn(),
      findAllByIds: jest.fn(),
    } as unknown as jest.Mocked<ContentService>;

    contentStatService = {
      isMonthlySampleSufficient: jest.fn().mockResolvedValue(true),
      findMonthlyPopularContentIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentStatService>;

    libraryService = {
      addItems: jest.fn().mockResolvedValue([]),
      countBySource: jest.fn().mockResolvedValue(0),
      findAllContentIds: jest.fn(),
    } as unknown as jest.Mocked<LibraryService>;

    firstDripService = {
      createJob: jest.fn(),
      runInBackground: jest.fn().mockResolvedValue(undefined),
      findState: jest.fn().mockResolvedValue({
        status: FirstDripJobStatus.PENDING,
        itemCount: 0,
        completedAt: null,
      }),
    } as unknown as jest.Mocked<FirstDripService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    orchestrator = new OnboardingOrchestrator(
      userOnboardingService,
      {} as TopicService,
      userInterestService,
      contentService,
      contentStatService,
      libraryService,
      firstDripService,
      dataSource,
    );
  });

  describe('getRecommendations', () => {
    it('관심 주제 6건과 이번 달 인기 3건을 두 섹션으로 나눠 총 9건을 돌려준다', async () => {
      // given — 주제 3개에 2건씩 배분된다
      contentService.findCandidates
        .mockResolvedValueOnce(buildContents('a', 2))
        .mockResolvedValueOnce(buildContents('b', 2))
        .mockResolvedValueOnce(buildContents('c', 2))
        .mockResolvedValueOnce(buildContents('popular', 10));

      // when
      const sections = await orchestrator.getRecommendations(USER_ID, NOW);

      // then
      expect(sections).toHaveLength(2);
      expect(sections[0].sectionType).toBe(RecommendationSectionType.INTEREST);
      expect(sections[0].items).toHaveLength(6);
      expect(sections[1].sectionType).toBe(
        RecommendationSectionType.MONTHLY_POPULAR,
      );
      expect(sections[1].items).toHaveLength(3);
    });

    it('두 번째 섹션은 관심 주제 밖에서만 뽑는다', async () => {
      // given
      contentService.findCandidates.mockResolvedValue(buildContents('x', 6));

      // when
      await orchestrator.getRecommendations(USER_ID, NOW);

      // then — 마지막 호출이 두 번째 섹션의 후보 조회다
      const lastCall = contentService.findCandidates.mock.calls.at(-1);
      expect(lastCall?.[0].excludeTopicIds).toEqual([
        TOPIC_A,
        TOPIC_B,
        TOPIC_C,
      ]);
    });

    it('직전 확정 월의 표본이 부족하면 인기 대신 랜덤 3건을 같은 자리에 배치한다', async () => {
      // given
      contentStatService.isMonthlySampleSufficient.mockResolvedValue(false);
      contentService.findCandidates
        .mockResolvedValueOnce(buildContents('a', 2))
        .mockResolvedValueOnce(buildContents('b', 2))
        .mockResolvedValueOnce(buildContents('c', 2))
        .mockResolvedValueOnce(buildContents('pool', 20));

      // when
      const sections = await orchestrator.getRecommendations(USER_ID, NOW);

      // then — 인기 순위가 아닌 것을 인기라고 부르지 않는다
      expect(sections[1].sectionType).toBe(
        RecommendationSectionType.TOPIC_DISCOVERY,
      );
      expect(sections[1].title).toBe('이런 주제는 어때요?');
      expect(sections[1].items).toHaveLength(3);
    });

    it('표본 부족으로 랜덤이 나가도 재진입하면 같은 3건이 그대로 노출된다', async () => {
      // given
      contentStatService.isMonthlySampleSufficient.mockResolvedValue(false);
      contentService.findCandidates.mockImplementation((query) =>
        Promise.resolve(
          query.excludeTopicIds
            ? buildContents('pool', 20)
            : buildContents('a', 2),
        ),
      );

      // when
      const first = await orchestrator.getRecommendations(USER_ID, NOW);
      const second = await orchestrator.getRecommendations(USER_ID, NOW);

      // then
      expect(second[1].items.map((item) => item.contentId)).toEqual(
        first[1].items.map((item) => item.contentId),
      );
    });

    it('관심 주제 재고가 부족하면 두 번째 섹션에서 끌어와 총 9건을 유지한다', async () => {
      // given — 두 섹션의 비율(6:3)보다 전체 건수를 우선한다
      contentService.findCandidates.mockImplementation((query) =>
        Promise.resolve(
          query.excludeTopicIds
            ? buildContents('pool', 20)
            : buildContents('a', 1),
        ),
      );

      // when
      const sections = await orchestrator.getRecommendations(USER_ID, NOW);

      // then
      const total = sections.reduce(
        (sum, section) => sum + section.items.length,
        0,
      );
      expect(total).toBe(9);
    });

    it('후보가 하나도 없으면 빈 섹션을 그리지 않고 sections를 비워 돌려준다', async () => {
      // given — 정상 상태가 아니지만 에러 화면을 그리게 만들지 않는다
      contentService.findCandidates.mockResolvedValue([]);

      // when
      const sections = await orchestrator.getRecommendations(USER_ID, NOW);

      // then
      expect(sections).toEqual([]);
    });

    it('1단계를 마치지 않았으면 거부한다', async () => {
      // given
      userInterestService.findActiveTopicIds.mockResolvedValue([]);

      // when / then
      await expect(
        orchestrator.getRecommendations(USER_ID, NOW),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
      });
    });

    it('완료된 계정의 호출은 거부한다', async () => {
      // given
      user.onboardingCompleted = true;

      // when / then
      await expect(
        orchestrator.getRecommendations(USER_ID, NOW),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.ONBOARDING_ALREADY_COMPLETED,
      });
    });
  });

  describe('complete', () => {
    it('하나도 담지 않았으면 첫 드립을 기다리게 한다', async () => {
      // given
      libraryService.countBySource.mockResolvedValue(0);

      // when
      const result = await orchestrator.complete(USER_ID, NOW);

      // then
      expect(result.awaitsFirstDrip).toBe(true);
      expect(result.pickedCount).toBe(0);
    });

    it('1건 이상 담았으면 편성 결과를 기다리지 않는다', async () => {
      // given — 라이브러리가 이미 비어 있지 않다
      libraryService.countBySource.mockResolvedValue(3);

      // when
      const result = await orchestrator.complete(USER_ID, NOW);

      // then
      expect(result.awaitsFirstDrip).toBe(false);
    });

    it('담은 수와 무관하게 첫 드립 편성은 실행한다', async () => {
      // given
      libraryService.countBySource.mockResolvedValue(3);

      // when
      await orchestrator.complete(USER_ID, NOW);

      // then
      expect(firstDripService.createJob).toHaveBeenCalled();
      expect(firstDripService.runInBackground).toHaveBeenCalledWith(
        USER_ID,
        NOW,
      );
    });

    it('관심 주제가 없으면 완료시키지 않는다', async () => {
      // given — 편성 신호가 없다
      userInterestService.hasActiveInterest.mockResolvedValue(false);

      // when / then
      await expect(orchestrator.complete(USER_ID, NOW)).rejects.toMatchObject({
        errorCode: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
      });
      expect(userOnboardingService.complete).not.toHaveBeenCalled();
    });

    it('이미 완료된 계정의 재요청은 거부한다', async () => {
      // given
      user.onboardingCompleted = true;

      // when / then
      await expect(orchestrator.complete(USER_ID, NOW)).rejects.toMatchObject({
        errorCode: ErrorCode.ONBOARDING_ALREADY_COMPLETED,
      });
    });
  });

  describe('getFirstDripState', () => {
    it('완료 요청 전에 호출하면 거부한다', async () => {
      // given — 대기는 완료 이후에만 존재한다
      user.onboardingCompleted = false;

      // when / then
      await expect(
        orchestrator.getFirstDripState(USER_ID),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.ONBOARDING_NOT_COMPLETED,
      });
    });

    it('추적 행이 없으면 종료 상태로 내려 클라이언트를 진행시킨다', async () => {
      // given — 로딩 화면에 가둬 두는 것이 최악이다
      user.onboardingCompleted = true;
      firstDripService.findState.mockResolvedValue(null);

      // when
      const state = await orchestrator.getFirstDripState(USER_ID);

      // then
      expect(state.status).toBe(FirstDripJobStatus.QUEUED);
    });
  });

  describe('pickContents', () => {
    it('회수된 콘텐츠가 섞여 있어도 성공한 건만 적립하고 진행을 막지 않는다', async () => {
      // given
      contentService.resolvePickTargets.mockResolvedValue({
        available: [{ id: 'content-1' } as Content],
        failed: [
          { contentId: 'content-2', errorCode: ErrorCode.CONTENT_WITHDRAWN },
        ],
      });
      libraryService.addItems.mockResolvedValue(['content-1']);
      libraryService.countBySource.mockResolvedValue(1);

      // when
      const result = await orchestrator.pickContents(
        USER_ID,
        ['content-1', 'content-2'],
        NOW,
      );

      // then
      expect(result.savedContentIds).toEqual(['content-1']);
      expect(result.failed).toHaveLength(1);
      expect(result.pickedCount).toBe(1);
    });

    it('같은 콘텐츠를 두 번 보내면 하나로 취급한다', async () => {
      // given
      contentService.resolvePickTargets.mockResolvedValue({
        available: [],
        failed: [],
      });

      // when
      await orchestrator.pickContents(USER_ID, ['content-1', 'content-1'], NOW);

      // then
      expect(contentService.resolvePickTargets).toHaveBeenCalledWith([
        'content-1',
      ]);
    });
  });
});
