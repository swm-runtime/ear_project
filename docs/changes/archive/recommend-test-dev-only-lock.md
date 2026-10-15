# 추천 테스트 콘솔 잠금 기준 — "운영이면 꺼짐" → "개발 환경일 때만 켜짐"

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-13 |
| 발행자 | BE (박준현 — 2026-10-13 보안 점검 후속) |
| 반영 대상 | `features/admin.md` 4.7(추천 테스트 — "운영에서는 꺼진다" 항목) |
| 코드 반영 | PR #1489 `fix(be): open recommend test console only in development` (dev 머지됨) · `spec/api/admin-api.md` 4.17·에러 표는 BE 후속 PR에서 함께 고침 |
| 반영 날짜 | 2026-10-14 |

## 수정 내용

`features/admin.md` 4.7의 "**운영에서는 꺼진다.** `SENTRY_ENVIRONMENT=production`이면 이메일이 있어도 409"를 다음으로 바꾼다.

- **개발 환경에서만 켜진다.** 환경(`SENTRY_ENVIRONMENT`, 비어 있으면 `NODE_ENV`)이 `development`가 아니면 이메일이 있어도 409(`ADMIN_RECOMMEND_TEST_DISABLED`)다. 행동이 실제 `user_signals`·`library_items`·`play_records`·`content_stats`를 쓰기 때문이다.

## 사유

종전 규칙("`production`이면 꺼짐")은 운영 `SENTRY_ENVIRONMENT`가 비거나 오타면 운영에서 콘솔이 열린다(실패 시 열림). 테스트 계정은 실사용 계정일 수 있어(2026-10-13 개발계 라이브러리 초기화 사고) 실패 시 닫히는 쪽으로 바꿨다.

## 완료 조건

- Given `features/admin.md` 4.7 / When "운영에서는 꺼진다"를 찾는다 / Then "개발 환경에서만 켜진다"와 환경 판정(`SENTRY_ENVIRONMENT` → `NODE_ENV`)이 적혀 있다

## 처리 기록

- 2026-10-14 반영 — `features/admin.md` 4.7 — "운영에서는 꺼진다" → "개발 환경에서만 켜진다"(`SENTRY_ENVIRONMENT` → `NODE_ENV` 판정, 실패 시 닫힘 사유).
