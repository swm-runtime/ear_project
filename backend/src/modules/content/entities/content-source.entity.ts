import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { Content } from './content.entity';

/**
 * domain.md 5.5 — `ai_generated` 콘텐츠의 참고 소스 목록 (확정 2026-08-24).
 *
 * 콘텐츠 상세 화면(FR-40)이 소스 단위 표시(제목·저자·링크 전수 나열)를 요구하면서
 * "정규화하지 않는다"(구 5.1)의 전제가 깨져 테이블로 승격했다. 고지 문구용
 * `contents.source_name` 표기 문자열은 대체하지 않고 그대로 유지한다.
 *
 * `partner` 콘텐츠는 행을 만들지 않는다 — 출처는 기존 컬럼(author_name·source_name·source_url)이 담당한다.
 */
@Entity('content_sources')
@Unique('uq_content_sources_content_id_position', ['contentId', 'position'])
export class ContentSource extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_sources_contents',
  })
  content: Content;

  /** 서버가 정한 표시 순서(1부터). 클라이언트는 재배열하지 않는다 (content-detail.md 4.3) */
  @Column({ name: 'position', type: 'int' })
  position: number;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  /** null = 저자 없는 소스 — 화면은 제목만 표시한다 */
  @Column({ name: 'author', type: 'varchar', length: 100, nullable: true })
  author: string | null;

  /** null = 링크 없는 소스 — 목록에서 빼지 않고 표시만 하며 탭 대상이 아니다 */
  @Column({ name: 'url', type: 'varchar', length: 2048, nullable: true })
  url: string | null;
}
