import { test } from "node:test";
import assert from "node:assert/strict";
import { embeddingRejectReason, EMBEDDING_DIM_EXPECTED, EMBEDDING_MODEL_EXPECTED } from "@ear/pipeline";

const vec = (n = EMBEDDING_DIM_EXPECTED) => Array.from({ length: n }, (_, i) => Math.sin(i));

test("임베딩 검증 — BE parseEmbedding 과 같은 조건: 통과면 null, 어긋나면 사유 (KAN-89 3항)", () => {
  assert.equal(embeddingRejectReason({ model: EMBEDDING_MODEL_EXPECTED, dim: 1536, vector: vec() }), null);
  assert.equal(embeddingRejectReason({ model: EMBEDDING_MODEL_EXPECTED, vector: vec() }), null); // dim 없어도 통과
  assert.match(embeddingRejectReason({ model: "dev-stub", vector: vec() })!, /stub/);
  assert.match(embeddingRejectReason({ model: "text-embedding-3-large", vector: vec() })!, /모델 불일치/);
  assert.match(embeddingRejectReason({ model: EMBEDDING_MODEL_EXPECTED, vector: vec(1535) })!, /차원 1535/);
  assert.match(embeddingRejectReason({ model: EMBEDDING_MODEL_EXPECTED, dim: 3072, vector: vec() })!, /dim 3072/);
  assert.match(embeddingRejectReason({ model: EMBEDDING_MODEL_EXPECTED, vector: [...vec(1535), NaN] })!, /유한/);
});
