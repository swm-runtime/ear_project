import { Injectable, Logger } from '@nestjs/common';

import { EMBEDDING_MODEL_ID } from '../content.constant';
import { ContentTitleEmbeddingRepository } from '../repositories/content-title-embedding.repository';
import { TextEmbeddingClient } from '../text-embedding.client';

/**
 * 한 편의 제목 임베딩 결과.
 * - `created` — 새로 만들었다(없던 행 · 제목이 바뀐 행 · 모델이 다른 행을 덮어씀)
 * - `unchanged` — 지금 제목·모델의 행이 이미 있다(AI 서버를 부르지 않았다)
 * - `failed` — AI 서버 결손이나 저장 오류. 행은 그대로다(없던 편은 계속 없다)
 * - `disabled` — AI 서버 미설정(`AI_SERVER_URL`·`AI_SERVER_INTERNAL_TOKEN`)
 */
export type TitleEmbeddingOutcome =
  'created' | 'unchanged' | 'failed' | 'disabled';

export interface TitleEmbeddingBackfillOptions {
  /** 이 콘텐츠들만(없으면 전체) */
  contentIds?: string[];
  /** 이번 실행의 상한 */
  limit?: number;
  /** 요청 사이 대기(ms) — 레이트 제한 */
  delayMs: number;
  /** 대상만 세고 부르지 않는다 */
  dryRun?: boolean;
}

export interface TitleEmbeddingBackfillResult {
  targets: number;
  created: number;
  failed: number;
}

/**
 * 검색 의미 엔진의 제목 임베딩(`content_title_embeddings`) 생성 — 발행·재발행 훅과 백필이 같은 경로를 쓴다.
 *
 * **최선 노력이다.** 발행·재발행 트랜잭션이 커밋된 **뒤에** 부르고, 무엇이 실패해도 던지지 않는다 — 실패하면 그 편은 행이 없고
 * (또는 낡은 행이 남아 `source_text` 불일치로 무시되고) 검색은 대본 벡터만 본다. 다음 백필이 채운다.
 *
 * 같은 제목·모델의 행이 이미 있으면 AI 서버를 부르지 않는다 — 제목을 바꾸지 않은 재발행·백필 재실행이 비용을 내지 않는다(멱등).
 */
@Injectable()
export class ContentTitleEmbeddingService {
  private readonly logger = new Logger(ContentTitleEmbeddingService.name);

  constructor(
    private readonly repository: ContentTitleEmbeddingRepository,
    private readonly client: TextEmbeddingClient,
  ) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  /** 한 편의 제목 임베딩을 지금 제목에 맞춘다. **던지지 않는다** */
  async refresh(content: {
    id: string;
    title: string;
  }): Promise<TitleEmbeddingOutcome> {
    if (!this.client.enabled) {
      return 'disabled';
    }

    try {
      const current = await this.repository.findByContentId(content.id);

      if (
        current &&
        current.model === EMBEDDING_MODEL_ID &&
        current.sourceText === content.title
      ) {
        return 'unchanged';
      }

      return await this.generate(content);
    } catch (error) {
      this.logger.warn('title embedding refresh failed', {
        content_id: content.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'failed';
    }
  }

  /**
   * 유효한 제목 임베딩이 없는 편을 채운다(멱등 — 이미 채운 편은 대상에서 빠진다). 한 편씩 차례로 부르고 사이에 `delayMs`를 쉰다.
   * 한 편의 실패는 다음 편을 막지 않는다. `onProgress`는 스크립트의 진행 출력용이다(제목은 콘텐츠 데이터라 찍어도 된다).
   */
  async backfill(
    options: TitleEmbeddingBackfillOptions,
    onProgress?: (
      target: { id: string; title: string },
      outcome: TitleEmbeddingOutcome,
    ) => void,
  ): Promise<TitleEmbeddingBackfillResult> {
    const targets = await this.repository.findContentsMissingTitleEmbedding(
      EMBEDDING_MODEL_ID,
      { contentIds: options.contentIds, limit: options.limit },
    );
    const result: TitleEmbeddingBackfillResult = {
      targets: targets.length,
      created: 0,
      failed: 0,
    };

    if (options.dryRun || targets.length === 0) {
      return result;
    }

    for (const [index, target] of targets.entries()) {
      if (index > 0 && options.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      let outcome: TitleEmbeddingOutcome;

      try {
        outcome = await this.generate(target);
      } catch (error) {
        this.logger.warn('title embedding backfill failed', {
          content_id: target.id,
          error: error instanceof Error ? error.message : String(error),
        });
        outcome = 'failed';
      }

      if (outcome === 'created') result.created += 1;
      else result.failed += 1;

      onProgress?.(target, outcome);
    }

    return result;
  }

  private async generate(content: {
    id: string;
    title: string;
  }): Promise<TitleEmbeddingOutcome> {
    const vector = await this.client.embed(content.title);

    if (!vector) {
      return 'failed';
    }

    await this.repository.upsert({
      contentId: content.id,
      embedding: vector,
      model: EMBEDDING_MODEL_ID,
      sourceText: content.title,
    });

    return 'created';
  }
}
