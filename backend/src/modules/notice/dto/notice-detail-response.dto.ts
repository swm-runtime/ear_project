import { Notice } from '../entities/notice.entity';

/** settings-api.md 4.5 — 공지 상세. 본문은 줄바꿈을 보존한 일반 텍스트다 */
export class NoticeDetailResponseDto {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly is_pinned: boolean;
  readonly published_at: string;
  readonly updated_at: string;

  static from(notice: Notice): NoticeDetailResponseDto {
    return {
      id: notice.id,
      title: notice.title,
      body: notice.body,
      is_pinned: notice.isPinned,
      published_at: (notice.publishedAt as Date).toISOString(),
      updated_at: notice.updatedAt.toISOString(),
    };
  }
}
