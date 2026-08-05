import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { shuffleWithSeed } from '@/common/utils/seeded-random.util';
import { FirstDripJobStatus } from '@/modules/drip/drip.enum';
import { FirstDripState } from '@/modules/drip/drip.types';
import { FirstDripService } from '@/modules/drip/services/first-drip.service';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { TopicListResult } from '@/modules/interest/interest.types';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { UserOnboardingService } from '@/modules/user/services/user-onboarding.service';
import { OnboardingStep } from '@/modules/user/user.enum';

import {
  DISCOVERY_CANDIDATE_POOL_SIZE,
  INTEREST_SECTION_SIZE,
  RECOMMENDATION_TOTAL_SIZE,
  SECTION_TITLES,
  YEARS_OF_EXPERIENCE_LOWER_BOUND,
  toYearsOfExperienceRange,
} from './onboarding.constant';
import {
  RecommendationSectionType,
  YearsOfExperienceRange,
} from './onboarding.enum';
import {
  CompleteResult,
  OnboardingState,
  PickResult,
  RecommendationItem,
  RecommendationSection,
} from './onboarding.types';

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 다단계 유스케이스이므로 Orchestrator를 둔다.
 *
 * **자기 Repository·Entity를 갖지 않는다.** 상태 저장은 전부 소유 모듈의 Service에 위임하고,
 * 여기서는 순서·조합·실패 시 진행 방식만 결정한다.
 *
 * 경로를 `/onboarding` 아래에 모으는 이유는 온보딩의 저장이 **단계 전이를 동반하기**
 * 때문이다. 같은 데이터를 다루는 `interest-management` · `profile`에 이 부수 효과를 붙이면,
 * 온보딩을 끝낸 사용자가 관심사를 고칠 때마다 재개 지점이 함께 움직인다(onboarding-api.md 3장).
 */
@Injectable()
export class OnboardingOrchestrator {
  private readonly logger = new Logger(OnboardingOrchestrator.name);

  constructor(
    private readonly userOnboardingService: UserOnboardingService,
    private readonly topicService: TopicService,
    private readonly userInterestService: UserInterestService,
    private readonly contentService: ContentService,
    private readonly contentStatService: ContentStatService,
    private readonly libraryService: LibraryService,
    private readonly firstDripService: FirstDripService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * onboarding-api.md 4.1 — **온보딩이 끝난 계정도 200을 반환한다.**
   * 404로 만들면 "완료된 상태"와 "조회 실패"를 클라이언트가 구분해야 하고,
   * 실패를 완료로 오인하면 온보딩을 처음부터 다시 시킨다.
   */
  async getState(userId: string): Promise<OnboardingState> {
    const user = await this.userOnboardingService.getUser(userId);

    const [selectedTopicIds, pickedCount] = await Promise.all([
      this.userInterestService.findActiveTopicIds(userId),
      this.libraryService.countBySource(userId, LibraryItemSource.ONBOARDING),
    ]);

    return {
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep: user.onboardingStep,
      selectedTopicIds,
      career: {
        jobCategory: user.jobCategory,
        jobTitle: user.jobTitle,
        yearsOfExperience: toYearsOfExperienceRange(user.yearsOfExperience),
      },
      pickedCount,
    };
  }

  async getTopics(): Promise<TopicListResult> {
    return this.topicService.getSelectableTopics();
  }

  /**
   * 1단계 저장. **관심사 저장과 단계 전진을 하나의 트랜잭션에서 처리한다** —
   * 관심사만 저장되고 단계가 남아 있으면 재실행 시 1단계로 되돌아가 같은 입력을 반복한다
   * (onboarding-api.md 4.3).
   */
  async replaceInterests(
    userId: string,
    topicIds: string[],
    now: Date,
  ): Promise<{ selectedTopicIds: string[]; onboardingStep: OnboardingStep }> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertNotCompleted(user);

    return this.dataSource.transaction(async (manager) => {
      const saved = await this.userInterestService.replaceOnboardingSelection(
        userId,
        topicIds,
        now,
        manager,
      );

      const updated = await this.userOnboardingService.advanceStep(
        user,
        OnboardingStep.CAREER,
        manager,
      );

      return {
        selectedTopicIds: saved,
        onboardingStep: updated.onboardingStep,
      };
    });
  }

  /**
   * 2단계 저장. **[건너뛰기]도 같은 경로를 쓴다**(빈 본문) — 전용 경로를 두면
   * "값 없이 단계만 전진"이라는 동일한 처리가 두 벌이 된다(onboarding-api.md 4.4).
   */
  async updateCareer(
    userId: string,
    career: {
      jobCategory?: string | null;
      jobTitle?: string | null;
      yearsOfExperience?: YearsOfExperienceRange | null;
    },
  ): Promise<{
    jobCategory: string | null;
    jobTitle: string | null;
    yearsOfExperience: YearsOfExperienceRange | null;
    onboardingStep: OnboardingStep;
  }> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertNotCompleted(user);

    return this.dataSource.transaction(async (manager) => {
      const command: {
        jobCategory?: string | null;
        jobTitle?: string | null;
        yearsOfExperience?: number | null;
      } = {};

      if ('jobCategory' in career) {
        command.jobCategory = career.jobCategory ?? null;
      }
      if ('jobTitle' in career) {
        command.jobTitle = career.jobTitle ?? null;
      }
      if ('yearsOfExperience' in career) {
        command.yearsOfExperience = career.yearsOfExperience
          ? YEARS_OF_EXPERIENCE_LOWER_BOUND[career.yearsOfExperience]
          : null;
      }

      const saved = await this.userOnboardingService.updateCareer(
        user,
        command,
        manager,
      );
      const updated = await this.userOnboardingService.advanceStep(
        saved,
        OnboardingStep.PICK,
        manager,
      );

      return {
        jobCategory: updated.jobCategory,
        jobTitle: updated.jobTitle,
        yearsOfExperience: toYearsOfExperienceRange(updated.yearsOfExperience),
        onboardingStep: updated.onboardingStep,
      };
    });
  }

  /**
   * 3단계 추천 — **9건을 두 섹션으로 나눠** 반환한다(onboarding.md 4 [3]).
   *
   * - 첫 섹션: 고른 주제의 콘텐츠 6건. 콜드스타트라 인기·신규 우선이며 주제에 고르게 배분한다.
   * - 둘째 섹션: **관심 주제 밖에서** 뽑는다. 이미 고른 주제 안에서 뽑으면 앞 6건과
   *   성격이 같아져 "관심사를 넓힌다"는 목적이 사라진다.
   * - 표본이 부족하면 순위 대신 랜덤 3건을 같은 자리에 놓고 섹션 제목을 바꾼다.
   * - **건수가 모자라면 총 9건을 우선한다.** 관심 주제 재고가 부족하면 둘째 섹션에서 끌어온다.
   */
  async getRecommendations(
    userId: string,
    now: Date,
  ): Promise<RecommendationSection[]> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertNotCompleted(user);

    const topicIds = await this.userInterestService.findActiveTopicIds(userId);

    if (topicIds.length === 0) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
        message: '관심 주제를 먼저 선택해주세요',
      });
    }

    const interestContents = await this.selectInterestContents(topicIds, now);
    const discoverySize = RECOMMENDATION_TOTAL_SIZE - interestContents.length;
    const { contents: discoveryContents, sectionType } =
      await this.selectDiscoveryContents(
        userId,
        topicIds,
        interestContents.map((content) => content.id),
        discoverySize,
        now,
      );

    const sections = await this.toSections(
      [
        {
          sectionType: RecommendationSectionType.INTEREST,
          contents: interestContents,
        },
        { sectionType, contents: discoveryContents },
      ],
      // items가 0건인 섹션은 응답에서 제외한다 — 제목만 그려진 빈 영역을 만들지 않는다
    );

    if (sections.length === 0) {
      // 정상 상태가 아니다. 콘텐츠 풀이 없는 주제는 애초에 선택지에 없기 때문이다.
      // 에러로 내리지 않는 이유: 사용자 화면에 "추천 0건" 상태를 두지 않기로 확정했고,
      // 5xx로 내리면 클라이언트는 에러 화면을 그릴 수밖에 없다(onboarding-api.md 4.5).
      this.logger.error('onboarding recommendations returned nothing', {
        userId,
        topicCount: topicIds.length,
      });
    }

    return sections;
  }

  /**
   * 3단계 담기. **부분 실패를 허용한다** — 회수된 콘텐츠 한 건 때문에 온보딩 마지막
   * 단계에서 이탈하는 것을 막는다(onboarding.md 7).
   */
  async pickContents(
    userId: string,
    contentIds: string[],
    now: Date,
  ): Promise<PickResult> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertNotCompleted(user);

    // 중복 값은 하나로 취급한다 (onboarding-api.md 4.6)
    const uniqueContentIds = [...new Set(contentIds)];

    const { available, failed } =
      await this.contentService.resolvePickTargets(uniqueContentIds);

    const savedContentIds = await this.libraryService.addItems(
      userId,
      available.map((content) => content.id),
      LibraryItemSource.ONBOARDING,
      now,
    );

    const pickedCount = await this.libraryService.countBySource(
      userId,
      LibraryItemSource.ONBOARDING,
    );

    return { savedContentIds, failed, pickedCount };
  }

  /**
   * 완료 처리 + 첫 드립 편성 트리거.
   *
   * **대기 여부는 서버가 판정한다**(onboarding-api.md 4.7). 클라이언트가 "나는 0건"이라고
   * 보고하는 구조면 값을 위조해 대기를 건너뛰거나(빈 라이브러리로 진입) 담은 사용자를
   * 불필요하게 대기시킬 수 있다. 판정 근거는 `library_items(source = onboarding)`이다.
   *
   * **완료 처리를 커밋한 뒤에 편성을 시작한다**(architecture.md 8.3·8.5).
   * 편성 실패로 완료를 롤백하지 않는다.
   */
  async complete(userId: string, now: Date): Promise<CompleteResult> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertNotCompleted(user);

    const hasInterest =
      await this.userInterestService.hasActiveInterest(userId);

    if (!hasInterest) {
      // 편성 신호가 없으므로 완료시키지 않는다 (onboarding-api.md 4.7)
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
        message: '관심 주제를 먼저 선택해주세요',
      });
    }

    const completed = await this.dataSource.transaction(async (manager) => {
      const saved = await this.userOnboardingService.complete(
        user,
        now,
        manager,
      );
      // 완료는 됐는데 추적할 행이 없으면 클라이언트가 폴링할 대상이 사라진다
      await this.firstDripService.createJob(userId, now, manager);
      return saved;
    });

    const pickedCount = await this.libraryService.countBySource(
      userId,
      LibraryItemSource.ONBOARDING,
    );

    // 커밋 이후에 편성을 시작한다. 응답을 붙잡아 두지 않는다 — 편성은 소요 시간을
    // 보장할 수 없는 작업이라, 한 요청에 묶으면 이미 커밋된 완료가 실패로 보인다.
    void this.firstDripService.runInBackground(userId, now);

    const state = await this.firstDripService.findState(userId);

    return {
      onboardingCompletedAt: completed.onboardingCompletedAt ?? now,
      pickedCount,
      // 1건 이상 담았으면 기다리게 하지 않는다 — 라이브러리가 이미 비어 있지 않다
      awaitsFirstDrip: pickedCount === 0,
      firstDripStatus: state?.status ?? FirstDripJobStatus.PENDING,
    };
  }

  /** onboarding-api.md 4.8 — 0건 담기 경로에서 완료 화면을 언제 띄울지 판정한다 */
  async getFirstDripState(userId: string): Promise<FirstDripState> {
    const user = await this.userOnboardingService.getUser(userId);
    this.userOnboardingService.assertCompleted(user);

    const state = await this.firstDripService.findState(userId);

    if (!state) {
      // 완료 시점에 반드시 만들어지는 행이라 없다는 것은 정합성 오류다.
      // 종료 상태로 내려 클라이언트를 진행시킨다 — 로딩 화면에 가둬 두는 것이 최악이다.
      this.logger.error('first drip job is missing for completed user', {
        userId,
      });

      return {
        status: FirstDripJobStatus.QUEUED,
        itemCount: 0,
        completedAt: null,
      };
    }

    return state;
  }

  /**
   * 관심 주제 추천 6건을 **선택한 주제에 고르게 배분한다.**
   * 특정 주제의 재고가 부족하면 남은 주제에서 채운다(onboarding.md 4 [3]).
   */
  private async selectInterestContents(
    topicIds: string[],
    now: Date,
  ): Promise<Content[]> {
    const quotaPerTopic = Math.max(
      1,
      Math.floor(INTEREST_SECTION_SIZE / topicIds.length),
    );
    const selected: Content[] = [];

    for (const topicId of topicIds) {
      if (selected.length >= INTEREST_SECTION_SIZE) {
        break;
      }

      const contents = await this.contentService.findCandidates({
        includeTopicIds: [topicId],
        excludeContentIds: selected.map((content) => content.id),
        // 1편을 듣지 않은 신규 사용자에게 시리즈 중간 편을 권하지 않는다
        seriesStartOnly: true,
        limit: Math.min(quotaPerTopic, INTEREST_SECTION_SIZE - selected.length),
        now,
      });

      selected.push(...contents);
    }

    if (selected.length >= INTEREST_SECTION_SIZE) {
      return selected;
    }

    const filler = await this.contentService.findCandidates({
      includeTopicIds: topicIds,
      excludeContentIds: selected.map((content) => content.id),
      seriesStartOnly: true,
      limit: INTEREST_SECTION_SIZE - selected.length,
      now,
    });

    return [...selected, ...filler];
  }

  /**
   * 두 번째 섹션 — 월간 인기 또는 랜덤 폴백.
   *
   * **랜덤이어도 후보 필터는 그대로 지킨다**(발행 상태·라이선스 유효·관심 주제 밖·
   * 앞 6건과 중복 아님). 랜덤은 "순위를 정할 근거가 없다"는 뜻이지 "아무거나 내보낸다"는
   * 뜻이 아니다.
   */
  private async selectDiscoveryContents(
    userId: string,
    interestTopicIds: string[],
    excludeContentIds: string[],
    size: number,
    now: Date,
  ): Promise<{ contents: Content[]; sectionType: RecommendationSectionType }> {
    if (size <= 0) {
      return {
        contents: [],
        sectionType: RecommendationSectionType.MONTHLY_POPULAR,
      };
    }

    const pool = await this.contentService.findCandidates({
      excludeTopicIds: interestTopicIds,
      excludeContentIds,
      seriesStartOnly: true,
      limit: DISCOVERY_CANDIDATE_POOL_SIZE,
      now,
    });

    const isSampleSufficient =
      await this.contentStatService.isMonthlySampleSufficient(now);

    if (!isSampleSufficient) {
      return {
        // 사용자·세션 단위로 고정한다 — 뒤로가기로 돌아왔을 때 카드가 바뀌면 안 된다
        contents: shuffleWithSeed(pool, userId).slice(0, size),
        sectionType: RecommendationSectionType.TOPIC_DISCOVERY,
      };
    }

    const rankedIds =
      await this.contentStatService.findMonthlyPopularContentIds(
        now,
        DISCOVERY_CANDIDATE_POOL_SIZE,
      );
    const rankByContentId = new Map(
      rankedIds.map((contentId, index) => [contentId, index]),
    );

    // 순위에 없는 후보는 뒤로 보내되 버리지 않는다 — 중복·부족분은 다음 순위로 채운다
    const ordered = [...pool].sort(
      (left, right) =>
        (rankByContentId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankByContentId.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      contents: ordered.slice(0, size),
      sectionType: RecommendationSectionType.MONTHLY_POPULAR,
    };
  }

  /**
   * 응답 섹션으로 환산한다.
   *
   * **오디오 서명 URL과 대본을 담지 않는다.** 3단계는 담기 화면이지 재생 화면이 아니다 —
   * 재생하지 않을 9건에 서명 URL을 발급하면 유출 창구만 9개 늘어난다(architecture.md 9.4).
   */
  private async toSections(
    groups: { sectionType: RecommendationSectionType; contents: Content[] }[],
  ): Promise<RecommendationSection[]> {
    const contentIds = groups.flatMap((group) =>
      group.contents.map((content) => content.id),
    );
    const topicViews = await this.contentService.findTopicViews(contentIds);

    const topicsByContentId = new Map<
      string,
      { topicId: string; name: string }[]
    >();

    for (const view of topicViews) {
      const topics = topicsByContentId.get(view.contentId) ?? [];
      topics.push({ topicId: view.topicId, name: view.name });
      topicsByContentId.set(view.contentId, topics);
    }

    return groups
      .filter((group) => group.contents.length > 0)
      .map((group) => ({
        sectionType: group.sectionType,
        title: SECTION_TITLES[group.sectionType],
        items: group.contents.map((content): RecommendationItem => ({
          contentId: content.id,
          title: content.title,
          authorName: content.authorName,
          sourceName: content.sourceName,
          thumbnailUrl: content.thumbnailUrl,
          durationSec: content.durationSec,
          topics: topicsByContentId.get(content.id) ?? [],
        })),
      }));
  }
}
