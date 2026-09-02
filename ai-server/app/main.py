"""앱 조립만 한다 — backend의 `app.module.ts`와 같은 역할.

실행: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (ai-server/README.md)
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.embeddings import router as embeddings_router
from app.config import get_settings


def create_app() -> FastAPI:
    # 기동 시점에 env를 검증한다 — 누락이면 여기서 실패한다 (config.py)
    settings = get_settings()

    app = FastAPI(
        title="ear ai-server",
        version="0.1.0",
        # 내부 전용 서버 — API 문서 화면을 외부에 노출하지 않는다
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    app.include_router(embeddings_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        # backend의 /api/v1/health와 같은 모양 — 인프라 헬스체크 경로
        return {"status": "ok", "provider": settings.provider, "model": settings.model}

    return app


app = create_app()
