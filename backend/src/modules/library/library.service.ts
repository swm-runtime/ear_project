import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { LibraryItem } from './library-item.entity';
import { LibraryItemRepository } from './library-item.repository';
import { COMPLETION_REACHED_RATIO } from './library.constant';
import { LibraryItemSource, LibraryItemStatus } from './library.enum';
import { LibraryPage, LibraryPageQuery } from './library.types';

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
