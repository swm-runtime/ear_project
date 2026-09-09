# auth-api.md 4.2 — 가입 멱등 재요청은 첫 응답 재반환이 아니라 409로 (refresh 토큰 평문 보존 제거)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.2(`POST /auth/sign-up` 멱등 규칙) · `docs/backend/domain.md` 3.3 참조 정합 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 — `idempotency.interceptor.ts`의 TODO 주석으로만 존재하던 위반. 티켓 없이 방치돼 있었다 |
| 요청 파트 | 백엔드 |

## 왜 필요한가

멱등 인터셉터는 첫 응답 본문을 `idempotency_keys.response_body`에 저장해 같은 키 재요청에 그대로 돌려준다(`convention.md` 5.5 · architecture.md 8.4 — "저장된 첫 응답을 그대로 반환"). 그런데 **가입(4.2) 응답에는 `refresh_token` 원문이 들어 있어**, 그것이 24시간 동안 DB에 **평문**으로 남는다.

- `domain.md` 3.3: refresh 토큰은 해시로만 저장, 원문 저장 금지 — 위반
- `domain.md` 12.3: 탈퇴 시 즉시 파기 — 가입 키는 `anonymous` 스코프라 파기 대상에서도 빠짐
- 코드는 이 사실을 알고 있었다(`idempotency.interceptor.ts` 40~46행 TODO) — 계약 합의가 없어 못 고치고 있었다

## 수정 내용 (계약 개정)

4.2의 멱등 규칙을 다음으로 바꾼다:

> `Idempotency-Key`는 **중복 실행 차단**에만 쓴다. 같은 키의 재요청은 첫 응답을 재반환하지 않고
> **409 `DUPLICATE_REQUEST`** 로 응답한다. 클라이언트는 첫 응답을 받지 못한 경우(응답 유실)
> 재시도 대신 **로그인 경로(4.1)로 되돌아간다** — 계정은 이미 생성돼 있으므로 4.1이 `authenticated`로
> 새 토큰을 발급한다.

- 근거: 재반환 계약은 "본문 저장"을 전제하는데 가입 본문은 저장할 수 없는 값(토큰 원문)을 담는다. 두 요구가 충돌하면 보안 규칙(3.3)이 우선이다.
- 사용자 영향: 가입 응답 유실은 드물고, 그 경우에도 4.1 재호출로 즉시 복구된다(동의는 이미 저장됨 → `pending_consents` 없음). 화면 흐름 변화 없음.
- 다른 멱등 라우트(담기·탈퇴·이메일 발송 등)는 **변경 없음** — 본문에 토큰이 없다.

## 구현 (같은 PR)

- 인터셉터에 라우트 메타데이터(예: `@IdempotentWithoutReplay()`)를 두고, 그 라우트는 `response_body`를 저장하지 않으며 완료된 키의 재요청에 409 `DUPLICATE_REQUEST`를 돌려준다.
- `/auth/sign-up`에만 적용.

## 완료 조건

- Given `auth-api.md` 4.2 / When 멱등 규칙을 읽는다 / Then 재요청이 409이고 복구 경로가 4.1임이 적혀 있다
- Given 가입 성공 후 같은 키 재요청 / When 서버가 응답한다 / Then 409이고 `idempotency_keys.response_body`에 토큰이 없다
