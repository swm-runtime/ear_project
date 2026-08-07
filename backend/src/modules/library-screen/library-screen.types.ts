/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSource,
  LibraryItemSourceFilter,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import {
  DailyPlayQuota,
  ProgressView,
} from '@/modules/playback/playback.types';

export interface LibraryContentView {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용. 올라갔으면 클라이언트가 저장한 위치·오프라인 파일을 폐기한다 */
  contentVersion: number;
  topicIds: string[];
}

export interface LibraryItemView {
  id: string;
  /** 원값을 그대로 내려준다 — 배지 매핑(드립·담기)은 화면이 한다 */
  source: LibraryItemSource;
  status: LibraryItemStatus;
  addedAt: Date;
  lastPlayedAt: Date | null;
  completedAt: Date | null;
  /**
   * 오늘의 서비스 날짜에 이 콘텐츠의 `play_records` 행이 이미 있는가.
   *
   * **컬럼이 아니라 조회 결과이며, 힌트이지 판정이 아니다.** 차감 여부의 최종 판단은
   * 재생 시작이 하며, 이 값이 참이어도 서버가 차감할 수 있다. 목록에 함께 실어 보내는
   * 이유는 재생 확인 팝업이 **탭한 직후 즉시** 떠야 하기 때문이다 — 없으면 팝업 하나
   * 띄우려고 서버에 한 번 더 물어야 하고, 그 왕복이 목록과 표시의 시점을 어긋나게 한다.
   */
  isCountedToday: boolean;
  content: LibraryContentView;
  /** 행이 없으면 `null`이며 **0으로 채우지 않는다** */
  progress: ProgressView | null;
}

export interface LibraryListQuery {
  filter: LibraryItemFilter;
  /** `null`이면 출처를 가리지 않는다 */
  sourceFilter: LibraryItemSourceFilter | null;
  topicIds: string[];
  sort: LibraryItemSort;
  cursor: string | null;
  limit: number;
}

export interface LibraryListResult {
  items: LibraryItemView[];
  /** `hasNext`가 false면 `null`이다 */
  nextCursor: string | null;
  hasNext: boolean;
  quota: DailyPlayQuota;
}

/**
 * 미니플레이어 복원 조회(library-api.md 4.3).
 *
 * **대상 없음을 404로 응답하지 않는다** — 신규 사용자와 완청만 있는 사용자에게는 대상이
 * 없는 것이 정상이고, 클라이언트는 같은 응답에서 잔여 재생 표시값까지 받아야 한다.
 */
export interface LibraryResumeResult {
  resumeTarget: LibraryItemView | null;
  quota: DailyPlayQuota;
}
