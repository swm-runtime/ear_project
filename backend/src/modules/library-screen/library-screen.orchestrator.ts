import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatus } from '@/modules/content/content.enum';
import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryTopicView } from '@/modules/library/library.types';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { ProgressView } from '@/modules/playback/playback.types';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { LibraryService } from '@/modules/library/library.service';

import {
  encodeLibraryCursor,
  decodeLibraryCursor,
} from './library-screen.cursor';
import {
  LibraryItemView,
  LibraryListQuery,
  LibraryListResult,
  LibraryResumeResult,
} from './library-screen.types';

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 유스케이스라 Orchestrator를 둔다.
 * **자기 Repository·Entity를 갖지 않는다.**
 *
 * 왜 `library` 모듈에 두지 않는가: 라이브러리 화면의 응답에는 `playback` 소유 데이터
 * (재생 위치·오늘 카운트)가 반드시 들어가는데, `library-api.md` 8장이 **`playback` →
 * `library`** 방향(재생 시작이 라이브러리 상태 전이를 호출한다)과 "`library` 모듈은
 * `content` · `user`에만 의존한다"를 함께 못박고 있다. `library`가 `playback`을 의존하면
 * 순환이 되므로(`forwardRef` 금지 — architecture.md 4.3) 두 모듈 **위에서** 조합한다.
 * `onboarding`과 같은, Entity를 소유하지 않는 유스케이스 모듈이다.
 *
 * **잔여 재생 표시값은 직접 조립하지 않는다.** 티어 조회 → 요금제 한도 → `play_records`
 * 집계까지를 `PlaybackService.buildQuotaForUser`가 한 번에 하고, 탐색 화면도 **같은 함수를
 * 호출한다**(`explore-api.md` 2장). 화면마다 조립하면 같은 사용자에게 서로 다른 숫자가
 * 표시되고, 어느 쪽이 맞는지 사용자가 판단하게 된다. 그래서 이 모듈은 `subscription` ·
 * `user`를 알 필요가 없다.
 */
@Injectable()
export class LibraryScreenOrchestrator {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * library-api.md 4.1 — 화면 진입·당겨서 새로고침·포그라운드 복귀·추가 로딩이 모두
   * 이 하나를 호출한다.
   *
   * **잔여 재생 표시값을 같은 응답에 얹는다.** 전용 엔드포인트로 나누면 목록과 숫자의
   * 시점이 어긋나 "3회 남음"을 보면서 탭했는데 페이월이 뜨는 상황이 만들어진다.
   */
  async getItems(
    userId: string,
    query: LibraryListQuery,
    now: Date,
  ): Promise<LibraryListResult> {
    const conditions = {
      filter: query.filter,
      sourceFilter: query.sourceFilter,
      sort: query.sort,
      topicIds: query.topicIds,
    };

    const page = await this.libraryService.findPage({
      userId,
      ...conditions,
      cursor: query.cursor
        ? decodeLibraryCursor(query.cursor, conditions)
        : null,
      limit: query.limit,
    });

    const [items, quota] = await Promise.all([
      this.toItemViews(userId, page.items, now),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    const lastItem = page.items.at(-1);

    return {
      items,
      // `has_next`가 false면 커서를 발급하지 않는다 — 끝인지 아닌지를 두 값이 말하면 어긋난다
      nextCursor:
        page.hasNext && lastItem
          ? encodeLibraryCursor(
              { addedAt: lastItem.addedAt, id: lastItem.id },
              conditions,
            )
          : null,
      hasNext: page.hasNext,
      quota,
    };
  }

  /**
   * library-api.md 4.2 — **사용자의 관심 주제가 아니라 라이브러리에 실제로 담긴 콘텐츠의
   * 주제를 내려준다.** 담긴 게 없는 주제는 고를 수는 있는데 결과가 항상 비어 있고,
   * 반대로 관심 주제로만 채우면 탐색에서 담은 관심 밖 콘텐츠를 걸러낼 방법이 사라진다.
   *
   * **탭 선택과 무관하게 라이브러리 전체를 기준으로 센다** — 탭을 옮길 때마다 팝업의 주제
   * 구성과 개수가 흔들리면 두 필터를 조합할 수 없다.
   */
  async getTopics(userId: string): Promise<LibraryTopicView[]> {
    const contentIds = await this.libraryService.findVisibleContentIds(userId);
    const topicViews = await this.contentService.findTopicViews(contentIds);

    // findTopicViews는 `topics.display_order` 순이므로 첫 등장 순서가 곧 노출 순서다
    const byTopicId = new Map<string, LibraryTopicView>();

    for (const view of topicViews) {
      const existing = byTopicId.get(view.topicId);

      if (existing) {
        existing.itemCount += 1;
        continue;
      }

      byTopicId.set(view.topicId, {
        topicId: view.topicId,
        name: view.name,
        itemCount: 1,
      });
    }

    // 담긴 항목이 하나도 없으면 빈 배열이다. **404가 아니다** — 빈 라이브러리는 정상 상태다
    return [...byTopicId.values()];
  }

  /**
   * library-api.md 4.3 — 앱 실행 시 미니플레이어에 무엇을 띄울지.
   *
   * **자동 재생 여부를 응답에 담지 않는다.** 미니플레이어는 언제나 일시정지 상태로 뜨며
   * (`library.md` 4.2), 서버가 "자동 재생하라"고 지시할 수 있는 필드를 두면 그 규칙이
   * 서버에서 뒤집힐 수 있게 된다.
   *
   * **이 응답은 표시 대상 조회일 뿐 재생 허가가 아니다.** 미니플레이어에서 재생을 시작할
   * 때도 한도 판정과 확인 팝업이 카드 탭과 동일하게 적용된다.
   */
  async getResumeTarget(
    userId: string,
    now: Date,
  ): Promise<LibraryResumeResult> {
    const startedContentIds =
      await this.playbackService.findStartedContentIds(userId);

    const [item, quota] = await Promise.all([
      this.libraryService.findResumeTarget(userId, startedContentIds),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    if (!item) {
      return { resumeTarget: null, quota };
    }

    const [resumeTarget] = await this.toItemViews(userId, [item], now);

    return { resumeTarget, quota };
  }

  /**
   * library-api.md 4.5 — 완청 처리. **클라이언트의 선언을 그대로 받지 않고** 서버가
   * `max_reached_sec`으로 기준을 다시 판정한다(판정은 `LibraryService`가 소유한다).
   */
  async completeItem(
    userId: string,
    itemId: string,
    now: Date,
  ): Promise<LibraryItem> {
    return this.dataSource.transaction(async (manager) => {
      const item = await this.libraryService.getOwnedItem(
        itemId,
        userId,
        manager,
      );

      const progress = await this.playbackService.findProgress(
        userId,
        item.contentId,
        manager,
      );

      return this.libraryService.completeItem(
        item,
        progress?.maxReachedSec ?? 0,
        now,
        manager,
      );
    });
  }

  /**
   * library-api.md 4.6 — 소프트 삭제 + 드립 영구 제외 적재 + 신호 적재를
   * **하나의 트랜잭션**으로 수행한다.
   *
   * **이미 삭제된 항목에는 아무 것도 하지 않고 성공으로 응답한다.** 오프라인 큐가 같은
   * 삭제를 다시 보낼 수 있는데(`common-error-handling.md` 4.5), 그때마다 `delete` 신호를
   * 다시 쌓으면 추천 스코어가 왜곡된다.
   */
  async deleteItem(userId: string, itemId: string, now: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const item = await this.libraryService.getOwnedItemWithDeleted(
        itemId,
        userId,
        manager,
      );

      if (item.deletedAt) {
        return;
      }

      await this.libraryService.softDelete(item, now, manager);

      // 삭제한 콘텐츠는 드립으로 다시 오지 않는다(FR-16).
      // **영구 제외 사실은 사용자에게 알리지 않는다** — 204에는 본문이 없다
      await this.dripExclusionService.exclude(
        userId,
        item.contentId,
        DripExclusionReason.LIBRARY_DELETE,
        now,
        manager,
      );

      await this.playbackService.recordSignal(
        userId,
        item.contentId,
        UserSignalAction.DELETE,
        manager,
      );
    });
  }

  /**
   * library-api.md 4.7 — 삭제 실행 취소.
   *
   * **`drip_excluded_contents` 행을 삭제하지 않는다.** 그 행은 삭제 이전부터 `played` ·
   * `dripped` 사유로 존재했을 수 있고 `reason`은 최초 값을 유지하므로 어느 쪽이었는지
   * 구분할 수 없다 — 지우면 **이미 들은 콘텐츠가 드립으로 다시 오게 된다.** 실질적인
   * 차이도 없다. 드립 후보 필터는 `library_items` 행이 존재하기만 하면 제외한다.
   */
  async restoreItem(userId: string, itemId: string): Promise<LibraryItem> {
    return this.dataSource.transaction(async (manager) => {
      const item = await this.libraryService.getOwnedItemWithDeleted(
        itemId,
        userId,
        manager,
      );

      // 삭제해 둔 사이 파트너가 회수했다면 복구해도 목록에 나타나지 않는다
      if (item.content?.status !== ContentStatus.PUBLISHED) {
        throw new BusinessForbiddenException({
          errorCode: ErrorCode.CONTENT_WITHDRAWN,
          message: '제공이 종료된 콘텐츠예요',
          logLevel: 'info',
        });
      }

      return this.libraryService.restore(item, manager);
    });
  }

  /**
   * 목록 항목에 주제·재생 위치·오늘 카운트를 붙인다.
   *
   * **항목마다 조회하지 않는다** — 20건이면 조회가 60번 붙는다(architecture.md 3.4).
   * 세 조회 모두 `content_id` 목록을 한 번에 받는다.
   */
  private async toItemViews(
    userId: string,
    items: LibraryItem[],
    now: Date,
  ): Promise<LibraryItemView[]> {
    if (items.length === 0) {
      return [];
    }

    const contentIds = items.map((item) => item.contentId);

    const [topicViews, progresses, countedContentIds] = await Promise.all([
      this.contentService.findTopicViews(contentIds),
      this.playbackService.findProgresses(userId, contentIds),
      this.playbackService.findCountedContentIds(userId, now),
    ]);

    const topicIdsByContentId = new Map<string, string[]>();
    for (const view of topicViews) {
      const topicIds = topicIdsByContentId.get(view.contentId) ?? [];
      topicIds.push(view.topicId);
      topicIdsByContentId.set(view.contentId, topicIds);
    }

    const progressByContentId = new Map<string, ProgressView>(
      progresses.map((progress) => [progress.contentId, progress]),
    );

    return items.map((item) => ({
      id: item.id,
      source: item.source,
      status: item.status,
      addedAt: item.addedAt,
      lastPlayedAt: item.lastPlayedAt,
      completedAt: item.completedAt,
      isCountedToday: countedContentIds.has(item.contentId),
      content: {
        id: item.content.id,
        title: item.content.title,
        authorName: item.content.authorName,
        sourceName: item.content.sourceName,
        sourceUrl: item.content.sourceUrl,
        durationSec: item.content.durationSec,
        thumbnailUrl: item.content.thumbnailUrl,
        contentVersion: item.content.contentVersion,
        topicIds: topicIdsByContentId.get(item.contentId) ?? [],
      },
      progress: progressByContentId.get(item.contentId) ?? null,
    }));
  }
}
