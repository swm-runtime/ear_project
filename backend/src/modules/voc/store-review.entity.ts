import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { ReviewStore } from './voc.enum';

/**
 * Slack에 올린(또는 올리지 않기로 한) 스토어 리뷰의 **중복 감지 기록** — domain.md `store_reviews`(KAN-133).
 *
 * **리뷰 본문·제목·닉네임은 저장하지 않는다.** 이 표의 목적은 "이 리뷰를 이미 알렸는가, 그 뒤 수정됐는가"뿐이라
 * 식별자·별점·수정 시각이면 충분하다. 본문은 스토어가 원본을 들고 있고, 닉네임은 어디에도 옮기지 않는다
 * (CLAUDE.md 공통 원칙). 리뷰어가 스토어에서 리뷰를 지워도 여기 행은 남는다 — 재알림 방지가 목적이라 해가 없다.
 */
@Entity('store_reviews')
@Unique('uq_store_reviews_store_review_id', ['store', 'reviewId'])
export class StoreReview extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store', type: 'varchar', length: 20 })
  store: ReviewStore;

  /** 스토어가 매긴 식별자. App Store는 UUID 꼴, Play는 `gp:` 접두사의 긴 문자열이라 128자로 둔다 */
  @Column({ name: 'review_id', type: 'varchar', length: 128 })
  reviewId: string;

  /** 마지막으로 본 별점(1~5). 수정 알림 문구에 별점 변화를 적는 데 쓴다 */
  @Column({ name: 'rating', type: 'smallint' })
  rating: number;

  /** 스토어가 알려 준 작성·수정 시각. 조회한 값이 이보다 크면 수정된 리뷰다 */
  @Column({ name: 'last_modified_at', type: 'timestamptz' })
  lastModifiedAt: Date;

  /**
   * Slack에 올린 시각. **null은 "알리지 않고 기록만 했다"**다 — 그 스토어를 처음 기록할 때 이미 쌓여 있던
   * (24시간보다 오래된) 리뷰를 채널에 쏟지 않으려고 기록만 하고 넘어간 행이 여기 해당한다(`StoreReviewPollService`).
   */
  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;
}
