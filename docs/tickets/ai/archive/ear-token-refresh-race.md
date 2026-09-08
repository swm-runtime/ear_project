# [AI/웹] 어드민 콘솔 토큰 갱신 경합 — 서버 재사용 탐지를 울려 ERROR 알림이 반복된다

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/web/lib/ear.ts` (제품 API 클라이언트의 401 복구 경로) |
| 요청 파트 | 백엔드 (실서버 ERROR 알림 조사에서 발견) |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | Slack ERROR 알림 반복(`refresh token reuse detected` ×2, 07:55:53) — 실서버 로그 복원으로 발원지를 어드민 콘솔로 특정 |
| 근거 문서 | `backend/architecture.md` 9.1(refresh 회전·재사용 시 전 세션 무효화) · `spec/api/auth-api.md` 4.12(pipeline SSO) |
| 심각도 | **중** — 사용자 피해는 없다(3초 뒤 SSO 자동 재접속으로 자가 복구). 다만 발생할 때마다 관리자 세션 전체가 무효화되고 ERROR 알림이 울려, 진짜 탈취 신호를 소음에 묻는다 |
| 상태 | 반영 완료 (2026-09-08 — 발행과 같은 PR에서 수정) |

## 문제 — 실서버 로그 복원 (2026-09-08 07:55:53)

```
GET /admin/contents?offset=0&limit=20             → 401 (액세스 토큰 만료)
GET /admin/contents?offset=0&limit=50&status=...  → 401 (동시에 만료)
POST /auth/token/refresh                          → 401 AUTH_REFRESH_TOKEN_REUSED
POST /auth/token/refresh                          → 401 AUTH_REFRESH_TOKEN_REUSED
(+3초) POST /auth/pipeline-login                  → 200 — SSO 자동 재접속, 자가 복구
```

`earFetch`가 401을 만나면 **각 호출이 독자적으로** refresh를 불렀다. 발행 화면처럼 목록
조회가 동시에 나가는 곳에서는 같은 refresh 토큰이 겹쳐 제출되고, 서버는 회전(rotation)
규칙대로 두 번째 제출을 **탈취 의심으로 판정해 그 관리자 계정의 전 세션을 무효화**한다
(`architecture.md` 9.1 — 의도된 보안 동작이다. 서버는 잘못이 없다).

콘솔은 페이지의 SSO 자동 연결로 3초 만에 복구되므로 **화면에서는 아무 문제도 보이지 않는다**
— "누가 뭘 하는지 모르겠는데 ERROR가 계속 뜨는" 상태의 정체다. 어드민 콘솔을 열 때마다
액세스 토큰(30분)이 만료돼 있으면 확률적으로 재발한다.

## 수정 — refresh를 버리고 SSO 재교환으로 통일 + single-flight

401 복구를 `POST /auth/token/refresh`(회전 있음) 대신 **`/api/ear/sso` 재교환**(회전 없음 —
서버 상태가 없어 몇 번을 겹쳐 불러도 안전)으로 바꾸고, 동시 401은 **재교환 1회를 공유**한다
(single-flight). 이 클라이언트에서 재사용 탐지가 울릴 경로 자체가 사라진다 — 탭을 여러 개
열어도 마찬가지다.

- refresh가 아깝지 않은 이유: 이 콘솔은 Supabase 로그인이 전제라 SSO 교환이 사용자 입력
  없이 끝나고, 호출 빈도도 액세스 토큰 만료(30분) 주기다.
- 서버(`/auth/pipeline-login`)는 무변경 — 세션 행이 재교환마다 하나씩 생기지만 기존
  무효화 행과 같은 수준의 누적이다.

## 완료 조건

- Given 어드민 콘솔을 열어둔 채 액세스 토큰이 만료됐다 / When 발행 화면이 목록 조회를 동시에 여러 개 보낸다 / Then 서버 로그에 `refresh token reuse detected`가 찍히지 않고 화면은 정상 동작한다
- Given 같은 상황 / When 복구가 일어난다 / Then `/auth/pipeline-login` 호출은 1회다(single-flight)
- Given Supabase 세션까지 끊긴 상태 / When 401 복구가 실패한다 / Then 종전과 같이 연결 필요 안내(EarAuthError)로 떨어진다(회귀 없음)

## 처리 기록 (반영 날짜: 2026-09-08 — 발행 당일)

`ear.ts`의 `tryRefresh`를 제거하고 `reconnectEar`(SSO 재교환 + single-flight)로 교체했다.
웹 tsc·production build 통과. **같은 계열의 앱(RN) 쪽 수정은 별건이다** —
`tickets/frontend/pending/splash-gate-session-restore.md` 요청 3(갱신 single-flight)이 다룬다.
