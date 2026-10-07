# [문서] Sentry 중계는 서명 헤더로 검증 · Play 환불 고정은 주문 ID로 판정

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/backend-monitoring.md` 3-2 / `docs/infra/runbook.md` 4장 · `inventory.md` / `docs/spec/api/subscription-api.md` 4.7 / `docs/backend/domain.md` 8.2 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-07 |
| 반영 날짜 | 2026-10-07 (같은 날 반영 — 문서를 먼저 고치고 코드를 맞췄다) |
| 발견 시점 | 2026-10-07 백엔드 검증(2026-10-06 검증 이후 추가분) — 중 1·2번 |
| 심각도 | 중 |

## 문제

1. **Sentry → Slack 중계의 유일한 인증(URL 경로 토큰)이 로그에 남는다.** 요청마다 API 요청 로그(`request completed`의 `path`)와 Caddy 접근 로그에 경로가 그대로 찍혀, 로그를 볼 수 있는 사람이면 Slack 에 가짜 Sentry 알림을 올릴 수 있다. 문서(3-2)는 "서명 헤더가 없는 연동"이라 적었지만, 실제로 쓰는 Internal Integration 웹훅은 `Sentry-Hook-Signature`(본문의 HMAC-SHA256, 키 = Client Secret)를 보낸다(Sentry 공식 문서 "Webhooks" — Integration Platform).
2. **Play 환불 고정의 되살림 조건이 유예 중 환불 뒤 재청구 성공을 막는다.** 4.7은 "`ACTIVE`이고 만료 시각이 환불 당시보다 뒤로 간 경우"만 되살렸는데, 유예 중에는 만료 시각이 유예 종료일로 밀려 저장돼 있어 재청구 성공 뒤의 새 만료(원 만료 + 1주기)가 그보다 뒤가 아닐 수 있다(유예 길이 ≈ 결제 주기, 예: 월간 + 30일 유예). 돈이 들어왔는데 다음 갱신까지 무료다.

## 수정 내용

1. 중계 인증을 **Client Secret 서명 검증**으로 바꾼다(`SENTRY_WEBHOOK_SECRET`). 종전 경로 토큰(`SENTRY_WEBHOOK_TOKEN`)도 계속 받되(주소 교체 기간), 서버 로그에서는 경로의 토큰 부분을 `[redacted]`로 가린다. 토큰 없는 주소 `POST /webhooks/sentry` 를 추가한다.
2. Play 환불 고정의 결제 주기 식별을 **주문 ID**(`subscriptions.latest_order_id` ← Google `latestOrderId`)로 바꾼다. Google 은 갱신·재청구 성공마다 새 주문 ID를 발급하므로 "같은 토큰·같은 주문"만 환불로 고정하고, 주문이 바뀌면 되살린다. 주문 ID를 모르는 행(개정 전 기록)은 종전 규칙으로 판정한다.

## 완료 조건

- Given `SENTRY_WEBHOOK_SECRET`이 있다 / When 본문의 HMAC-SHA256 이 `Sentry-Hook-Signature`와 같은 요청이 `POST /webhooks/sentry` 로 온다 / Then 받아서 Slack 으로 흘린다. 서명이 다르면 404
- Given 토큰 방식만 설정돼 있다 / When 종전 주소로 Sentry 가 부른다 / Then 그대로 받는다
- Given 요청 로그 / When `/webhooks/sentry/<토큰>` 요청이 기록된다 / Then 토큰 자리가 `[redacted]`다
- Given 유예 중 환불 통지로 `refunded`가 된 Play 구독 / When 같은 토큰·새 주문 ID의 `ACTIVE`가 조회된다(만료 시각이 저장값보다 뒤가 아니어도) / Then 되살아난다
- Given `refunded` Play 구독 / When 같은 토큰·같은 주문 ID의 `ACTIVE`가 조회된다 / Then 그대로 `refunded`다

## 처리 기록

- 2026-10-07 발행·반영. 코드: `alert/sentry-webhook.*`(서명 검증·토큰 없는 경로) · `common/utils/redact-url.util.ts`(경로 토큰 마스킹) · `main.ts`(원문 본문 보존) · `subscription/policies/store-state.policy.ts` · `billing/play-store/*`(주문 ID 전달) · `subscriptions.latest_order_id` 마이그레이션(`AddSubscriptionLatestOrderId`). 테스트 추가.
