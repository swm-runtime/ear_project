/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { ContentSeriesRef } from '@/modules/content/content.types';
import { Content } from '@/modules/content/entities/content.entity';
import { Series } from '@/modules/content/entities/series.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { ProgressView } from '@/modules/playback/playback.types';

/** 시리즈 화면의 편 하나 — 탐색 행과 같은 콘텐츠 재료에 내 상태(담음·완청·재생 위치)를 붙인다 */
export interface SeriesEpisodeView {
  content: Content;
  topicIds: string[];
  series: ContentSeriesRef;
  /** 살아 있는 라이브러리 행. 없으면 null(안 담음) — 완청은 `status = completed`로 본다 */
  libraryItem: LibraryItem | null;
  /** 재생 위치 행. 없으면 null — 0으로 채우지 않는다 */
  progress: ProgressView | null;
  isCountedToday: boolean;
}

/** `GET /series/:id`(KAN-134 확정 설계 3번)의 조립 재료 */
export interface SeriesDetailView {
  series: Series;
  /** 시리즈째 담기(`library_series` 살아 있는 행 — KAN-245). 새 편이 따라 들어오는가 */
  isSaved: boolean;
  /** 표지 — 시리즈 표지가 있으면 그것(KAN-234), 없으면 노출 중인 가장 앞 편의 썸네일(보통 1화, 결정 2026-10-09) */
  coverThumbnailUrl: string;
  /**
   * 대표 중분류(주제) — 앨범 화면 제목 아래 카테고리 줄(2026-10-22). 시리즈 표엔 주제 칸이 없어 편들의 `content_topics`에서
   * 뽑는다: 가장 많은 편에 걸린 주제, 동률이면 `topic.display_order` 우선. 노출 편에 주제가 하나도 없으면 null
   */
  topic: { id: string; name: string } | null;
  /** 노출 중인 편만, `episode_no` 순 */
  episodes: SeriesEpisodeView[];
}

/** `POST /series/:id/save`(KAN-245) */
export interface SeriesSaveResult {
  seriesId: string;
  /** 이번 요청으로 라이브러리에 새로 들어온(생성·되살림) 편 수 — 이미 담겨 있던 편은 세지 않는다 */
  addedCount: number;
}

/** `DELETE /series/:id/save`(KAN-245) */
export interface SeriesUnsaveResult {
  seriesId: string;
  /** 이번 요청으로 뺀 라이브러리 항목 id — [실행 취소](`POST /series/:id/restore`)에 그대로 넘긴다 */
  removedItemIds: string[];
}

/** `POST /series/:id/restore`(KAN-245) */
export interface SeriesRestoreResult {
  seriesId: string;
  /** 넘긴 id 중 내 그 시리즈 편이고 노출 중이라 살아 있게 된 항목 */
  restoredItemIds: string[];
  isSaved: boolean;
}
