import { toServiceDayRange } from '@/common/utils/service-date.util';
import { ContentStatus } from '@/modules/content/content.enum';
import { ContentCandidateQuery } from '@/modules/content/content.types';
import { Content } from '@/modules/content/entities/content.entity';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { UserDripPlan } from '@/modules/drip-batch/drip-batch.types';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { MAX_AUTO_EXPAND_TOPIC_COUNT } from '@/modules/interest/interest.constant';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { User } from '@/modules/user/entities/user.entity';

import { EvalSnapshot } from './recommend-eval.types';

export interface WorldInterest {
  topicId: string;
  source: string;
  isActive: boolean;
  isUserRemoved: boolean;
  updatedAt: Date;
}

export interface WorldSignal {
  contentId: string;
  action: string;
  createdAt: Date;
}

export interface WorldLibraryItem {
  contentId: string;
  source: string;
  status: string;
  addedAt: Date;
  completedAt: Date | null;
  deletedAt: Date | null;
}

export interface WorldUser {
  key: string;
  tier: string;
  jobCategory: string | null;
  yearsOfExperience: number | null;
  autoExpandEnabled: boolean;
  interests: WorldInterest[];
  signals: WorldSignal[];
  library: WorldLibraryItem[];
  excluded: { contentId: string; createdAt: Date }[];
}

export interface WorldContent {
  content: Content;
  topicIds: string[];
  playCount: number;
  completeCount: number;
  embedding: number[] | null;
}

export interface WorldTopic {
  id: string;
  name: string;
  isVisible: boolean;
}

const DRIP_SOURCES: string[] = [
  LibraryItemSource.DRIP,
  LibraryItemSource.DISCOVERY,
];

/**
 * 평가용 **인메모리 세계** — 스냅샷(또는 합성 카탈로그)을 들고, 편성 계산이 DB에 묻는 것들에 대신 답한다.
 *
 * 평가기는 점수식을 다시 구현하지 않는다. **제품과 같은 `DripBatchOrchestrator.planForUser`를 그대로 돌리고**
 * 그 의존 서비스만 이 세계로 바꿔 끼운다 — 스코어링·다양성 선정·시리즈 게이트·취향 계산·자동 확장을 고치면
 * 평가 결과가 따라 움직이는 것이 이 구조의 목적이다(`docs/backend/recommendation-evaluation.md` 2장).
 *
 * 여기서 흉내 내는 것은 **SQL이 하던 일뿐**이다: 후보 필터·정렬(`ContentRepository.findCandidates`),
 * 라이브러리 집계(`LibraryItemRepository`), 신호 조회(`UserSignalRepository`). 그 쿼리가 바뀌면 아래 대응 메서드도
 * 고쳐야 한다 — 메서드마다 원본 위치를 적어 둔다.
 */
export class EvalWorld {
  readonly contents = new Map<string, WorldContent>();
  readonly topics = new Map<string, WorldTopic>();
  readonly users = new Map<string, WorldUser>();
  readonly planCounts = new Map<string, { drip: number; discovery: number }>();

  static fromSnapshot(snapshot: EvalSnapshot): EvalWorld {
    const world = new EvalWorld();

    for (const plan of snapshot.plans) {
      world.planCounts.set(plan.tier, {
        drip: plan.daily_drip_count,
        discovery: plan.daily_discovery_count,
      });
    }

    for (const topic of snapshot.topics) {
      world.topics.set(topic.id, {
        id: topic.id,
        name: topic.name,
        isVisible: topic.is_visible,
      });
    }

    for (const row of snapshot.contents) {
      world.contents.set(row.id, {
        content: {
          id: row.id,
          title: row.title,
          authorName: row.author_name,
          sourceName: row.source_name,
          durationSec: row.duration_sec,
          publishedAt: new Date(row.published_at),
          difficulty: row.difficulty,
          format: row.format,
          isEvergreen: row.is_evergreen,
          keywords: row.keywords,
          targetAudiences: row.target_audiences,
          seriesId: row.series_id,
          episodeNo: row.episode_no,
          status: row.status,
          licenseExpiresAt: row.license_expires_at
            ? new Date(row.license_expires_at)
            : null,
          contentVersion: 1,
        } as unknown as Content,
        topicIds: [...row.topic_ids],
        playCount: row.play_count,
        completeCount: row.complete_count,
        embedding: row.embedding,
      });
    }

    for (const user of snapshot.users) {
      world.users.set(user.key, {
        key: user.key,
        tier: user.tier,
        jobCategory: user.job_category,
        yearsOfExperience: user.years_of_experience,
        autoExpandEnabled: user.auto_expand_enabled,
        interests: user.interests.map((interest) => ({
          topicId: interest.topic_id,
          source: interest.source,
          isActive: interest.is_active,
          isUserRemoved: interest.is_user_removed,
          updatedAt: new Date(interest.updated_at),
        })),
        signals: user.signals.map((signal) => ({
          contentId: signal.content_id,
          action: signal.action,
          createdAt: new Date(signal.created_at),
        })),
        library: user.library.map((item) => ({
          contentId: item.content_id,
          source: item.source,
          status: item.status,
          addedAt: new Date(item.added_at),
          completedAt: item.completed_at ? new Date(item.completed_at) : null,
          deletedAt: item.deleted_at ? new Date(item.deleted_at) : null,
        })),
        excluded: user.excluded.map((row) => ({
          contentId: row.content_id,
          createdAt: new Date(row.created_at),
        })),
      });
    }

    return world;
  }

  /**
   * **시간 되감기** — `cutoff` 시점에 서버가 알던 것만 남긴 세계를 만든다(백테스트용).
   *
   * 그 뒤에 생긴 신호·라이브러리·제외 기록·발행 콘텐츠를 걷어낸다. 되감을 수 없는 것이 둘 있다:
   * 콘텐츠 집계(`play_count`·`complete_count`)는 누적값뿐이라 현재 값을 그대로 쓰고, 관심 주제는 변경 이력이
   * 없어 현재 목록을 쓴다. 둘 다 리포트 한계로 문서에 적어 둔다.
   */
  at(cutoff: Date): EvalWorld {
    const world = new EvalWorld();
    const before = (date: Date) => date.getTime() < cutoff.getTime();

    for (const [tier, counts] of this.planCounts) {
      world.planCounts.set(tier, { ...counts });
    }

    for (const [id, topic] of this.topics) {
      world.topics.set(id, { ...topic });
    }

    for (const [id, entry] of this.contents) {
      if (before(entry.content.publishedAt)) {
        world.contents.set(id, { ...entry, topicIds: [...entry.topicIds] });
      }
    }

    for (const [key, user] of this.users) {
      world.users.set(key, {
        ...user,
        interests: user.interests.map((interest) => ({ ...interest })),
        signals: user.signals.filter((signal) => before(signal.createdAt)),
        library: user.library
          .filter((item) => before(item.addedAt))
          .map((item) => {
            const completed =
              item.completedAt !== null && before(item.completedAt);

            return {
              ...item,
              // 그 시점에 아직 완청 전이었다면 미청취로 본다(진행 중 여부는 되감을 수 없다)
              status: completed
                ? LibraryItemStatus.COMPLETED
                : item.status === (LibraryItemStatus.COMPLETED as string)
                  ? LibraryItemStatus.UNPLAYED
                  : item.status,
              completedAt: completed ? item.completedAt : null,
              deletedAt:
                item.deletedAt !== null && before(item.deletedAt)
                  ? item.deletedAt
                  : null,
            };
          }),
        excluded: user.excluded.filter((row) => before(row.createdAt)),
      });
    }

    return world;
  }

  clone(): EvalWorld {
    return this.at(new Date(8.64e15));
  }

  user(key: string): WorldUser {
    const user = this.users.get(key);

    if (!user) {
      throw new Error(`평가 세계에 없는 사용자: ${key}`);
    }

    return user;
  }

  /** 발행 중(가시) 콘텐츠 — `CONTENT_VISIBILITY_CONDITION`(content.visibility.ts)의 메모리 판정 */
  visibleContents(now: Date): WorldContent[] {
    return [...this.contents.values()].filter(
      ({ content }) =>
        (content.status as string) === (ContentStatus.PUBLISHED as string) &&
        (content.licenseExpiresAt === null ||
          content.licenseExpiresAt.getTime() > now.getTime()) &&
        // 제품 SQL에는 없는 조건 — 되감은 세계에서 "아직 발행되지 않은 콘텐츠"를 막는다
        content.publishedAt.getTime() <= now.getTime(),
    );
  }

  /** 전 사용자 편성 이력 수 — `LibraryItemRepository.countExposuresByContentIds`(삭제분 포함) */
  exposureCount(contentId: string): number {
    let total = 0;

    for (const user of this.users.values()) {
      for (const item of user.library) {
        if (
          item.contentId === contentId &&
          DRIP_SOURCES.includes(item.source)
        ) {
          total += 1;
        }
      }
    }

    return total;
  }

  // ── 상태 변경 — 페르소나 구성·시뮬레이션이 쓴다 ────────────────────────────────

  /** 편성분 적립 — `DripPlacementService.placeItems`가 남기는 것(라이브러리 행 + 영구 제외) */
  place(key: string, contentIds: string[], source: string, now: Date): void {
    const user = this.user(key);

    for (const contentId of contentIds) {
      user.library.push({
        contentId,
        source,
        status: LibraryItemStatus.UNPLAYED,
        addedAt: now,
        completedAt: null,
        deletedAt: null,
      });
      user.excluded.push({ contentId, createdAt: now });
    }
  }

  /** 스스로 담기 — 라이브러리 행 + `save` 신호 */
  save(key: string, contentId: string, at: Date): void {
    const user = this.user(key);

    if (!user.library.some((item) => item.contentId === contentId)) {
      user.library.push({
        contentId,
        source: LibraryItemSource.SAVE,
        status: LibraryItemStatus.UNPLAYED,
        addedAt: at,
        completedAt: null,
        deletedAt: null,
      });
      user.signals.push({
        contentId,
        action: UserSignalAction.SAVE,
        createdAt: at,
      });
    }
  }

  /** 재생 후 완청 — 라이브러리에 없으면 탐색 재생처럼 자동 적립한다(신호는 play·complete) */
  complete(key: string, contentId: string, at: Date): void {
    const user = this.user(key);
    let item = user.library.find((row) => row.contentId === contentId);

    if (!item) {
      item = {
        contentId,
        source: LibraryItemSource.SAVE,
        status: LibraryItemStatus.UNPLAYED,
        addedAt: at,
        completedAt: null,
        deletedAt: null,
      };
      user.library.push(item);
    }

    if (!user.excluded.some((row) => row.contentId === contentId)) {
      user.excluded.push({ contentId, createdAt: at });
    }

    user.signals.push({
      contentId,
      action: UserSignalAction.PLAY,
      createdAt: at,
    });

    if (item.status !== (LibraryItemStatus.COMPLETED as string)) {
      item.status = LibraryItemStatus.COMPLETED;
      item.completedAt = at;
      user.signals.push({
        contentId,
        action: UserSignalAction.COMPLETE,
        createdAt: at,
      });

      const entry = this.contents.get(contentId);

      if (entry) {
        entry.playCount += 1;
        entry.completeCount += 1;
      }
    }
  }

  /** 라이브러리 삭제 — 소프트 삭제 + 영구 제외 + `delete` 신호 */
  remove(key: string, contentId: string, at: Date): void {
    const user = this.user(key);
    const item = user.library.find((row) => row.contentId === contentId);

    if (!item || item.deletedAt !== null) {
      return;
    }

    item.deletedAt = at;

    if (!user.excluded.some((row) => row.contentId === contentId)) {
      user.excluded.push({ contentId, createdAt: at });
    }

    user.signals.push({
      contentId,
      action: UserSignalAction.DELETE,
      createdAt: at,
    });
  }

  // ── 편성 계산 — 제품 코드를 그대로 돌린다 ─────────────────────────────────────

  /**
   * 이 세계를 데이터 원천으로 삼는 **제품 편성기**. 적립·알림·배치 기록 쪽 의존은 비워 둔다 —
   * `planForUser`는 그것들을 부르지 않는다.
   */
  planner(autoExpandFeature: boolean): DripBatchOrchestrator {
    const preferenceVectorService = new PreferenceVectorService({
      upsert: () => Promise.resolve(),
    } as never);

    return new DripBatchOrchestrator(
      {} as never,
      this.userInterestService() as never,
      this.planService() as never,
      this.contentService() as never,
      this.contentStatService() as never,
      this.libraryService() as never,
      this.playbackService() as never,
      preferenceVectorService,
      new DripScoringService(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      this.topicService() as never,
      this.userSettingService() as never,
      {
        get: (name: string) =>
          name === 'AUTO_EXPAND_ENABLED'
            ? String(autoExpandFeature)
            : undefined,
      } as never,
    );
  }

  /**
   * 사용자 한 명의 편성 계산. `commit`이면 자동 확장 판정을 이 세계에 반영한다(시뮬레이션) —
   * 취향 캐시는 어느 쪽이든 저장할 곳이 없어 매번 다시 계산한다.
   */
  async plan(
    key: string,
    now: Date,
    options: { commit: boolean; autoExpandFeature: boolean },
  ): Promise<UserDripPlan> {
    const user = this.user(key);

    return this.planner(options.autoExpandFeature).planForUser(
      {
        id: key,
        tier: user.tier,
        jobCategory: user.jobCategory,
        yearsOfExperience: user.yearsOfExperience,
      } as unknown as User,
      now,
      new Map(),
      {
        persistPreference: false,
        persistAutoExpand: options.commit,
        // 평가는 "무엇이 갔을까"를 본다 — 재고·이미 편성 스킵에서 멈추지 않는다
        stopAtSkip: false,
      },
    );
  }

  // ── 아래는 SQL을 대신하는 답들 ───────────────────────────────────────────────

  private userInterestService() {
    return {
      // `UserInterestService.findAllActive` — 활성 + 주제 노출 중
      findAllActive: (key: string) =>
        Promise.resolve(
          this.user(key).interests.filter(
            (interest) =>
              interest.isActive &&
              this.topics.get(interest.topicId)?.isVisible === true,
          ),
        ),
      findUserRemovedTopicIds: (key: string) =>
        Promise.resolve(
          this.user(key)
            .interests.filter((interest) => interest.isUserRemoved)
            .map((interest) => interest.topicId),
        ),
      // `UserInterestService.findAutoExpandState` — 활성 자동 슬롯은 주제 노출 여부를 보지 않는다
      findAutoExpandState: (key: string) =>
        Promise.resolve({
          userRemovedTopicIds: this.user(key)
            .interests.filter((interest) => interest.isUserRemoved)
            .map((interest) => interest.topicId),
          activeAutoExpandTopicIds: this.user(key)
            .interests.filter(
              (interest) =>
                interest.isActive &&
                interest.source === (UserInterestSource.AUTO_EXPAND as string),
            )
            .map((interest) => interest.topicId),
        }),
      // `UserInterestService.applyAutoExpand`와 같은 규칙
      applyAutoExpand: (
        key: string,
        change: { addTopicId: string | null; removeTopicId: string | null },
        now: Date,
      ) => {
        const user = this.user(key);
        let removedTopicId: string | null = null;
        let addedTopicId: string | null = null;
        const toRemove = user.interests.find(
          (interest) =>
            interest.topicId === change.removeTopicId &&
            interest.isActive &&
            interest.source === (UserInterestSource.AUTO_EXPAND as string),
        );

        if (toRemove) {
          toRemove.isActive = false;
          toRemove.updatedAt = now;
          removedTopicId = toRemove.topicId;
        }

        if (change.addTopicId !== null) {
          const found = user.interests.find(
            (interest) => interest.topicId === change.addTopicId,
          );
          const hasRoom =
            user.interests.filter(
              (interest) =>
                interest.isActive &&
                interest.source === (UserInterestSource.AUTO_EXPAND as string),
            ).length < MAX_AUTO_EXPAND_TOPIC_COUNT;

          if (hasRoom && !found) {
            user.interests.push({
              topicId: change.addTopicId,
              source: UserInterestSource.AUTO_EXPAND,
              isActive: true,
              isUserRemoved: false,
              updatedAt: now,
            });
            addedTopicId = change.addTopicId;
          } else if (
            hasRoom &&
            found &&
            !found.isActive &&
            !found.isUserRemoved
          ) {
            found.source = UserInterestSource.AUTO_EXPAND;
            found.isActive = true;
            found.updatedAt = now;
            addedTopicId = change.addTopicId;
          }
        }

        return Promise.resolve({ addedTopicId, removedTopicId });
      },
    };
  }

  private planService() {
    const counts = (tier: string) =>
      this.planCounts.get(tier) ?? { drip: 2, discovery: 1 };

    return {
      getDailyDripCount: (tier: string) => Promise.resolve(counts(tier).drip),
      getDailyDiscoveryCount: (tier: string) =>
        Promise.resolve(counts(tier).discovery),
    };
  }

  private contentService() {
    return {
      // `ContentRepository.findCandidates` — 필터·정렬을 같은 순서로 적용한다
      findCandidates: (query: ContentCandidateQuery) => {
        const include = new Set(query.includeTopicIds ?? []);
        const excludeTopics = new Set(query.excludeTopicIds ?? []);
        const excludeContents = new Set(query.excludeContentIds ?? []);
        const seen = new Set<string>();

        if (query.excludeSeenByUserId) {
          const user = this.user(query.excludeSeenByUserId);

          // 라이브러리는 소프트 삭제분도 센다 + 영구 제외 목록
          for (const item of user.library) {
            seen.add(item.contentId);
          }

          for (const row of user.excluded) {
            seen.add(row.contentId);
          }
        }

        const pool = this.visibleContents(query.now)
          .filter(
            ({ content, topicIds }) =>
              (!query.seriesStartOnly ||
                content.episodeNo === null ||
                content.episodeNo === 1) &&
              (include.size === 0 ||
                topicIds.some((topicId) => include.has(topicId))) &&
              !topicIds.some((topicId) => excludeTopics.has(topicId)) &&
              !excludeContents.has(content.id) &&
              !seen.has(content.id),
          )
          .sort(
            (a, b) =>
              (query.lowExposureFirst
                ? a.playCount - b.playCount
                : b.playCount - a.playCount) ||
              b.content.publishedAt.getTime() -
                a.content.publishedAt.getTime() ||
              a.content.id.localeCompare(b.content.id),
          )
          .slice(0, query.limit)
          .map((entry) => entry.content);

        return Promise.resolve(pool);
      },
      findAllByIds: (ids: string[]) =>
        Promise.resolve(
          ids.flatMap((id) => {
            const entry = this.contents.get(id);
            return entry ? [entry.content] : [];
          }),
        ),
      findScorableEmbeddings: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.flatMap((id) => {
              const embedding = this.contents.get(id)?.embedding ?? null;
              return embedding ? [[id, embedding] as const] : [];
            }),
          ),
        ),
      findTopicViews: (ids: string[]) =>
        Promise.resolve(
          ids.flatMap((contentId) =>
            (this.contents.get(contentId)?.topicIds ?? []).map((topicId) => ({
              contentId,
              topicId,
              name: this.topics.get(topicId)?.name ?? '',
            })),
          ),
        ),
    };
  }

  private contentStatService() {
    return {
      findAllTimeCounts: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.flatMap((id) => {
              const entry = this.contents.get(id);
              return entry
                ? [
                    [
                      id,
                      {
                        playCount: entry.playCount,
                        completeCount: entry.completeCount,
                      },
                    ] as const,
                  ]
                : [];
            }),
          ),
        ),
    };
  }

  private libraryService() {
    const live = (key: string) =>
      this.user(key).library.filter((item) => item.deletedAt === null);

    return {
      // `countUnfinishedByUserId` — 삭제되지 않은 미청취·진행 중
      countUnfinished: (key: string) =>
        Promise.resolve(
          live(key).filter(
            (item) => item.status !== (LibraryItemStatus.COMPLETED as string),
          ).length,
        ),
      // `countByUserIdAndSourcesAddedBetween` — 오늘 서비스 날짜의 편성분(삭제분 포함)
      countPlacedToday: (key: string, now: Date) => {
        const { start, end } = toServiceDayRange(now);

        return Promise.resolve(
          this.user(key).library.filter(
            (item) =>
              DRIP_SOURCES.includes(item.source) &&
              item.addedAt.getTime() >= start.getTime() &&
              item.addedAt.getTime() < end.getTime(),
          ).length,
        );
      },
      findRecentDripContentIds: (key: string, since: Date) =>
        Promise.resolve(
          this.user(key)
            .library.filter(
              (item) =>
                DRIP_SOURCES.includes(item.source) &&
                item.addedAt.getTime() >= since.getTime(),
            )
            .map((item) => item.contentId),
        ),
      // `findUnplayedByUserIdAndSourcesAddedBetween` — 받고도 열지도 지우지도 않은 편성분
      findIgnoredDripItems: (key: string, since: Date, addedBefore: Date) =>
        Promise.resolve(
          live(key)
            .filter(
              (item) =>
                DRIP_SOURCES.includes(item.source) &&
                item.status === (LibraryItemStatus.UNPLAYED as string) &&
                item.addedAt.getTime() >= since.getTime() &&
                item.addedAt.getTime() < addedBefore.getTime(),
            )
            .map((item) => ({
              contentId: item.contentId,
              addedAt: item.addedAt,
            })),
        ),
      countExposures: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids
              .map((id) => [id, this.exposureCount(id)] as const)
              .filter(([, total]) => total > 0),
          ),
        ),
      // `findCompletedSeriesMaxEpisodes` — 완청한 시리즈의 가장 뒤 편(삭제분 포함)
      findCompletedSeriesMaxEpisodes: (key: string) => {
        const max = new Map<string, number>();

        for (const item of this.user(key).library) {
          const content = this.contents.get(item.contentId)?.content;

          if (
            item.status === (LibraryItemStatus.COMPLETED as string) &&
            content?.seriesId &&
            content.episodeNo !== null
          ) {
            max.set(
              content.seriesId,
              Math.max(max.get(content.seriesId) ?? 0, content.episodeNo),
            );
          }
        }

        return Promise.resolve(max);
      },
    };
  }

  private playbackService() {
    return {
      // `UserSignalRepository.findAllRecentByUserId` — 최신순, 상한
      findRecentSignals: (key: string, since: Date, limit: number) =>
        Promise.resolve(
          this.user(key)
            .signals.filter(
              (signal) => signal.createdAt.getTime() >= since.getTime(),
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit),
        ),
      countSignals: (key: string, action: string) =>
        Promise.resolve(
          this.user(key).signals.filter((signal) => signal.action === action)
            .length,
        ),
    };
  }

  private topicService() {
    return {
      findAllByIds: (ids: string[]) =>
        Promise.resolve(
          ids.flatMap((id) => {
            const topic = this.topics.get(id);
            return topic ? [topic] : [];
          }),
        ),
    };
  }

  private userSettingService() {
    return {
      getSettings: (key: string) =>
        Promise.resolve({
          isAutoExpandEnabled: this.user(key).autoExpandEnabled,
        }),
    };
  }
}
