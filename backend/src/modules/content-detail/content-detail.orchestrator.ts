import { Injectable } from '@nestjs/common';

import { ContentOrigin } from '@/modules/content/content.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import { ContentDetailView } from './content-detail.types';

/**
 * architecture.md 3.3 — **Entity를 소유하지 않는 유스케이스 모듈이다**(`library-screen` ·
 * `explore`와 같은 형태). 상세 한 화면에 `contents` · `content_topics` · `content_sources`
 * (content), `library_items`(library), `play_records`(playback)가 함께 들어간다.
 *
 * `content` 모듈에 넣을 수 없다 — `library` · `playback`이 이미 `content`를 의존하므로
 * 반대 방향을 더하면 순환이 된다(architecture.md 4.5).
 *
 * 액션([재생]·[담기]/[삭제]·[원문 보기])은 여기에 없다 — 전부 기존 계약의 재사용이라
 * 소유 모듈(playback·explore·library-screen)에 그대로 남는다(content-detail-api.md 1장).
 */
@Injectable()
export class ContentDetailOrchestrator {
  constructor(
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
  ) {}

  /**
   * content-detail-api.md 4.1 — 상세 화면 진입 시의 단건 조회.
   *
   * **목록 응답을 재사용하지 않고 재조회한다** — 회수(FR-32)는 전 노출면 즉시 반영이고
   * 상세도 노출면이다(content-detail.md 4.1). 없음(404)과 회수(403)의 분기는
   * `getPublishedById`가 한다.
   *
   * 조회 전용이라 트랜잭션으로 감싸지 않는다(architecture.md 8.7 기본).
   */
  async getContentDetail(
    userId: string,
    contentId: string,
    now: Date,
  ): Promise<ContentDetailView> {
    const content = await this.contentService.getPublishedById(contentId);

    const [topicViews, libraryItems, countedContentIds, sources] =
      await Promise.all([
        this.contentService.findTopicViews([contentId]),
        this.libraryService.findActiveItems(userId, [contentId]),
        // 목록 행의 `is_counted_today`와 **같은 조립 경로**를 쓴다 — 단건이라고 판정을
        // 새로 만들면 행 탭과 상세의 팝업 힌트가 어긋난다(paywall.md 4.3-1)
        this.playbackService.findCountedContentIds(userId, now),
        // `partner`는 `content_sources`에 행이 없으므로(domain.md 5.5) 조회하지 않고
        // `null`로 계약을 표현한다(content-detail-api.md 4.1 — 확정 2026-08-24)
        content.origin === ContentOrigin.AI_GENERATED
          ? this.contentService.findSourcesByContentId(contentId)
          : Promise.resolve(null),
      ]);

    return {
      content,
      topics: topicViews.map((view) => ({ id: view.topicId, name: view.name })),
      sources,
      libraryItem: libraryItems[0] ?? null,
      isCountedToday: countedContentIds.has(contentId),
    };
  }
}
