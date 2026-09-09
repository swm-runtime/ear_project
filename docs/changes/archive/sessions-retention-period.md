# domain.md 12.1 — sessions 보존 기한 정의 (무한 성장 방지)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 12.1 (삭제·보존 정책) |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 — `sessions`가 refresh 회전마다 새 행을 만드는데 삭제 경로·보존 기한이 없어 무한 성장한다 |
| 요청 파트 | 백엔드 |

## 왜 필요한가

`domain.md` 12.1은 `sessions`를 **soft(`revoked_at`) · "폐기 이력"** 으로 지정했으나 **보존 기한을 정의하지 않았다.** 코드는 로그인·refresh 회전마다 새 행을 삽입하고(`auth.service.ts` `issueSession`) 폐기는 `revoked_at` 마킹뿐이라(`session.repository.ts` — delete 계열 메서드 없음), 활성 기기당 access TTL(30분) 주기로 하루 수십 행씩 영구 누적된다. `findByRefreshTokenHash`가 이 테이블을 매 갱신마다 조회하므로 성장은 조회 비용으로도 돌아온다.

**규칙상 코드가 임의로 지울 수 없다** — 문서에 보존 기한이 없으면 정리 배치를 만들 근거가 없다. 그래서 기한을 먼저 정의한다.

## 수정 내용 (제안)

12.1 표의 `sessions` 행에 보존 기한을 명시한다.

| 테이블 | 정책 | 근거 |
|---|---|---|
| `sessions` | soft(`revoked_at`), **만료(`expires_at`) 또는 폐기(`revoked_at`) 후 30일 경과 시 hard delete 배치** | 폐기 이력이 필요한 것은 refresh 재사용 탐지 창(refresh TTL 30일 — architecture.md 9.1) 동안뿐이다. 그 창을 넘긴 행은 탐지에도 안 쓰이고 조회 비용만 남긴다 |

**"30일"의 근거**: refresh 토큰 수명이 30일(architecture.md 9.1)이라, 만료·폐기된 토큰이 재사용 공격에 쓰일 수 있는 상한이 그 시점이다. 그 이후의 폐기 이력은 보안상 의미가 없다. 활성 세션(`revoked_at IS NULL` 이고 `expires_at > now`)은 대상이 아니다.

## 구현 (기한 승인 후, 같은 PR에서)

`idempotency-purge.scheduler.ts`와 동형의 `@Interval` 스케줄러:
`DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days') OR (expires_at < now() - interval '30 days')`.
`idx_sessions_refresh_token_hash` 외에 `expires_at`·`revoked_at` 조회를 위한 인덱스 필요 여부는 구현 시 실측(테이블 크기 작을 땐 seq scan으로 충분).

## 완료 조건

- Given `domain.md` 12.1 / When `sessions` 행을 읽는다 / Then 보존 기한(만료·폐기 후 30일)과 그 근거가 적혀 있다
- Given 기한 승인 후 배치 구현 / When 스케줄러가 돈다 / Then 30일 지난 폐기·만료 세션만 삭제되고 활성 세션은 남는다

## 처리 기록 (반영 날짜: 2026-09-09)

`domain.md` 12.1 `sessions` 행에 보존 기한(만료·폐기 후 30일 hard delete)과 근거를 반영했다. 배치는
#281(`SessionPurgeScheduler`, 1시간 간격 `deleteInactiveBefore`)로 같은 날 dev 배포됐다 — 로컬 DB에서
활성·최근 3행 보존, 30일 지난 폐기·만료 2행 삭제를 확인했다. 인덱스는 테이블이 작아 seq scan으로 두었다.
