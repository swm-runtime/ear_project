import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { DripExclusionReason } from '../drip.enum';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';

/**
 * 편성 적립의 실행부 — `drip-scheduling.md` 4.6.
 *
 * **한 묶음의 적립은 원자적이다**(4.6-4 — 2편 중 1편만 적립되는 상태를 만들지 않는다).
 * 정규 2편과 탐험 1편은 **서로 다른 묶음**이다: 탐험은 정규 뒤에 별도 호출로 처리하고,
 * 실패해도 정규 적립을 롤백하지 않는다(4.8 — 부가 슬롯이 본편을 막으면 안 된다).
 *
 * 탐험 편의 영구 제외 사유도 `dripped`를 그대로 쓴다(domain.md 7.1) —
 * 재적립 방지 관점에서 두 경로는 같고, 경로 구분은 `library_items.source`가 담당한다.
 */
@Injectable()
export class DripPlacementService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly dripExcludedContentRepository: DripExcludedContentRepository,
    private readonly dataSource: DataSource,
  ) {}

  async placeItems(
    userId: string,
    contentIds: string[],
    source: LibraryItemSource.DRIP | LibraryItemSource.DISCOVERY,
    now: Date,
  ): Promise<void> {
    if (contentIds.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.libraryService.addItems(
        userId,
        contentIds,
        source,
        now,
        manager,
      );

      await this.dripExcludedContentRepository.insertIgnoringConflicts(
        contentIds.map((contentId) => ({
          userId,
          contentId,
          reason: DripExclusionReason.DRIPPED,
          excludedAt: now,
        })),
        manager,
      );
    });
  }
}
