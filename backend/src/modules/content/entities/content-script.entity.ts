import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { ScriptSection, ScriptSegment } from '../content.types';
import { Content } from './content.entity';

/**
 * domain.md 5.3 — 대본(자막) 세그먼트. 콘텐츠당 1행, `segments`는 jsonb 배열이다(FR-25).
 *
 * 세그먼트 단위 조회·검색 요구가 없어 한 컬럼에 둔다. 키는 DB 쪽 형상이라 snake_case를 유지한다
 * (`duration_pref`와 같은 규칙 — convention.md 1.6의 변환 경계는 DTO이지 jsonb 내용이 아니다).
 *
 * **오디오와 같은 접근 통제를 받는다**(architecture.md 9.4). 조회 경로는 재생 발급과 같은 판정을 거친다.
 */
@Entity('content_scripts')
@Unique('uq_content_scripts_content_id', ['contentId'])
export class ContentScript extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_scripts_contents',
  })
  content: Content;

  /** `start_sec` 오름차순, 겹치지 않는다 — 적재 시 검증한다(admin `script-file.ts`) */
  @Column({ name: 'segments', type: 'jsonb' })
  segments: ScriptSegment[];

  /**
   * 구간 제목(KAN-144) — `start_sec` 엄격한 오름차순, 0~30개. 세그먼트와 같은 파일에서 같은 트랜잭션으로
   * 통째로 교체된다. 배열 형식 파일(구간 없음)·기존 행은 빈 배열이다
   */
  @Column({ name: 'sections', type: 'jsonb', default: () => "'[]'::jsonb" })
  sections: ScriptSection[];
}
