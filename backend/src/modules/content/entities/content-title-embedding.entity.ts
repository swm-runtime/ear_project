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
 * 콘텐츠 **제목**의 임베딩 — 검색 의미 엔진 전용(`explore.md` 4.5-5). 대본 임베딩(`ContentEmbedding`)과 같은 모델·차원이고
 * 정규화돼 저장된다(AI 서버가 L2 정규화). **추천 스코어링·관련 콘텐츠의 입력이 아니다** — 그쪽은 대본 벡터만 본다.
 *
 * 생성 주체는 서버다 — 발행·재발행 커밋 뒤 AI 서버 `POST /embeddings`(`ContentTitleEmbeddingService`). 업로드 파일로 받지 않는다.
 *
 * 유효 조건: `model = EMBEDDING_MODEL_ID` **그리고** `source_text = contents.title`. 제목을 바꾸면 행이 자연히 무효가 되고,
 * 재생성(재발행 훅·백필)이 같은 행을 덮어쓴다.
 */
@Entity('content_title_embeddings')
@Unique('uq_content_title_embeddings_content_id', ['contentId'])
export class ContentTitleEmbedding extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_content_title_embeddings_contents',
  })
  content: Content;

  @Column({ name: 'embedding', type: 'text', transformer: vectorTransformer })
  embedding: number[];

  /** 생성 모델 식별자 — 질의 벡터와 같은 모델이어야 비교한다(domain.md 5.6). "dev-stub"은 저장하지 않는다 */
  @Column({ name: 'model', type: 'varchar', length: 100 })
  model: string;

  /** 임베딩한 글자 그대로(= 그때의 `contents.title`) — 현재 제목과 다르면 낡은 행이다 */
  @Column({ name: 'source_text', type: 'varchar', length: 255 })
  sourceText: string;
}
