import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { StoreReview } from './store-review.entity';
import { ReviewStore } from './voc.enum';

/** upsert 한 행에 담는 값 — `id`·공통 컬럼은 DB가 채운다 */
export type StoreReviewUpsertRow = Pick<
  StoreReview,
  'store' | 'reviewId' | 'rating' | 'lastModifiedAt' | 'notifiedAt'
>;

@Injectable()
export class StoreReviewRepository {
  constructor(
    @InjectRepository(StoreReview)
    private readonly repository: Repository<StoreReview>,
  ) {}

  /** 그 스토어를 기록한 적이 있는가 — 스토어별 첫 기록(기준선) 판정에 쓴다(`StoreReviewPollService`) */
  async hasAnyByStore(store: ReviewStore): Promise<boolean> {
    return (await this.repository.countBy({ store })) > 0;
  }

  async findAllByStoreAndReviewIds(
    store: ReviewStore,
    reviewIds: string[],
  ): Promise<StoreReview[]> {
    if (reviewIds.length === 0) {
      return [];
    }

    return this.repository.findBy({ store, reviewId: In(reviewIds) });
  }

  /** 같은 리뷰의 재조회는 덮어쓴다 — `(store, review_id)` 유니크 위에서 upsert */
  async upsert(rows: StoreReviewUpsertRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await this.repository
      .createQueryBuilder()
      .insert()
      .into(StoreReview)
      .values(rows)
      .orUpdate(
        ['rating', 'last_modified_at', 'notified_at', 'updated_at'],
        ['store', 'review_id'],
      )
      .execute();
  }
}
