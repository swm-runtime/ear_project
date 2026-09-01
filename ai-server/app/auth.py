"""내부 서비스 토큰 검증 — AI 서버는 내부 호출 전용이지만 "내부라서 안전"을 가정하지 않는다
(`backend/architecture.md` 9.5 — 콜백·내부 엔드포인트도 인증 없이 열어두지 않는다).

호출자(메타데이터 부여 파이프라인 스킬, 추후 Backend)는 `X-Internal-Token` 헤더로
`INTERNAL_AUTH_TOKEN`과 같은 값을 보낸다.
"""

from __future__ import annotations

import hmac

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def verify_internal_token(
    x_internal_token: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    # 비교는 상수 시간으로 — 타이밍으로 토큰을 추측하지 못하게 한다
    if not hmac.compare_digest(x_internal_token, settings.internal_auth_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )
