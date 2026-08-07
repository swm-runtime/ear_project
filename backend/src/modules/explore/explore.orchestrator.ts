import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { toPreviousFinalWeekStart } from '@/common/utils/service-date.util';
import { ContentTopicView } from '@/modules/content/content.types';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import {
  COLD_START_COMPLETE_SIGNAL_COUNT,
  EXPLORE_RANKING_POOL_SIZE,
  EXPLORE_SECTION_ITEM_COUNT,
  EXPLORE_SECTION_TITLES,
  MAX_RECENT_SIGNAL_COUNT,
  SIGNAL_RECENCY_WINDOW_DAYS,
} from './explore.constant';
import { decodeExploreCursor, encodeExploreCursor } from './explore.cursor';
import { ExploreSectionKey, SaveReason } from './explore.enum';
import { rankByTopicWeights, toTopicWeights } from './explore.ranking';
import {
  ExploreContentListQuery,
  ExploreContentListResult,
  ExploreFeedResult,
  ExploreItemView,
  ExploreSectionDraft,
  ExploreSectionView,
  SaveContentCommand,
  SaveContentResult,
} from './explore.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 유스케이스라 Orchestrator를 둔다.
 * **자기 Repository·Entity를 갖지 않는다**(`onboarding` · `library-screen`과 같은 형태).
 *
 * 탐색 한 화면에 `contents` · `content_topics` · `content_stats`(content), `library_items`
 * (library), `play_records` · `user_signals`(playback), `user_interests` · `topics`
 * (interest), `drip_excluded_contents`(drip)가 함께 들어간다. 어느 한 모듈의 Entity로
 * 환원되지 않으므로 소유 모듈들 **위에서** 조합한다.
 *
 * 검색(explore-api.md 4.5)은 여기에 없다 — **P1 확정이라 MVP에서 배포하지 않는다**
 * (합의 2026-08-06). 클라이언트도 검색창을 비활성으로 노출하므로 호출할 일이 없다.
 */
@Injectable()
export class ExploreOrchestrator {
  constructor(
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly userInterestService: UserInterestService,
    private readonly topicService: TopicService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * explore-api.md 4.1 — 탐색 탭 진입·당겨서 새로고침·포그라운드 복귀·플레이어 복귀가
   * 모두 이 하나를 호출한다.
   *
   * **잔여 재생 표시값을 같은 응답에 얹는다**(`explore.md` 3장). 피드를 여는 시점이 곧 그
   * 값을 갱신해야 하는 시점이라, 호출을 나누면 화면과 숫자가 어긋나는 구간이 생긴다.
   */
  async getFeed(userId: string, now: Date): Promise<ExploreFeedResult> {
    const [activeTopicIds, completeSignalCount] = await Promise.all([
      this.userInterestService.findActiveTopicIds(userId),
      this.playbackService.countSignals(userId, UserSignalAction.COMPLETE),
    ]);

    const isColdStart = completeSignalCount < COLD_START_COMPLETE_SIGNAL_COUNT;

    const [interestContents, recentContents, popularContents, topicGroups] =
      await Promise.all([
        this.findInterestContents(userId, activeTopicIds, isColdStart, now),
        this.contentService.findRecent(EXPLORE_SECTION_ITEM_COUNT, now),
        this.contentService.findPopular(
          toPreviousFinalWeekStart(now),
          EXPLORE_SECTION_ITEM_COUNT,
          now,
        ),
        this.findTopicGroupDrafts(activeTopicIds, now),
      ]);

    const interest: ExploreSectionDraft = {
      key: ExploreSectionKey.INTEREST,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.INTEREST],
      topic: null,
      contents: interestContents,
    };
    const recent: ExploreSectionDraft = {
      key: ExploreSectionKey.NEW,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.NEW],
      topic: null,
      contents: recentContents,
    };
    const popular: ExploreSectionDraft = {
      key: ExploreSectionKey.POPULAR,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.POPULAR],
      topic: null,
      contents: popularContents,
    };

    // 신호가 부족한 신규 사용자는 **인기·신규 섹션 비중을 높인다**(콜드스타트 — FR-17).
    // 클라이언트는 내려온 순서대로 그릴 뿐이다
    const drafts = isColdStart
      ? [popular, recent, interest, ...topicGroups]
      : [interest, recent, popular, ...topicGroups];

    const [sections, quota] = await Promise.all([
      // 비어 있는 섹션은 내려주지 않는다 — 제목만 있고 아무것도 없는 줄을 그리게 된다.
      // 전부 비면 `sections: []`이고, 클라이언트는 빈 피드 화면을 그린다(404가 아니다)
      this.toSectionViews(
        userId,
        drafts.filter((draft) => draft.contents.length > 0),
        now,
      ),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    return { sections, quota };
  }

  /**
   * explore-api.md 4.2 — 주제 필터를 걸었을 때의 단일 목록.
   *
   * **정렬은 추천 랭킹 순(서버 계산)이며 정렬 파라미터를 두지 않는다** — 탐색 목록은 발견
   * 화면이지 관리 화면이 아니다.
   *
   * 여기서는 피드의 관심사 섹션과 달리 **신호 기반 재정렬을 얹지 않는다.** 재정렬은 읽어 온
   * 후보 안에서만 순서를 바꾸는데(`explore.ranking`), 커서 페이지네이션은 정렬 키가 SQL에
   * 그대로 표현돼야 페이지 경계가 어긋나지 않는다. 목록은 이미 선택한 주제로 좁혀져 있어
   * 주제 가중치가 더할 정보도 거의 없다.
   */
  async getContents(
    userId: string,
    query: ExploreContentListQuery,
    now: Date,
  ): Promise<ExploreContentListResult> {
    const page = await this.contentService.findExplorePage({
      topicIds: query.topicIds,
      cursor: query.cursor
        ? decodeExploreCursor(query.cursor, query.topicIds)
        : null,
      limit: query.limit,
      now,
    });

    const [items, quota] = await Promise.all([
      this.decorate(
        userId,
        page.items.map((ranked) => ranked.content),
        now,
      ),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    const lastItem = page.items.at(-1);

    return {
      items,
      // `has_next`가 false면 커서를 발급하지 않는다 — 끝인지 아닌지를 두 값이 말하면 어긋난다
      nextCursor:
        page.hasNext && lastItem
          ? encodeExploreCursor(
              {
                playCount: lastItem.playCount,
                publishedAt: lastItem.content.publishedAt,
                id: lastItem.content.id,
              },
              query.topicIds,
            )
          : null,
      hasNext: page.hasNext,
      quota,
    };
  }

  /**
   * explore-api.md 4.3 — 담기. **횟수 제한이 없고 페이월을 노출하지 않는다**(PRD 5.4).
   *
   * 서버 처리를 하나의 트랜잭션으로 묶는다(architecture.md 8.1). 라이브러리 행과 신호가
   * 따로 커밋되면 신호만 남은 담기가 생긴다.
   */
  async saveContent(command: SaveContentCommand): Promise<SaveContentResult> {
    return this.dataSource.transaction(async (manager) => {
      // 회수 여부는 피드에서 걸러도 이미 화면에 떠 있는 행이 탭될 수 있다
      await this.contentService.getPublishedById(command.contentId, manager);

      const saved = await this.libraryService.save(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // **자동 적립은 신호를 남기지 않는다**(explore-api.md 4.3) — 사용자의 "담기" 의사가
      // 아니라서 `save`로 적재하면 추천 입력이 왜곡된다.
      //
      // **라이브러리 상태가 바뀐 경우에만 남긴다.** `user_signals`는 중복을 막는 제약이 없는
      // 이력 테이블이라(domain.md 6.4), 이미 담긴 콘텐츠에 오프라인 큐가 같은 담기를
      // 재전송하면 행은 그대로인데 신호만 쌓여 그 주제의 가중치가 부풀려진다. 라이브러리
      // 삭제(`library-api.md` 4.6)·담기 해제(4.4)가 같은 이유로 이미 no-op 신호를 막고 있다.
      const isLibraryChanged = saved.created || saved.reactivated;

      if (command.reason === SaveReason.USER_SAVE && isLibraryChanged) {
        await this.playbackService.recordSignal(
          command.userId,
          command.contentId,
          UserSignalAction.SAVE,
          manager,
        );
      }

      const quota = await this.playbackService.buildQuotaForUser(
        command.userId,
        command.now,
        manager,
      );

      return { item: saved.item, created: saved.created, quota };
    });
  }

  /**
   * explore-api.md 4.4 — 담기 해제. **라이브러리 삭제와 동일한 결과**를 만든다(FR-16).
   *
   * **회수된 콘텐츠도 해제할 수 있다.** 이 경로는 존재 여부만 확인하며(`getById`), 회수를
   * 이유로 막으면 사용자는 목록에 남은 항목을 영영 치울 수 없다 — 그래서 이 엔드포인트의
   * 에러는 `CONTENT_NOT_FOUND` 하나뿐이다.
   *
   * **영구 제외 사실을 응답으로 알리지 않는다**(`library.md` 4.5와 같은 이유 — 가벼운 조작에
   * 무거운 고지를 붙이지 않는다).
   */
  async unsaveContent(
    userId: string,
    contentId: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.contentService.getById(contentId, manager);

      const removed = await this.libraryService.unsave(
        userId,
        contentId,
        now,
        manager,
      );

      // **해제할 대상이 없으면 여기서 끝난다.** 오프라인 큐가 같은 해제를 다시 보낼 수
      // 있는데, 없던 담기의 해제로 영구 제외와 부정 신호가 쌓이면 안 된다
      if (!removed) {
        return;
      }

      await this.dripExclusionService.exclude(
        userId,
        contentId,
        DripExclusionReason.UNSAVE,
        now,
        manager,
      );

      await this.playbackService.recordSignal(
        userId,
        contentId,
        UserSignalAction.UNSAVE,
        manager,
      );
    });
  }

  /**
   * 관심사 섹션의 후보(`explore.md` 4.1).
   *
   * **관심 주제 0개 상태는 생기지 않는다** — 관심사 관리가 최소 1개 선택을 강제한다
   * (합의 2026-08-06). 그래도 빈 배열을 돌려주는 것은 방어이며, 섹션이 통째로 빠질 뿐
   * 나머지 피드는 그대로 나간다.
   */
  private async findInterestContents(
    userId: string,
    activeTopicIds: string[],
    isColdStart: boolean,
    now: Date,
  ): Promise<Content[]> {
    if (activeTopicIds.length === 0) {
      return [];
    }

    const pool = await this.contentService.findCandidates({
      includeTopicIds: activeTopicIds,
      limit: EXPLORE_RANKING_POOL_SIZE,
      now,
    });

    // 콜드스타트에서는 신호 기반 항목을 사실상 0으로 둔다(`drip-scheduling.md` 4.4).
    // 후보는 이미 인기·신선도 순이므로 그대로 자르는 것이 그 규칙의 적용이다
    if (isColdStart || pool.length === 0) {
      return pool.slice(0, EXPLORE_SECTION_ITEM_COUNT);
    }

    const signals = await this.playbackService.findRecentSignals(
      userId,
      new Date(now.getTime() - SIGNAL_RECENCY_WINDOW_DAYS * DAY_MS),
      MAX_RECENT_SIGNAL_COUNT,
    );

    // 후보와 신호 대상의 주제를 **한 번에** 읽는다 — 나눠 읽으면 조회가 두 배가 된다
    const topicIdsByContentId = await this.findTopicIdsByContentId([
      ...pool.map((content) => content.id),
      ...signals.map((signal) => signal.contentId),
    ]);

    const ranked = rankByTopicWeights(
      pool,
      topicIdsByContentId,
      toTopicWeights(signals, topicIdsByContentId, now),
    );

    return ranked.slice(0, EXPLORE_SECTION_ITEM_COUNT);
  }

  /**
   * 주제별 모아보기 섹션(`explore.md` 4.1) — 사용자 관심 주제 하나당 한 섹션.
   *
   * 주제 이름을 제목으로 쓰므로 `topics`를 함께 읽는다. **없는 주제는 섹션을 만들지 않는다** —
   * `user_interests`가 FK로 묶여 있어 정상 상태에서는 발생하지 않는 방어다.
   */
  private async findTopicGroupDrafts(
    activeTopicIds: string[],
    now: Date,
  ): Promise<ExploreSectionDraft[]> {
    if (activeTopicIds.length === 0) {
      return [];
    }

    const topics = await this.topicService.findAllByIds(activeTopicIds);
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));

    const drafts = await Promise.all(
      activeTopicIds.map(
        async (topicId): Promise<ExploreSectionDraft | null> => {
          const topic = topicById.get(topicId);

          if (!topic) {
            return null;
          }

          const contents = await this.contentService.findCandidates({
            includeTopicIds: [topicId],
            limit: EXPLORE_SECTION_ITEM_COUNT,
            now,
          });

          return {
            key: ExploreSectionKey.TOPIC_GROUP,
            title: topic.name,
            topic: { id: topic.id, name: topic.name },
            contents,
          };
        },
      ),
    );

    return drafts.filter(
      (draft): draft is ExploreSectionDraft => draft !== null,
    );
  }

  /**
   * 섹션들에 표시값(주제·담김·오늘 카운트)을 붙인다.
   *
   * **섹션마다 조회하지 않는다.** 콘텐츠가 여러 섹션에 중복 등장하므로 전체를 모아 한 번에
   * 읽고 나눠 준다(architecture.md 3.4 — N+1 회피).
   */
  private async toSectionViews(
    userId: string,
    drafts: ExploreSectionDraft[],
    now: Date,
  ): Promise<ExploreSectionView[]> {
    if (drafts.length === 0) {
      return [];
    }

    const contents = drafts.flatMap((draft) => draft.contents);
    const decorated = await this.decorate(userId, contents, now);
    const itemByContentId = new Map(
      decorated.map((item) => [item.content.id, item]),
    );

    return drafts.map((draft) => ({
      key: draft.key,
      title: draft.title,
      topic: draft.topic,
      items: draft.contents
        .map((content) => itemByContentId.get(content.id))
        .filter((item): item is ExploreItemView => item !== undefined),
    }));
  }

  /**
   * 콘텐츠 목록에 주제·라이브러리 상태·오늘 카운트를 붙인다.
   *
   * **담김 여부는 노출·순서에 어떤 영향도 주지 않는다**(`explore.md` 4.1) — 이미 담긴
   * 콘텐츠도 전부 내려주고 표시만 붙인다. 초기 콘텐츠 풀이 작아 제외하면 피드가 빈다.
   */
  private async decorate(
    userId: string,
    contents: Content[],
    now: Date,
    manager?: EntityManager,
  ): Promise<ExploreItemView[]> {
    if (contents.length === 0) {
      return [];
    }

    // 같은 콘텐츠가 여러 섹션에 걸쳐 있으므로 중복을 제거하고 조회한다
    const contentIds = [...new Set(contents.map((content) => content.id))];

    const [topicViews, libraryItems, countedContentIds] = await Promise.all([
      this.contentService.findTopicViews(contentIds, manager),
      this.libraryService.findActiveItems(userId, contentIds, manager),
      this.playbackService.findCountedContentIds(userId, now, manager),
    ]);

    const topicIdsByContentId = groupTopicIds(topicViews);
    const libraryItemByContentId = new Map<string, LibraryItem>(
      libraryItems.map((item) => [item.contentId, item]),
    );

    return contents.map((content) => {
      const libraryItem = libraryItemByContentId.get(content.id);

      return {
        content: {
          id: content.id,
          title: content.title,
          authorName: content.authorName,
          sourceName: content.sourceName,
          durationSec: content.durationSec,
          thumbnailUrl: content.thumbnailUrl,
          contentVersion: content.contentVersion,
          topicIds: topicIdsByContentId.get(content.id) ?? [],
        },
        library: libraryItem
          ? {
              itemId: libraryItem.id,
              source: libraryItem.source,
              status: libraryItem.status,
            }
          : null,
        isCountedToday: countedContentIds.has(content.id),
      };
    });
  }

  /** 랭킹 입력용 — `content_id`별 주제 목록 */
  private async findTopicIdsByContentId(
    contentIds: string[],
  ): Promise<Map<string, string[]>> {
    return groupTopicIds(
      await this.contentService.findTopicViews([...new Set(contentIds)]),
    );
  }
}

function groupTopicIds(views: ContentTopicView[]): Map<string, string[]> {
  const byContentId = new Map<string, string[]>();

  for (const view of views) {
    const topicIds = byContentId.get(view.contentId) ?? [];
    topicIds.push(view.topicId);
    byContentId.set(view.contentId, topicIds);
  }

  return byContentId;
}
