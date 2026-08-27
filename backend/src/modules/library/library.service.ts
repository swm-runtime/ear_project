import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { LibraryItem } from './library-item.entity';
import { LibraryItemRepository } from './library-item.repository';
import { COMPLETION_REACHED_RATIO } from './library.constant';
import { LibraryItemSource, LibraryItemStatus } from './library.enum';
import {
  LibraryPage,
  LibraryPageQuery,
  LibrarySaveResult,
} from './library.types';

/**
 * `library_items`는 library 모듈 소유다(domain.md 2장).
 * 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class LibraryService {
  constructor(private readonly libraryItemRepository: LibraryItemRepository) {}

  /**
   * 라이브러리에 적립한다. **이미 담긴 콘텐츠는 실패가 아니라 성공으로 흡수한다**
   * (architecture.md 8.4) — 재시도한 사용자에게 실패로 보이면 안 된다.
   *
   * 반환값은 "이 요청 이후 실제로 라이브러리에 존재하는 `content_id`"다.
   * 새로 넣은 건과 이미 있던 건을 구분하지 않는 이유는 클라이언트 동작이 같기 때문이다.
   */
  async addItems(
    userId: string,
    contentIds: string[],
    source: LibraryItemSource,
    now: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (contentIds.length === 0) {
      return [];
    }

    await this.libraryItemRepository.insertIgnoringConflicts(
      contentIds.map((contentId) => ({
        userId,
        contentId,
        source,
        status: LibraryItemStatus.UNPLAYED,
        addedAt: now,
      })),
      manager,
    );

    const stored =
      await this.libraryItemRepository.findAllByUserIdAndContentIds(
        userId,
        contentIds,
        manager,
      );

    return stored.map((item) => item.contentId);
  }

  /**
   * 탐색 담기(explore-api.md 4.3). **횟수 제한이 없고 페이월을 노출하지 않는다**(PRD 5.4).
   *
   * 세 갈래로 갈리며, 어느 쪽이든 **결과가 수렴한다** — 그래서 `Idempotency-Key`가 필요 없다.
   *
   * | 상태 | 처리 | 응답 | 신호 |
   * |---|---|---|---|
   * | 행 없음 | `source = save`로 생성 | 201 | 남긴다 |
   * | 살아 있는 행 | **아무것도 바꾸지 않는다** | 200 | **남기지 않는다** |
   * | 삭제된 행 | 되살리고 `added_at`을 새로 찍는다 | 200 | 남긴다 |
   *
   * 신호 적재 여부는 호출부가 `created` · `reactivated`로 판정한다. **라이브러리 상태가
   * 바뀌지 않았는데 신호만 쌓이면 추천 스코어가 왜곡되기 때문이다** — 사용자가 화면에서
   * 같은 담기를 두 번 누를 수는 없고(시트가 [제거]로 바뀐다), 오프라인 큐 재전송이 그 경로다.
   *
   * **이미 담긴 것에 `added_at`을 갱신하지 않는 이유**: 다시 담아도 목록 순서가 바뀌면 안
   * 된다. 반대로 삭제분의 재담기는 **새 담기 조작**이므로 적립 시각을 새로 찍는다 — 삭제
   * 실행 취소(4.7)가 `added_at`을 유지하는 것과 되돌린 대상이 다르다.
   */
  async save(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<LibrarySaveResult> {
    const existing =
      await this.libraryItemRepository.findByUserIdAndContentIdWithDeleted(
        userId,
        contentId,
        manager,
      );

    if (!existing) {
      const created = await this.libraryItemRepository.insertIfAbsent(
        {
          userId,
          contentId,
          source: LibraryItemSource.SAVE,
          status: LibraryItemStatus.UNPLAYED,
          addedAt: now,
        },
        manager,
      );

      // 졌더라도(동시 요청) 행은 존재한다 — 방금 이긴 쪽이 넣었다
      const item =
        await this.libraryItemRepository.findByUserIdAndContentIdWithDeleted(
          userId,
          contentId,
          manager,
        );

      return { item: this.assertFound(item), created, reactivated: false };
    }

    if (!existing.deletedAt) {
      return { item: existing, created: false, reactivated: false };
    }

    await this.libraryItemRepository.reactivateById(
      existing.id,
      now,
      LibraryItemSource.SAVE,
      manager,
    );
    existing.deletedAt = null;
    existing.addedAt = now;
    existing.source = LibraryItemSource.SAVE;

    return { item: existing, created: false, reactivated: true };
  }

  /**
   * 탐색 담기 해제(explore-api.md 4.4) — **라이브러리 삭제와 동일한 결과**를 만든다(FR-16).
   *
   * **해제할 대상이 없어도 실패시키지 않는다.** 오프라인 큐가 같은 해제를 다시 보낼 수 있다
   * (`common-error-handling.md` 4.5). 다만 그때는 `false`를 돌려 **드립 영구 제외·신호 적재를
   * 건너뛰게 한다** — 없던 담기의 해제로 제외와 부정 신호가 쌓이면 추천이 왜곡된다.
   *
   * @returns 이번 요청으로 실제 해제가 일어났는지
   */
  async unsave(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const item = await this.libraryItemRepository.findByUserIdAndContentId(
      userId,
      contentId,
      manager,
    );

    if (!item) {
      return false;
    }

    await this.libraryItemRepository.softDeleteById(item.id, now, manager);

    return true;
  }

  /**
   * 콘텐츠 축의 단건 조회 — 플레이어가 쓴다(`player-api.md` 4.1 · 4.4).
   *
   * 플레이어는 **항목 id를 모른 채 콘텐츠 id로 들어온다**(탐색에서 담지 않은 콘텐츠도 재생할
   * 수 있다). 라이브러리에 없으면 `null`이며 그것이 정상이다 — 발급·신호는 담기를 유발하지
   * 않는다.
   *
   * **`content` 관계를 싣지 않는다.** 발급(`id` · `status`)과 `replay` 판정(`status`)이 쓰는
   * 경로라 JOIN이 버려진다 — 완청 판정처럼 `duration_sec`이 필요한 곳은 아래
   * `findItemWithContentByContentId`를 쓴다.
   */
  async findItemByContentId(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.libraryItemRepository.findByUserIdAndContentId(
      userId,
      contentId,
      manager,
    );
  }

  /**
   * 위와 같되 **`content` 관계를 함께 읽는다** — 완청 판정(`player-api.md` 4.3)이
   * `contents.duration_sec`을 요구한다. 관계 없이 `completeItem`에 넘기면 길이를 0으로 보고
   * **90% 검사를 건너뛴 채 완료 처리한다**(가짜 완청).
   */
  async findItemWithContentByContentId(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.libraryItemRepository.findByUserIdAndContentIdWithContent(
      userId,
      contentId,
      manager,
    );
  }

  /** 탐색 피드의 "담김" 표시용(explore-api.md 4.1) — 삭제분은 담겨 있지 않은 것으로 본다 */
  async findActiveItems(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<LibraryItem[]> {
    return this.libraryItemRepository.findAllActiveByUserIdAndContentIds(
      userId,
      contentIds,
      manager,
    );
  }

  async countBySource(
    userId: string,
    source: LibraryItemSource,
    manager?: EntityManager,
  ): Promise<number> {
    return this.libraryItemRepository.countByUserIdAndSource(
      userId,
      source,
      manager,
    );
  }

  /** 미청취 재고(`drip-scheduling.md` 4.1) — 편성 배치의 스킵 판정 입력 */
  async countUnfinished(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.libraryItemRepository.countUnfinishedByUserId(userId, manager);
  }

  /** 최근 편성분(드립·탐험) `content_id` — 노출 피로 감점 입력(`drip-scheduling.md` 4.2 ③) */
  async findRecentDripContentIds(
    userId: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.libraryItemRepository.findRecentContentIdsByUserIdAndSources(
      userId,
      [LibraryItemSource.DRIP, LibraryItemSource.DISCOVERY],
      since,
      manager,
    );
  }

  /** 콘텐츠별 전 사용자 편성 이력 수 — 탐험 저노출 판정 입력(`drip-scheduling.md` 4.8-2) */
  async countExposures(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    return this.libraryItemRepository.countExposuresByContentIds(
      contentIds,
      manager,
    );
  }

  /** 완청한 시리즈의 최대 회차 — 시리즈 연속성·다음 편 허용 판정 입력(`drip-scheduling.md` 4.2·7) */
  async findCompletedSeriesMaxEpisodes(
    userId: string,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    return this.libraryItemRepository.findCompletedSeriesMaxEpisodes(
      userId,
      manager,
    );
  }

  /**
   * 완청한 고유 콘텐츠 수 — 프로필 통계의 `completed_content_count`(`profile.md` 4.5).
   *
   * 완청 **판정**은 이 모듈이 하지 않는다. `player`가 판정해 `status = completed`로 전이시킨
   * 결과를 세기만 한다(`profile-api.md` 1장 — 완청 판정 값을 재정의하지 않는다).
   * 삭제된 항목도 포함한다 — 들었다는 사실은 목록에서 지운다고 없어지지 않는다.
   */
  async countCompletedContents(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.libraryItemRepository.countCompletedContentsByUserId(
      userId,
      manager,
    );
  }

  /**
   * 드립 후보에서 제외할 콘텐츠 — **`deleted_at` 여부와 무관하다**
   * (`drip-scheduling.md` 4.2). 삭제한 콘텐츠도 재적립하지 않는다(FR-16).
   */
  async findAllContentIds(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.libraryItemRepository.findAllContentIdsByUserId(
      userId,
      manager,
    );
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.libraryItemRepository.deleteByUserId(userId, manager);
  }

  /**
   * library-api.md 4.1 — 목록 한 페이지.
   *
   * Repository가 한 건 더 읽어 오므로 **여기서 잘라내고 다음 페이지 여부를 판정한다.**
   * `has_next`가 `false`일 때 커서를 발급하지 않는 것은 호출부(응답 조립) 책임이다.
   */
  async findPage(
    query: LibraryPageQuery,
    manager?: EntityManager,
  ): Promise<LibraryPage> {
    const rows = await this.libraryItemRepository.findPage(query, manager);
    const hasNext = rows.length > query.limit;

    return { items: hasNext ? rows.slice(0, query.limit) : rows, hasNext };
  }

  /** 주제 필터 팝업의 집계 대상 — 삭제되지 않고 회수되지 않은 항목의 `content_id` */
  async findVisibleContentIds(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.libraryItemRepository.findAllVisibleContentIdsByUserId(
      userId,
      manager,
    );
  }

  /**
   * 미니플레이어 복원 대상(library-api.md 4.3).
   *
   * `position_sec > 0` 후보를 밖에서 받는 이유는 재생 위치의 소유자가 `playback` 모듈이기
   * 때문이다(domain.md 2장). **판정 자체는 서버가 한다** — 클라이언트에 맡기면 규칙이 두
   * 곳에 생기고, 조건이 바뀔 때 앱 배포 없이는 고칠 수 없다.
   */
  async findResumeTarget(
    userId: string,
    startedContentIds: string[],
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.libraryItemRepository.findLatestPlayedAmongContentIds(
      userId,
      startedContentIds,
      manager,
    );
  }

  /**
   * **다른 사용자의 항목은 403이 아니라 404다**(library-api.md 7장).
   * 403은 "그 항목이 존재한다"는 사실을 알려주므로, id를 넣어보는 것만으로 남의 라이브러리
   * 구성을 탐지할 수 있다.
   *
   * 소유권 검증을 Guard가 아니라 여기서 하는 것도 규칙이다 — 도메인 판정이기 때문이다
   * (architecture.md 9.2).
   */
  async getOwnedItem(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem> {
    const item = await this.libraryItemRepository.findByIdAndUserId(
      id,
      userId,
      manager,
    );

    return this.assertFound(item);
  }

  /** 복구 대상은 이미 삭제된 항목이므로 소프트 삭제분까지 읽는다 */
  async getOwnedItemWithDeleted(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem> {
    const item = await this.libraryItemRepository.findByIdAndUserIdWithDeleted(
      id,
      userId,
      manager,
    );

    return this.assertFound(item);
  }

  /**
   * 재생 시작에 따른 상태 전이(library-api.md 4.4 서버 처리 4번).
   *
   * **라이브러리에 없는 콘텐츠를 재생해도 행을 만들지 않는다**(`explore.md` 4.3) —
   * 담기는 사용자의 명시적 조작이다. 재생이 담기를 유발하면 "한 번 들어본 것"과
   * "담아둔 것"이 구분되지 않고 라이브러리가 청취 이력으로 변한다.
   *
   * **`completed`는 되돌리지 않는다.** 완청한 콘텐츠를 다시 재생해도 `in_progress`로
   * 내리지 않는다(`library.md` 7).
   */
  async markPlayStarted(
    userId: string,
    contentId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    const item = await this.libraryItemRepository.findByUserIdAndContentId(
      userId,
      contentId,
      manager,
    );

    if (!item) {
      return null;
    }

    if (item.status === LibraryItemStatus.UNPLAYED) {
      item.status = LibraryItemStatus.IN_PROGRESS;
    }
    item.lastPlayedAt = now;

    return this.libraryItemRepository.save(item, manager);
  }

  /**
   * 완청 처리(library-api.md 4.5). **클라이언트의 선언을 그대로 받지 않는다** —
   * 서버가 도달 위치로 기준을 다시 판정한다. 그대로 받으면 `library.md` 4.4가 제거한
   * 수동 완료 표시가 API 형태로 되살아나고, 완청률 지표와 추천 신호의 의미가 무너진다.
   *
   * `duration_sec`이 없거나 0이면 판정할 수 없으므로 **재생 종료 이벤트만으로 완료 처리**
   * 한다(`library.md` 7 — 업로드 검증이 길이 0을 거부하므로 정상 경로에서는 발생하지 않는
   * 방어적 처리다).
   */
  async completeItem(
    item: LibraryItem,
    maxReachedSec: number,
    now: Date,
    manager?: EntityManager,
  ): Promise<LibraryItem> {
    // 90% 이후 되감아 다시 들어도 상태를 되돌리지 않는다. `completed_at`은 최초 값 유지
    if (item.status === LibraryItemStatus.COMPLETED) {
      return item;
    }

    const durationSec = item.content?.durationSec ?? 0;

    if (
      durationSec > 0 &&
      maxReachedSec < durationSec * COMPLETION_REACHED_RATIO
    ) {
      throw new BusinessConflictException({
        errorCode: ErrorCode.LIBRARY_COMPLETION_NOT_REACHED,
        message: '아직 완청 기준에 도달하지 않았어요',
        logLevel: 'info',
      });
    }

    item.status = LibraryItemStatus.COMPLETED;
    item.completedAt = now;

    return this.libraryItemRepository.save(item, manager);
  }

  /**
   * 소프트 삭제(library-api.md 4.6). **이미 삭제된 항목에도 성공으로 응답한다** —
   * 오프라인 큐가 같은 삭제를 다시 보낼 수 있고(`common-error-handling.md` 4.5),
   * 실패시킬 이유가 없다.
   */
  async softDelete(
    item: LibraryItem,
    now: Date,
    manager?: EntityManager,
  ): Promise<void> {
    if (item.deletedAt) {
      return;
    }

    await this.libraryItemRepository.softDeleteById(item.id, now, manager);
  }

  /**
   * 삭제 실행 취소(library-api.md 4.7).
   *
   * **`added_at`과 `status`를 유지한다.** 복구를 새 적립으로 처리하면 항목이 목록 맨 위로
   * 올라와 순서가 바뀐다 — 사용자가 되돌린 것은 삭제이지 적립 시각이 아니다.
   *
   * **실행 취소 창(5초)을 서버가 강제하지 않는다.** 5초는 스낵바의 표시 시간이지 서버가
   * 검증할 수 있는 값이 아니고, 오프라인 큐가 지연되면 서버 시각으로는 이미 지난 뒤다.
   */
  async restore(
    item: LibraryItem,
    manager?: EntityManager,
  ): Promise<LibraryItem> {
    if (!item.deletedAt) {
      return item;
    }

    await this.libraryItemRepository.restoreById(item.id, manager);
    item.deletedAt = null;

    return item;
  }

  private assertFound(item: LibraryItem | null): LibraryItem {
    if (!item) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.LIBRARY_ITEM_NOT_FOUND,
        message: '라이브러리에서 찾을 수 없어요',
      });
    }

    return item;
  }
}
