import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Not, Repository } from 'typeorm';

import { UserMarket } from '@/modules/user/user.enum';

import { LibrarySeries } from './library-series.entity';
import { LibraryItemSource, LibraryItemStatus } from './library.enum';

/** 새 편 적립 한 문장의 입력 — 방금 처음 공개된 시리즈 편 */
export interface NewEpisodeDelivery {
  contentId: string;
  seriesId: string;
  /** 편의 시장(`contents.market`) — 같은 시장 사용자에게만 들어간다 */
  market: UserMarket;
  now: Date;
}

/**
 * 새 편 적립 SQL(KAN-245 무엇을 한다 6). 단위 테스트가 조건을 대조하므로 상수로 둔다.
 *
 * - **시리즈째 담은 살아 있는 행만**(`ls.deleted_at IS NULL`) — 시리즈째 뺀 사용자에게는 오지 않는다.
 * - **같은 시장만**(`u.market = $3`) — 시장 격리(`global-api.md` 4.7). 시장을 바꾼 사용자는 이전 시장 시리즈의 새 편을 받지 않는다.
 * - **그 편의 `library_items` 행이 아예 없는 사용자만**(삭제 이력 포함 — `deleted_at`을 보지 않는다). 사용자가 뺀 편은 다시
 *   넣지 않는다. 새로 발행된 편이라 정상 경로에서 행이 있을 수 없지만, 같은 순간의 담기와 겹쳐도 되살리지 않게 명시한다.
 * - **`ON CONFLICT DO NOTHING`** — 동시 담기·재실행이 와도 `uq_library_items_user_id_content_id`가 중복을 막는다(A-5).
 * - `source = save`, `status = unplayed`, `added_at = now` — 라이브러리 맨 위(`queue_position` NULL = 순서 미지정 → 맨 위).
 *   `algorithm_version`은 NULL(담기 출처는 버전이 없다 — domain.md 6.1).
 */
export const DELIVER_NEW_EPISODE_SQL = `
  INSERT INTO "library_items" ("user_id", "content_id", "source", "status", "added_at")
  SELECT ls."user_id", $1, $4, $5, $6
    FROM "library_series" ls
    JOIN "users" u ON u."id" = ls."user_id"
   WHERE ls."series_id" = $2
     AND ls."deleted_at" IS NULL
     AND u."market" = $3
     AND NOT EXISTS (
       SELECT 1 FROM "library_items" li
        WHERE li."user_id" = ls."user_id" AND li."content_id" = $1
     )
  ON CONFLICT ON CONSTRAINT "uq_library_items_user_id_content_id" DO NOTHING
  RETURNING "user_id"`;

/**
 * `library_series`는 library 모듈 소유다(domain.md 2장). 다른 모듈은 `LibrarySeriesService`만 호출한다.
 */
@Injectable()
export class LibrarySeriesRepository {
  constructor(
    @InjectRepository(LibrarySeries)
    private readonly repository: Repository<LibrarySeries>,
  ) {}

  private scoped(manager?: EntityManager): Repository<LibrarySeries> {
    return manager ? manager.getRepository(LibrarySeries) : this.repository;
  }

  /**
   * 시리즈째 담기 upsert — 행이 없으면 만들고, **삭제된 행이면 되살리며 `added_at`을 새로 찍는다**(재담기는 새 담기).
   * 살아 있는 행은 건드리지 않는다(오프라인 큐 재전송이 담은 시각을 흔들지 않게). 동시 요청은 유니크가 한 행으로 모은다.
   */
  async upsertActive(
    userId: string,
    seriesId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).query(
      `INSERT INTO "library_series" ("user_id", "series_id", "added_at")
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT "uq_library_series_user_id_series_id"
       DO UPDATE SET "deleted_at" = NULL, "added_at" = EXCLUDED."added_at", "updated_at" = now()
        WHERE "library_series"."deleted_at" IS NOT NULL`,
      [userId, seriesId, now],
    );
  }

  /** @returns 이번 요청이 실제로 뺐는지(살아 있던 행이 있었는지) */
  async softDelete(
    userId: string,
    seriesId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager).update(
      { userId, seriesId, deletedAt: IsNull() },
      { deletedAt: now },
    );

    return (result.affected ?? 0) > 0;
  }

  /** 실행 취소 — 삭제된 행만 되살린다. **`added_at`은 그대로다**(편 복구 `library-api.md` 4.7과 같다) */
  async restore(
    userId: string,
    seriesId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager).update(
      { userId, seriesId, deletedAt: Not(IsNull()) },
      { deletedAt: null },
    );

    return (result.affected ?? 0) > 0;
  }

  async existsActive(
    userId: string,
    seriesId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.scoped(manager).exists({
      where: { userId, seriesId, deletedAt: IsNull() },
    });
  }

  /** @returns 새 편을 받은 사용자 id */
  async deliverNewEpisode(
    delivery: NewEpisodeDelivery,
    manager?: EntityManager,
  ): Promise<string[]> {
    const raw: unknown = await this.scoped(manager).query(
      DELIVER_NEW_EPISODE_SQL,
      [
        delivery.contentId,
        delivery.seriesId,
        delivery.market,
        LibraryItemSource.SAVE,
        LibraryItemStatus.UNPLAYED,
        delivery.now,
      ],
    );

    // INSERT … RETURNING 은 드라이버가 행 배열로 돌려준다(UPDATE 와 달리 [행, 수] 모양이 아니다)
    return (raw as { user_id: string }[]).map((row) => row.user_id);
  }
}
