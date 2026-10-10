# 인증 갱신 — 로그아웃으로 폐기된 refresh token 은 REUSED 가 아니라 INVALID

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/auth-api.md` 4.3 `POST /auth/token/refresh` 에러 표 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-10 |
| 시작 날짜 | 2026-10-10 |
| 기한 | 2026-10-17 (Low — 다음 주 안) |
| 선행 | 없음 — 코드는 PR 로 먼저 반영(KAN-167), 통합 시 계약 문서에 옮겨 적는 요청 |
| 중요도 | Low — 에러 코드·HTTP 상태는 기존 것 그대로이고, 어느 상황에 어느 코드가 나가는지의 서술만 정밀해진다 |
| 관련 | 티켓 `tickets/backend/archive/auth-logout-session-refresh-not-reuse.md` (KAN-167) |

## 배경

갱신은 폐기된 세션의 토큰이 오면 사유를 묻지 않고 `AUTH_REFRESH_TOKEN_REUSED`(사용자 세션 전체 무효화)로 판정했다. 로그아웃도 세션을 폐기하므로, 로그아웃 204 직후 앱이 로컬 토큰을 지우기 전에 단일 인플라이트 자동 갱신(`common-error-handling.md` 4.1)이 방금 폐기된 토큰을 보내면 **다른 기기까지 로그아웃**됐다.

계약(4.3)은 이미 "이미 **회전된** 토큰의 재사용"만 REUSED 라고 적고 있어 코드가 계약을 넘어선 것이었다. 백엔드는 `sessions.revoked_reason`(domain.md 3.3)을 추가해 회전된 토큰만 REUSED 로 판정하도록 고쳤다.

## 바뀐 것 (코드 반영 완료)

- 로그아웃으로 폐기된 토큰의 재제출 → **`AUTH_REFRESH_TOKEN_INVALID`(401)**, 다른 세션은 그대로.
- 재사용 감지로 함께 끊긴 세션의 토큰 재제출 → `AUTH_REFRESH_TOKEN_INVALID`(401). 이미 전부 끊긴 상태라 다시 끊을 것이 없다.
- 회전된 토큰의 재제출 → 종전대로 `AUTH_REFRESH_TOKEN_REUSED` + 사용자 세션 전체 무효화.
- 클라이언트 동작 변화 없음 — 두 코드 모두 401 이고 갱신 실패는 시작 화면으로 보낸다(4.3 마지막 줄).

## 문서에 옮겨 적을 것

`auth-api.md` 4.3 에러 표:

| 코드 | HTTP | 상황 |
| --- | --- | --- |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | 만료·폐기·존재하지 않음. **로그아웃으로 폐기된 토큰도 여기다** — 다른 세션은 건드리지 않는다 |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | 이미 회전된 토큰의 재사용 → **해당 사용자 세션 전체 무효화** |

## 완료 조건

- Given 문서 반영 후 `auth-api.md` 4.3, When 에러 표를 읽으면, Then `AUTH_REFRESH_TOKEN_INVALID` 상황에 "로그아웃으로 폐기된 토큰(다른 세션은 유지)"이 적혀 있고, `AUTH_REFRESH_TOKEN_REUSED`는 "이미 회전된 토큰"으로만 한정돼 있다
