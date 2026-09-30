import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

export interface DripFeedbackPromptItemView {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  source: LibraryItemSource;
  /** 편성된 서비스 날짜 라벨 */
  placedDate: string;
  /** 들었는지 — 화면이 "들으셨어요" 같은 보조 표시에 쓸 수 있다. 판정이 아니다 */
  libraryStatus: LibraryItemStatus;
}

export interface DripFeedbackPromptView {
  /** 팝업을 낼지 — 서버 판정. 클라이언트는 이 값만 본다 */
  show: boolean;
  /** 묻는 편성분(최대 2). `show=false`면 비어 있다 */
  items: DripFeedbackPromptItemView[];
  /** 어제의 서비스 날짜 라벨 — 팝업 제목("어제 추천") 근거 */
  placedDate: string;
  /** [이번 주 그만 보기] 중이면 그 종료 서비스 날짜, 아니면 null */
  mutedUntil: string | null;
}

export interface RateDripFeedbackCommand {
  userId: string;
  ratings: { contentId: string; stars: number }[];
  now: Date;
}

export interface DripFeedbackVersionSummary {
  /** null = 버전 도입 전 편성분 */
  algorithmVersion: string | null;
  /** 이 버전으로 적립된 편성분(드립·탐험) 수와 첫·마지막 편성 시각 */
  placements: number;
  placedUsers: number;
  firstPlacedAt: Date | null;
  lastPlacedAt: Date | null;
  ratings: number;
  ratedUsers: number;
  /** 별점 없으면 null */
  averageStars: number | null;
  /** 1~5 각 건수 */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}
