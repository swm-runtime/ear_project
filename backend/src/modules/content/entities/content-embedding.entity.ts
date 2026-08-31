import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { vectorTransformer } from '@/common/utils/vector.transformer';
import { BaseEntity } from '@/database/base.entity';

import { Content } from './content.entity';

/**
 * domain.md 5.6 — 콘텐츠 대본의 임베딩 벡터. 추천 스코어링의 임베딩 유사도 축 입력이다
 * (`drip-scheduling.md` 4.2 ①). 코사인 유사도(`<=>`) 전제라 벡터는 정규화돼 저장된다.
 *
 * **차원은 1536으로 확정됐다**(OpenAI text-embedding-3-small — domain.md 15.1 #11 해소
 * 2026-09-01). 생성 주체는 AI 서버(`ai-server/`)이며 서버는 업로드 시 받은 값을 저장만 한다.
 *
 * `embedding`의 `type: 'text'`는 DDL용이 아니다(마이그레이션이 `vector(1536)`으로 소유) —
 * pgvector ↔ `number[]` 런타임 변환만 담당한다(`vector.transformer.ts`).
 */
@Entity('content_embeddings')
@Unique('uq_content_embeddings_content_id', ['contentId'])
export class ContentEmbedding extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_embeddings_contents',
  })
  content: Content;

  @Column({ name: 'embedding', type: 'text', transformer: vectorTransformer })
  embedding: number[];

  /** 생성 모델 식별자 — 모델이 섞이면 스코어링 불가(domain.md 5.6). "dev-stub"은 운영 저장 금지 */
  @Column({ name: 'model', type: 'varchar', length: 100 })
  model: string;

  /** 어느 버전 대본 기준인지 — `contents.content_version`과 대조해 재발행 후 미갱신을 검출한다 */
  @Column({ name: 'content_version', type: 'int', default: 1 })
  contentVersion: number;
}
