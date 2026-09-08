# auth-api.md — 세션 복원 `GET /users/me` 계약 등재

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | `tickets/backend/pending/session-restore-endpoint.md` 구현 — 계약 없는 엔드포인트를 만들 수 없어 구현과 동시에 계약 등재를 요청한다(코드 선반영 방침) |
| 요청 파트 | 백엔드 |

## 수정 내용 — 신설 절 (4.x)

**`GET /users/me`** — 세션 복원. 실행 관문(splash.md 4)의 2·3단계 판정 입력이다.

- 인증: `Authorization: Bearer <access_token>` 필수. 만료·폐기면 **401이며 재시도를 유도하지
  않는다** — 4.3 갱신 실패와 같은 규칙으로, 클라이언트는 시작 화면으로 간다.
- 응답 200 (구현 확정 형상 — 2026-09-08):

```json
{
  "user": {
    "id": "...", "nickname": null, "email": null, "is_email_verified": false,
    "provider": "kakao", "tier": "light", "role": "user",
    "onboarding_completed": false, "onboarding_step": "topic"
  },
  "pending_consents": [
    { "consent_type": "age_confirmation", "version": null, "is_required": true }
  ]
}
```

- **`user`는 4.1(`POST /auth/social-login`) 응답의 `user` 객체와 필드 구성이 같다** — 로그인
  경로와 복원 경로가 같은 판정을 하도록 계약으로 못박는다(서버는 DTO 동형성 테스트로 고정).
- **`pending_consents`를 함께 내려준다**(티켓 요청 3의 전자 채택) — 이미 로그인된 세션으로
  앱을 다시 열 때 재동의 화면(A20) 진입 판정을 한 번의 왕복으로 끝낸다. 재동의가 필요 없으면
  빈 배열이다.

## 사유

- 계약이 없어 FE의 실행 관문(SplashGate)이 막혀 있었다(앱을 켤 때마다 재로그인). 서버 구현은
  2026-09-08 완료·검증됐고, 문서만 따라오면 FE가 착수한다.

## 완료 조건

- Given `auth-api.md` / When `GET /users/me`를 찾는다 / Then 요청·응답·401 규칙이 확정 계약으로 적혀 있고, `user`가 4.1과 같은 모양임이 명시돼 있다

## 처리 기록 (반영 날짜: 2026-09-08)

`auth-api.md`에 전부 반영했다 — 1장 범위(다섯으로 확장), 3장 표(13번 행), **4.13 신설**
(응답 형상·4.1 동형 명시·pending_consents 동봉·401 무재시도 규칙·관문 1단계 범위 밖 안내).
발행 당일 반영(BE 담당 "바로 반영" 지시 — 코드와 같은 PR #211).
