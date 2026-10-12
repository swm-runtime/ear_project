# [문서] 한 계정에 살아 있는 Play 구독은 하나 — 두 번째 구독 거부

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/subscription-api.md` 4.4 · 4.7 · 5장 · 7장 / `docs/features/common-error-handling.md` 9.10-3 / `docs/features/subscription.md` 7장 / `docs/features/backend-monitoring.md` 3-6 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-07 |
| 반영 날짜 | 2026-10-07 (같은 날 반영 — 문서를 먼저 고치고 코드를 맞췄다) |
| 발견 시점 | 2026-10-07 백엔드 검증 하 7번 → KAN-130 4번 |
| 심각도 | 중(Android 출시 전 필수) |

## 문제

Apple은 구독 그룹이 "하나만"을 보장하지만 **Google은 Pro·Daily가 독립 정기 결제라 한 계정이 둘 다 살 수 있다.** 정상 경로(앱의 교체 모드 → `linkedPurchaseToken` → 같은 행)는 구현돼 있었지만, 앱이 교체 없이 새로 사 버린 경우를 서버가 거부하는 규칙이 없어 두 행이 생기고 사용자는 이중 결제가 된다.

## 수정 내용

- 4.4: 요청자에게 같은 스토어의 살아 있는 구독 행이 있고 새 구매가 그 행에 이어지지 않으면(`original_transaction_id` 다름) 두 번째 구독 — 제출은 `SUBSCRIPTION_ALREADY_SUBSCRIBED`(409, 신설)로 거부하고 **확인(acknowledge)하지 않는다**(Google이 3일 안에 자동 환불). 복원은 거부하지 않는다.
- 4.7: 같은 조건의 알림은 반영도 확인도 하지 않는다(처리 완료는 기록 — 재전송돼도 같은 판정).
- 5장·9.10-3: 에러 코드 신설. 3-6: Slack 알림 행 추가.

## 완료 조건

- Given 살아 있는 Play 구독(Pro)이 있는 계정 / When 교체 없이 Daily 구매 토큰을 제출한다 / Then 409 `SUBSCRIPTION_ALREADY_SUBSCRIBED`, 구매는 확인되지 않고, Slack 결제 알림에 한 줄, 기존 Pro 행 그대로
- Given 같은 조건 / When 그 구매의 RTDN이 온다 / Then 행이 생기지 않고 확인되지 않는다
- Given 같은 계정 / When 교체로 산 Daily 토큰(`linkedPurchaseToken` = Pro 토큰)을 제출한다 / Then 같은 행이 Daily로 바뀐다

## 처리 기록

- 2026-10-07 발행·반영. 코드 `billing/services/play-purchase.service.ts` · `billing-sync.service.ts`(`findOtherLiveSubscription`) · `billing-alert.service.ts` · `error-code.enum.ts` · `billing.exception.ts`. 테스트 추가. 후속(KAN-130): 자동 환불을 기다리는 대신 `orders.refund`(revoke)로 즉시 환불하는 것은 Google 실응답 검증 뒤 검토.
