import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * 공지사항 — 운영 공지 게시판(`changes/pending/notice-screen-spec.md` D, KAN-67).
 *
 * **점검 공지(domain.md 13.3 `AppConfig`)와 별개다.** 점검 공지는 배포 설정이고, 이것은 사용자가
 * 설정 > 공지사항에서 당겨 보는 글이다. 푸시와 묶지 않는다.
 *
 * - `published_at` NULL = 초안, 미래 시각 = 예약 발행. "발행됨"은 **서버 시각**으로 판정한다.
 * - 작성자 컬럼은 두지 않는다 — 누가 썼는지는 `audit_logs`(10.3)가 남긴다.
 * - 삭제는 soft(`deleted_at`) — 관리자가 실수로 지운 글을 되짚을 수 있게 한다.
 */
@Entity('notices')
@Index('idx_notices_list', ['isPinned', 'publishedAt'], {
  where: '"deleted_at" IS NULL',
})
export class Notice extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 100 })
  title: string;

  /** 줄바꿈을 보존한 일반 텍스트. 마크다운·링크 해석은 하지 않는다 */
  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
