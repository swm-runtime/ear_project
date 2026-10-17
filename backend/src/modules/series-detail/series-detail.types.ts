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
  /** 표지 — 노출 중인 가장 앞 편의 썸네일(보통 1화, 결정 2026-10-09) */
  coverThumbnailUrl: string;
  /** 노출 중인 편만, `episode_no` 순 */
  episodes: SeriesEpisodeView[];
}
