"""POST /embeddings — 텍스트 1건을 임베딩 벡터로 바꾼다.

호출자: 메타데이터 부여 파이프라인 스킬(`docs/ai/metadata-pipeline.md` 4.3 Phase B),
추후 Backend(재발행·소급·모델 교체 일괄 재생성).

청킹·평균·정규화는 전부 이 서버 안이다 — 호출자마다 규칙이 갈리면 벡터가 비교 불가능해진다
(`docs/backend/domain.md` 5.6 — 코사인 전제·모델 단일성).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import verify_internal_token
from app.config import Settings, get_settings
from app.services.embedding.chunker import chunk_text
from app.services.embedding.client import EmbeddingClient, build_client
from app.services.embedding.pooling import l2_normalize, mean_pool

#: 대본 전문 상한 — 10~15분 대본(3,500~5,250자)의 수십 배 여유. 무제한 입력은 받지 않는다
MAX_TEXT_CHARS = 200_000

router = APIRouter(dependencies=[Depends(verify_internal_token)])


class EmbeddingRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class EmbeddingResponse(BaseModel):
    """`enrichment.json`의 `embedding` 키와 같은 모양이다(`docs/ai/metadata-pipeline.md` 4.4) —
    스킬이 응답을 그대로 옮겨 담을 수 있어야 한다."""

    model: str
    dim: int
    vector: list[float]


def get_client(settings: Settings = Depends(get_settings)) -> EmbeddingClient:
    return build_client(settings)


@router.post("/embeddings", response_model=EmbeddingResponse)
def create_embedding(
    request: EmbeddingRequest,
    settings: Settings = Depends(get_settings),
    client: EmbeddingClient = Depends(get_client),
) -> EmbeddingResponse:
    chunks = chunk_text(request.text, settings.chunk_chars)
    vectors = client.embed(chunks)
    pooled = l2_normalize(mean_pool(vectors))

    return EmbeddingResponse(model=client.model, dim=len(pooled), vector=pooled)
