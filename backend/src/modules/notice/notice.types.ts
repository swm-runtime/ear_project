import { UserMarket } from '@/modules/user/user.enum';

/** 사용자 목록의 keyset 위치 — 정렬 `is_pinned DESC, published_at DESC, id DESC` */
export interface PublishedNoticeCursorPosition {
  isPinned: boolean;
  publishedAt: Date;
  id: string;
}

/** 관리자 목록의 keyset 위치 — 정렬 `created_at DESC, id DESC`(초안 포함) */
export interface AdminNoticeCursorPosition {
  createdAt: Date;
  id: string;
}

export interface NoticePage<T> {
  items: T[];
  hasNext: boolean;
}

export interface CreateNoticeCommand {
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: Date | null;
  /** 공지의 시장(`global-api.md` 4.8). 생성 때만 정하고 수정하지 않는다 */
  market: UserMarket;
}

/** 담긴 키만 바꾼다. `publishedAt: null`은 발행 취소(초안으로 되돌림)다 */
export interface UpdateNoticeCommand {
  title?: string;
  body?: string;
  isPinned?: boolean;
  publishedAt?: Date | null;
}
