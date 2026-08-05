import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { LibraryItemRepository } from './library-item.repository';
import { LibraryItemSource, LibraryItemStatus } from './library.enum';

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
}
