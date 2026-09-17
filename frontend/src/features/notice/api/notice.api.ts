import { apiClient } from '@/shared/api/api-client';

import { IS_NOTICE_API_MOCKED, NOTICE_PAGE_SIZE } from '../notice.constants';
import type { NoticeDetail, NoticePage, NoticeSummary } from '../notice.types';
import type {
  NoticeDetailResponseDto,
  NoticeListItemDto,
  NoticeListResponseDto,
} from './notice.dto';
import { mockFetchNotice, mockFetchNotices } from './notice.mock';

/* ── Query Key factory(convention.md 4.1) ── */

export const noticeKeys = {
  all: ['notice'] as const,
  /** 발행 공지 목록(무한 스크롤) — 필터가 없어 파라미터 없이 하나다 */
  list: () => [...noticeKeys.all, 'list'] as const,
  /** 상세 전체의 접두 키 — 목록 새로고침 시 id 별 상세를 함께 무효화한다(settings.md 4.7 규칙 8) */
  details: () => [...noticeKeys.all, 'detail'] as const,
  detail: (noticeId: string) => [...noticeKeys.details(), noticeId] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toNoticeSummary = (dto: NoticeListItemDto): NoticeSummary => ({
  id: dto.id,
  title: dto.title,
  isPinned: dto.is_pinned,
  publishedAt: dto.published_at,
});

const toNoticePage = (dto: NoticeListResponseDto): NoticePage => ({
  items: dto.items.map(toNoticeSummary),
  nextCursor: dto.next_cursor,
});

const toNoticeDetail = (dto: NoticeDetailResponseDto): NoticeDetail => ({
  id: dto.id,
  title: dto.title,
  isPinned: dto.is_pinned,
  publishedAt: dto.published_at,
  body: dto.body,
  updatedAt: dto.updated_at,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 발행 공지 목록(settings-api.md 4.4) — 서버가 정렬·발행 판정을 끝낸 목록을 그대로 받는다.
 * cursor는 이전 응답의 next_cursor, limit 기본 20(최대 50).
 */
export const fetchNotices = async (input: {
  cursor?: string;
  limit?: number;
}): Promise<NoticePage> => {
  const limit = input.limit ?? NOTICE_PAGE_SIZE;
  const params: Record<string, string | number> = { limit };
  if (input.cursor !== undefined) params.cursor = input.cursor;

  const data = IS_NOTICE_API_MOCKED
    ? await mockFetchNotices(input.cursor ?? null, limit)
    : (await apiClient.get<NoticeListResponseDto>('/notices', { params })).data;
  return toNoticePage(data);
};

/** 공지 상세(settings-api.md 4.5) — 미발행·삭제는 404 NOTICE_NOT_FOUND로 온다 */
export const fetchNotice = async (noticeId: string): Promise<NoticeDetail> => {
  const data = IS_NOTICE_API_MOCKED
    ? await mockFetchNotice(noticeId)
    : (await apiClient.get<NoticeDetailResponseDto>(`/notices/${noticeId}`)).data;
  return toNoticeDetail(data);
};
