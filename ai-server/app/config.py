"""환경 설정 — 기동 시 스키마 검증하고, 누락되면 기동을 실패시킨다.

`backend/architecture.md` 9.5와 같은 원칙이다(기본값으로 조용히 넘어가지 않는다).
모델 선택(`EMBEDDING_MODEL`·`EMBEDDING_DIM`)의 유일한 소유자가 이 파일 + env다 —
`docs/backend/domain.md` 15.1 #11. 모델 교체는 env 변경 + 발행분 전량 재생성으로 끝나야 한다.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

PROVIDER_STUB = "stub"
PROVIDER_OPENAI = "openai"

#: 임베딩 모델 미확정(domain.md 15.1 #11) 동안의 개발 검증용 기본값.
#: stub 벡터는 결정적(같은 텍스트 → 같은 벡터)이지만 의미 유사도가 없다 —
#: **운영 저장(content_embeddings) 대상이 아니다** (`docs/ai/metadata-pipeline.md` 4.3).
STUB_MODEL_ID = "dev-stub"
STUB_DEFAULT_DIM = 256

DEFAULT_CHUNK_CHARS = 4000


class ConfigError(RuntimeError):
    """환경 변수 누락·형식 오류 — uvicorn 기동이 이 예외로 중단된다."""


@dataclass(frozen=True)
class Settings:
    provider: str
    model: str
    dim: int | None
    chunk_chars: int
    internal_auth_token: str
    openai_api_key: str | None
    openai_base_url: str


def load_settings() -> Settings:
    provider = os.environ.get("EMBEDDING_PROVIDER", PROVIDER_STUB).strip()

    if provider not in (PROVIDER_STUB, PROVIDER_OPENAI):
        raise ConfigError(
            f"EMBEDDING_PROVIDER must be '{PROVIDER_STUB}' or '{PROVIDER_OPENAI}', got '{provider}'"
        )

    model = os.environ.get("EMBEDDING_MODEL", "").strip()

    if provider == PROVIDER_STUB:
        # stub의 모델 식별자는 고정한다 — 임의 이름이 content_embeddings.model에 섞이면
        # "모델이 섞이면 스코어링 불가" 판정(domain.md 5.6)을 흐린다
        model = STUB_MODEL_ID

    if provider == PROVIDER_OPENAI and not model:
        raise ConfigError("EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=openai")

    dim = _read_positive_int("EMBEDDING_DIM", default=None)

    if provider == PROVIDER_STUB and dim is None:
        dim = STUB_DEFAULT_DIM

    chunk_chars = _read_positive_int("EMBEDDING_CHUNK_CHARS", default=DEFAULT_CHUNK_CHARS)
    assert chunk_chars is not None

    internal_auth_token = os.environ.get("INTERNAL_AUTH_TOKEN", "").strip()

    if not internal_auth_token:
        # 내부라서 안전하다고 가정하지 않는다 (`backend/architecture.md` 9.5)
        raise ConfigError("INTERNAL_AUTH_TOKEN is required")

    openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip() or None

    if provider == PROVIDER_OPENAI and not openai_api_key:
        raise ConfigError("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai")

    return Settings(
        provider=provider,
        model=model,
        dim=dim,
        chunk_chars=chunk_chars,
        internal_auth_token=internal_auth_token,
        openai_api_key=openai_api_key,
        openai_base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
    )


def _read_positive_int(name: str, default: int | None) -> int | None:
    raw = os.environ.get(name, "").strip()

    if not raw:
        return default

    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigError(f"{name} must be an integer, got '{raw}'") from error

    if value <= 0:
        raise ConfigError(f"{name} must be positive, got {value}")

    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
