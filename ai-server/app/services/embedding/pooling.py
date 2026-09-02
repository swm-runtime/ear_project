"""청크 벡터 결합 — 평균 → L2 정규화.

코사인 유사도가 전제이므로(`docs/backend/domain.md` 5.6) 결과 벡터는 항상 단위 벡터다.
`docs/ai/metadata-pipeline.md` 4.3의 "청크로 나눠 각각 임베딩 후 평균 → 정규화" 규칙의 구현이다.
"""

from __future__ import annotations

import math


def mean_pool(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        raise ValueError("mean_pool requires at least one vector")

    dim = len(vectors[0])

    if any(len(vector) != dim for vector in vectors):
        raise ValueError("all vectors must have the same dimension")

    return [sum(vector[i] for vector in vectors) / len(vectors) for i in range(dim)]


def l2_normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))

    if norm == 0.0:
        raise ValueError("cannot normalize a zero vector")

    return [value / norm for value in vector]
