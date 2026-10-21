import { Injectable } from '@nestjs/common';

import { ContentService } from '@/modules/content/services/content.service';
import {
  resolveSeriesCover,
  SeriesService,
  toSeriesRef,
} from '@/modules/content/services/series.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { UserMarket } from '@/modules/user/user.enum';

import { SeriesDetailView } from './series-detail.types';

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
  ) {}

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

    const [topicViews, libraryItems, progresses, countedContentIds] =
      await Promise.all([
        this.contentService.findTopicViews(contentIds),
        this.libraryService.findActiveItems(userId, contentIds),
        this.playbackService.findProgresses(userId, contentIds),
        // 탐색 행·상세와 같은 조립 경로 — 재생 확인 팝업 힌트가 화면마다 어긋나지 않게(paywall.md 4.3-1)
        this.playbackService.findCountedContentIds(userId, now),
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

    return {
      series,
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
}
