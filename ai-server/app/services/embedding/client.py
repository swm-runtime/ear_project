"""임베딩 제공자 클라이언트 — 모델 호출의 유일한 자리.

모델 교체는 이 파일 + env(`EMBEDDING_MODEL` 등)로 끝나야 한다(`docs/backend/domain.md` 15.1 #11).
호출부(API 라우터)는 제공자를 모른다.

- `stub`: 모델 미확정 동안의 개발 검증용. sha256 시드 결정적 벡터 — 같은 텍스트는 같은 벡터.
  의미 유사도가 없으므로 **운영 저장 대상이 아니다**(`docs/ai/metadata-pipeline.md` 4.3).
- `openai`: OpenAI 호환 `/embeddings` 호출. `EMBEDDING_DIM`이 있으면 `dimensions`로 전달한다
  (text-embedding-3 계열의 차원 축소).
"""

from __future__ import annotations

import hashlib
import struct
from typing import Protocol

import httpx

from app.config import PROVIDER_OPENAI, PROVIDER_STUB, Settings

REQUEST_TIMEOUT_SEC = 30.0


class EmbeddingClient(Protocol):
    model: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class StubEmbeddingClient:
    def __init__(self, model: str, dim: int) -> None:
        self.model = model
        self._dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        # sha256을 카운터 모드로 늘려 dim개의 float를 만든다 — 라이브러리 의존 없이 결정적
        values: list[float] = []
        counter = 0

        while len(values) < self._dim:
            digest = hashlib.sha256(f"{counter}:{text}".encode()).digest()

            for offset in range(0, len(digest) - 3, 4):
                (raw,) = struct.unpack_from(">I", digest, offset)
                values.append(raw / 0xFFFFFFFF - 0.5)

                if len(values) == self._dim:
                    break

            counter += 1

        return values


class OpenAiEmbeddingClient:
    def __init__(self, settings: Settings) -> None:
        self.model = settings.model
        self._dim = settings.dim
        self._base_url = settings.openai_base_url
        self._api_key = settings.openai_api_key

    def embed(self, texts: list[str]) -> list[list[float]]:
        payload: dict = {"model": self.model, "input": texts}

        if self._dim is not None:
            payload["dimensions"] = self._dim

        response = httpx.post(
            f"{self._base_url}/embeddings",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=REQUEST_TIMEOUT_SEC,
        )
        response.raise_for_status()

        data = response.json()["data"]
        # 입력 순서 보장 — 응답의 index로 재정렬한다
        ordered = sorted(data, key=lambda item: item["index"])

        return [item["embedding"] for item in ordered]


def build_client(settings: Settings) -> EmbeddingClient:
    if settings.provider == PROVIDER_STUB:
        assert settings.dim is not None  # config가 보장한다
        return StubEmbeddingClient(model=settings.model, dim=settings.dim)

    if settings.provider == PROVIDER_OPENAI:
        return OpenAiEmbeddingClient(settings)

    raise ValueError(f"unknown provider: {settings.provider}")
