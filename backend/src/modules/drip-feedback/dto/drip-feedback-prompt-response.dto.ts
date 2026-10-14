import { DripFeedbackPromptView } from '../drip-feedback.types';
import { ContentLanguage } from '@/modules/content/content.enum';

/** `GET /users/me/drip-feedback/prompt` (drip-feedback-api.md 4.1) */
export class DripFeedbackPromptResponseDto {
  readonly show: boolean;
  readonly placed_date: string | null;
  readonly muted_until: string | null;
  readonly items: {
    content_id: string;
    title: string;
    thumbnail_url: string;
    /** 콘텐츠 언어(`global-api.md` 4.7) — 표시 전용. 시장 필터는 서버가 한다 */
    language: ContentLanguage;
    source: string;
    placed_date: string;
    library_status: string;
  }[];

  static from(view: DripFeedbackPromptView): DripFeedbackPromptResponseDto {
    return {
      show: view.show,
      placed_date: view.placedDate,
      muted_until: view.mutedUntil,
      items: view.items.map((item) => ({
        content_id: item.contentId,
        title: item.title,
        thumbnail_url: item.thumbnailUrl,
        language: item.language,
        source: item.source,
        placed_date: item.placedDate,
        library_status: item.libraryStatus,
      })),
    };
  }
}
