# [FE] 실행 관문 인증 복원 — `GET /users/me`로 세션을 되살린다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/app/navigation/RootNavigator.tsx`(`TODO: SplashGate`) · `sessionService` |
| 요청 파트 | 백엔드 (서버 구현 완료 통지 — 2026-09-08) |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | `tickets/backend/pending/session-restore-endpoint.md` 서버 구현 완료 — 막고 있던 계약이 생겨 FE 몫을 발행한다 |
| 근거 문서 | `features/splash.md` 4(실행 관문) · `changes/pending/auth-api-get-users-me.md`(계약 확정 형상) · `features/auth.md` 7(재동의·A20) |
| 심각도 | **높음** — 앱을 껐다 켤 때마다 로그인 화면으로 간다. 서버는 준비됐고 이 티켓만 남았다 |
| 상태 | 대기 |
| 연관 | `tickets/backend/pending/session-restore-endpoint.md` (서버 몫 — 계약 문서 반영 대기) |

## 배경 — 서버가 준비된 것

`GET /users/me`가 구현·배포 대기 중이다(PR #211). 응답:

```json
{
  "user": { /* POST /auth/social-login(4.1)의 user와 동형 — onboarding_completed 포함 */ },
  "pending_consents": [ /* 재동의 필요 항목. 없으면 [] */ ]
}
```

- 만료·폐기 토큰이면 **401이고 재시도를 유도하지 않는다** — 시작 화면으로 보낸다.
- `pending_consents`가 함께 오므로 **관문 판정이 한 번의 왕복으로 끝난다.**

## 요청 내용

1. **앱 시작 시 인증 복원 흐름을 구현한다** (`splash.md` 4의 2단계):
   토큰 없음 → 시작 화면 / 있음 → `sessionService.getAccessToken()`(필요 시 갱신) →
   `GET /users/me` → 세션 복원 → 관문 분기.
2. **관문 분기** — `user.onboarding_completed`·`onboarding_step`으로 3단계(온보딩) 판정,
   `pending_consents`가 비어 있지 않으면 재동의 화면(A20)으로 보낸다.
3. **토큰 갱신에 single-flight(동시성 잠금)를 넣는다.** 2026-09-08 실서버에서
   `refresh token reuse detected`(전 세션 무효화)가 실측됐다 — 갱신 요청이 동시에 두 번
   나가면 회전된 토큰의 재사용으로 판정돼 **강제 로그아웃**된다. 복원 흐름이 생기면 앱
   시작마다 갱신이 돌므로 이 잠금이 없으면 이 사고가 규칙적으로 난다. 갱신 실패 시 새
   토큰 저장 전 종료 대비(저장 완료 후 폐기 확정 순서)도 함께 점검한다.
4. **버전 체크·점검 안내(관문 1단계)는 범위 밖** — `GET /users/me/settings`가 별도로 준다.

## 완료 조건

- Given 로그인된 상태로 앱을 완전히 종료했다 / When 다시 실행한다 / Then 로그인 화면 없이 이전 상태(라이브러리 또는 진행 중 온보딩 단계)로 들어간다
- Given 온보딩 미완 사용자 / When 앱을 다시 실행한다 / Then `onboarding_step`에 맞는 온보딩 화면으로 간다
- Given 재동의가 필요한 사용자 / When 앱을 다시 실행한다 / Then 재동의 화면(A20)을 만난다
- Given refresh 토큰까지 만료된 상태 / When 앱을 실행한다 / Then 재시도 없이 시작 화면으로 간다
- Given 401 응답 두 곳에서 동시 발생 등 갱신 트리거가 겹친다 / When 토큰 갱신이 일어난다 / Then 갱신 요청은 한 번만 나간다(서버 로그에 `reuse detected`가 찍히지 않는다)
