import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from './content.constant';

/** 응답을 쓸 수 없는 사유 — 로그에는 이것만 남긴다(본문·토큰은 남기지 않는다) */
export type EmbeddingRejectReason =
  'invalid_body' | 'model_mismatch' | 'dim_mismatch';

/**
 * AI 서버 `POST /embeddings` 응답 `{ model, dim, vector }`(ai-server `EmbeddingResponse`)의 검증 — 질의 임베딩(`QueryEmbeddingClient`)과
 * 제목 임베딩(`TextEmbeddingClient`)이 같은 규칙을 쓴다. 모델·차원이 저장 벡터와 같아야 비교할 수 있다(domain.md 5.6) —
 * 다른 모델(개발 스텁 `dev-stub` 포함)의 벡터는 거부한다.
 */
export function parseEmbeddingResponse(
  body: unknown,
): { vector: number[] } | { reason: EmbeddingRejectReason } {
  if (typeof body !== 'object' || body === null) {
    return { reason: 'invalid_body' };
  }

  const { model, dim, vector } = body as Record<string, unknown>;

  if (model !== EMBEDDING_MODEL_ID) {
    return { reason: 'model_mismatch' };
  }

  if (
    dim !== EMBEDDING_DIM ||
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIM
  ) {
    return { reason: 'dim_mismatch' };
  }

  if (!vector.every((value) => Number.isFinite(value))) {
    return { reason: 'invalid_body' };
  }

  return { vector: vector as number[] };
}
