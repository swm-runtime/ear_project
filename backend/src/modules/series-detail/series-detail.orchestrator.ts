import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { isContentVisibleAt } from '@/modules/content/content.visibility';
import { ContentService } from '@/modules/content/services/content.service';
import {
  resolveSeriesCover,
  SeriesService,
  toSeriesRef,
} from '@/modules/content/services/series.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibrarySeriesService } from '@/modules/library/library-series.service';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { UserMarket } from '@/modules/user/user.enum';

import {
  SeriesDetailView,
  SeriesRestoreResult,
  SeriesSaveResult,
  SeriesUnsaveResult,
} from './series-detail.types';

/**
 * architecture.md 3.3 — **Entity를 소유하지 않는 유스케이스 모듈이다**(`content-detail`과 같은 형태).
 * 시리즈 화면 하나에 `series`·`contents`·`content_topics`(content), `library_items`(library),
 * `playback_progresses`·`play_records`(playback)가 함께 들어간다.
 *
 * `content` 모듈에 넣을 수 없다 — `library` · `playback`이 이미 `content`를 의존하므로 반대 방향을 더하면 순환이 된다.
 *
 * 편마다의 상태는 기존 편 단위 데이터를 그대로 읽는다 — 시리즈 단위 진행 상태를 따로 두지 않는다(확정 설계 원칙).
 * 액션(재생·담기·삭제)은 전부 기존 편 단위 계약의 재사용이다.
 */
@Injectable()
export class SeriesDetailOrchestrator {
  constructor(
    private readonly seriesService: SeriesService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly librarySeriesService: LibrarySeriesService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dataSource: DataSource,
  ) {}

  /** 같은 간행물의 다른 시리즈 — 사용자 상태가 없는 카드라 콘텐츠 모듈 판정을 그대로 넘긴다(기준 시리즈가 안 보이면 404) */
  async getPublisherSeries(seriesId: string, now: Date, market: UserMarket) {
    return this.seriesService.findPublisherSiblingCards(seriesId, now, market);
  }

  /**
   * 노출 중인 편이 사용자 시장에 없으면 404(`SeriesService.getVisibleForUser`). 조회 전용이라 트랜잭션으로 감싸지 않는다
   * (architecture.md 8.7 기본). 편 수만큼 조회하지 않고 id 목록으로 한 번씩 읽는다(architecture.md 3.4).
   */
  async getSeries(
    userId: string,
    seriesId: string,
    now: Date,
    market: UserMarket,
  ): Promise<SeriesDetailView> {
    const { series, episodes } = await this.seriesService.getVisibleForUser(
      seriesId,
      now,
      market,
    );
    const contentIds = episodes.map((content) => content.id);

    const [topicViews, libraryItems, progresses, countedContentIds, isSaved] =
      await Promise.all([
        this.contentService.findTopicViews(contentIds),
        this.libraryService.findActiveItems(userId, contentIds),
        this.playbackService.findProgresses(userId, contentIds),
        // 탐색 행·상세와 같은 조립 경로 — 재생 확인 팝업 힌트가 화면마다 어긋나지 않게(paywall.md 4.3-1)
        this.playbackService.findCountedContentIds(userId, now),
        // 시리즈째 담기 기록(KAN-245) — 편이 전부 담겼는지가 아니라 "새 편이 따라오는가"다
        this.librarySeriesService.isFollowing(userId, seriesId),
      ]);

    const topicIdsByContentId = new Map<string, string[]>();
    // 대표 중분류 집계 — 편마다의 주제를 모아 가장 많은 편에 걸린 주제를 고른다. 동률이면 topic.display_order 우선인데,
    // topicViews 가 이미 그 순서(repository 가 display_order ASC 로 읽는다)라 최초 등장 순으로 담으면 동률이 그쪽으로 깨진다
    const topicNameById = new Map<string, string>();
    const episodeCountByTopicId = new Map<string, number>();
    const topicIdsInOrder: string[] = [];
    for (const view of topicViews) {
      const topicIds = topicIdsByContentId.get(view.contentId) ?? [];
      topicIds.push(view.topicId);
      topicIdsByContentId.set(view.contentId, topicIds);

      if (!topicNameById.has(view.topicId)) {
        topicNameById.set(view.topicId, view.name);
        topicIdsInOrder.push(view.topicId);
      }
      episodeCountByTopicId.set(
        view.topicId,
        (episodeCountByTopicId.get(view.topicId) ?? 0) + 1,
      );
    }
    const libraryItemByContentId = new Map(
      libraryItems.map((item) => [item.contentId, item]),
    );
    const progressByContentId = new Map(
      progresses.map((progress) => [progress.contentId, progress]),
    );

    // 최초 등장(= display_order) 순으로 훑어 편수 최댓값을 고른다 — 엄격한 > 라 동률은 먼저 온 쪽(낮은 display_order)이 이긴다
    let representativeTopicId: string | null = null;
    for (const topicId of topicIdsInOrder) {
      if (
        representativeTopicId === null ||
        (episodeCountByTopicId.get(topicId) ?? 0) >
          (episodeCountByTopicId.get(representativeTopicId) ?? 0)
      ) {
        representativeTopicId = topicId;
      }
    }

    // 발행일자 — 노출 편 중 가장 이른 발행 시각(앨범 출시일 자리). episodes 는 늘 1건 이상이다(없으면 getVisibleForUser 가 404)
    const publishedAt = episodes.reduce(
      (earliest, content) =>
        content.publishedAt < earliest ? content.publishedAt : earliest,
      episodes[0].publishedAt,
    );

    return {
      series,
      isSaved,
      publishedAt,
      // 시리즈 표지가 있으면 그것(KAN-234). 없으면 노출 중인 가장 앞 편 — 1화가 회수돼 있으면 그다음 편이 표지가 된다
      coverThumbnailUrl: resolveSeriesCover(series, episodes[0].thumbnailUrl),
      topic:
        representativeTopicId === null
          ? null
          : {
              id: representativeTopicId,
              name: topicNameById.get(representativeTopicId) as string,
            },
      episodes: episodes.map((content) => ({
        content,
        topicIds: topicIdsByContentId.get(content.id) ?? [],
        // 편 목록 조회가 `episode_no IS NOT NULL`로 걸러 읽는다(업로드도 번호 없는 시리즈 편을 받지 않는다)
        series: toSeriesRef(series, content.episodeNo as number),
        libraryItem: libraryItemByContentId.get(content.id) ?? null,
        progress: progressByContentId.get(content.id) ?? null,
        isCountedToday: countedContentIds.has(content.id),
      })),
    };
  }
  /**
   * `POST /series/:id/save`(KAN-245) — 시리즈째 담기. 한 트랜잭션에서
   *
   * 1. 노출 편이 사용자 시장에 없으면 404(`getVisibleForUser` — 없는 시리즈·다른 시장·전 편 회수)
   * 2. `library_series` upsert — 삭제분이면 되살리고 `added_at`을 새로
   * 3. 노출 편마다 **편 담기 규칙 그대로**(`LibraryService.save` — 없으면 생성, 삭제분이면 되살리며 `added_at` 새로·
   *    `queue_position` NULL, 살아 있으면 그대로) + 라이브러리 상태가 바뀐 편에만 `user_signals(save)`(explore-api.md 4.3)
   *
   * 멱등이다 — 다시 보내면 `added_count: 0`. 편 담기와 같이 `drip_excluded_contents`는 지우지 않는다(재담기 규칙).
   */
  async saveSeries(
    userId: string,
    seriesId: string,
    now: Date,
    market: UserMarket,
  ): Promise<SeriesSaveResult> {
    return this.dataSource.transaction(async (manager) => {
      const { episodes } = await this.seriesService.getVisibleForUser(
        seriesId,
        now,
        market,
        manager,
      );

      await this.librarySeriesService.follow(userId, seriesId, now, manager);

      let addedCount = 0;
      for (const episode of episodes) {
        const saved = await this.libraryService.save(
          userId,
          episode.id,
          now,
          manager,
        );
        if (saved.created || saved.reactivated) {
          addedCount += 1;
          await this.playbackService.recordSignal(
            userId,
            episode.id,
            UserSignalAction.SAVE,
            manager,
          );
        }
      }

      return { seriesId, addedCount };
    });
  }

  /**
   * `DELETE /series/:id/save`(KAN-245) — 시리즈째 빼기. `library_series` 소프트 삭제(새 편이 더 오지 않는다) + 그 시리즈의
   * 살아 있는 내 항목 전부를 **편 담기 해제 규칙 그대로**(explore-api.md 4.4 — 소프트 삭제 · `drip_excluded_contents(unsave)` ·
   * `user_signals(unsave)`) 뺀다. 종전 FE가 편마다 `DELETE /contents/:id/save`를 보내던 것과 결과가 같다.
   *
   * **없는 시리즈만 404다.** 노출 편이 없어도(전 편 회수·만료) 뺄 수 있어야 한다 — 편 해제가 회수된 콘텐츠도 받는 것과 같다.
   * 뺄 것이 없어도 200(오프라인 큐 재전송) — 이미 빠진 항목에는 제외·신호를 다시 쌓지 않는다.
   */
  async unsaveSeries(
    userId: string,
    seriesId: string,
    now: Date,
  ): Promise<SeriesUnsaveResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.seriesService.getById(seriesId, manager);
      await this.librarySeriesService.unfollow(userId, seriesId, now, manager);

      const items = await this.libraryService.findActiveItemsInSeries(
        userId,
        seriesId,
        manager,
      );
      const removedItemIds: string[] = [];
      for (const item of items) {
        // 동시 해제에서 진 쪽은 제외·신호를 남기지 않는다(편 해제와 같다)
        const removed = await this.libraryService.softDelete(
          item,
          now,
          manager,
        );
        if (!removed) {
          continue;
        }
        removedItemIds.push(item.id);
        await this.dripExclusionService.exclude(
          userId,
          item.contentId,
          DripExclusionReason.UNSAVE,
          now,
          manager,
        );
        await this.playbackService.recordSignal(
          userId,
          item.contentId,
          UserSignalAction.UNSAVE,
          manager,
        );
      }

      return { seriesId, removedItemIds };
    });
  }

  /**
   * `POST /series/:id/restore`(KAN-245) — 시리즈째 빼기의 [실행 취소]. `library_series`를 되살리고(`added_at` 그대로) 넘긴 항목만
   * **편 복구 규칙 그대로**(library-api.md 4.7 — `added_at`·`status`·`queue_position` 유지, `drip_excluded_contents` 유지) 되살린다.
   *
   * 넘긴 id 중 **내 항목이 아니거나 그 시리즈 편이 아닌 것은 조용히 무시한다**(남의 항목의 존재를 드러내지 않는다 — 편 복구의
   * 404와 같은 이유). 그 사이 회수·만료된 편도 복구하지 않고 건너뛴다 — 편 복구는 403이지만, 여러 편을 한 번에 되돌리는
   * 실행 취소에서 한 편 때문에 전부를 실패시키면 나머지가 돌아오지 않는다. 서버는 실행 취소 창(5초)을 강제하지 않는다.
   */
  async restoreSeries(
    userId: string,
    seriesId: string,
    itemIds: string[],
    now: Date,
  ): Promise<SeriesRestoreResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.seriesService.getById(seriesId, manager);
      await this.librarySeriesService.restoreFollow(userId, seriesId, manager);

      const items = await this.libraryService.findOwnedItemsInSeriesWithDeleted(
        userId,
        seriesId,
        [...new Set(itemIds)],
        manager,
      );
      const restoredItemIds: string[] = [];
      for (const item of items) {
        if (!isContentVisibleAt(item.content, now)) {
          continue;
        }
        await this.libraryService.restore(item, manager);
        restoredItemIds.push(item.id);
      }

      const isSaved = await this.librarySeriesService.isFollowing(
        userId,
        seriesId,
        manager,
      );

      return { seriesId, restoredItemIds, isSaved };
    });
  }
}
