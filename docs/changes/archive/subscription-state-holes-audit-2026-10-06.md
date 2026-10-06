# [문서] 구독 상태 전이의 구멍 5건 — 유예 종료·끝난 구독의 재결제·보정 상한·연결 시 상태 확인·Play 환불 고정

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/subscription-api.md` 4.2 · 4.4 · 4.6 · 4.7 · 7장 / `docs/features/subscription.md` 4.3 · 7장 / `docs/backend/domain.md` 8.2 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-06 |
| 반영 날짜 | 2026-10-06 (같은 날 반영 — 문서를 먼저 고치고 코드를 맞췄다) |
| 발견 시점 | 2026-10-06 백엔드 검증(2026-10-02 감사 이후 추가분) — 감사 1~5번 |
| 심각도 | 상 1건(유예 종료가 반영되지 않는다 — iOS 운영 중) · 중 4건 |

## 문제

구독 문서가 정한 규칙 그대로 구현했을 때 **결제하지 않은 사용자가 유료로 남거나, 결제한 사용자가 막히는** 경우가 다섯 있었다.

1. **유예가 끝나도 유료로 남는다(상).** 7장의 "지난 결제 주기에 대한 환불·만료 알림은 지금 주기를 건드리지 않는다"는 알림의 거래 만료일을 저장된 `expires_at`과 비교한다. 그런데 유예에 들어갈 때 `expires_at`을 유예 종료일로 밀어 두므로(4.6), 유예 중인 구독의 **모든** 알림이 "앞선 주기"로 버려진다 — 유예 종료(`GRACE_PERIOD_EXPIRED`)·만료·환불 전부.
2. **끝난 구독을 다른 계정이 다시 결제하면 409이고, 예전 계정이 유료가 된다.** 7장의 주인 확인은 행의 상태를 보지 않는다. 같은 Apple 계정이 같은 구독 그룹을 다시 결제하면 예전 `originalTransactionId`가 이어질 수 있어, 방금 결제한 계정은 거부되고 서버 알림은 결제하지 않은 예전 계정의 행에 반영된다.
3. **스토어에 확인할 수 없는 구독은 영영 유료다.** 4.2의 만료 보정은 "추측으로 강등하지 않는다"만 있고 상한이 없다. 조회 키 미구성·받지 않게 된 환경(Sandbox)·스토어가 모르는 구독은 매번 "그대로 둔다"가 되고, 배치(100건)의 앞자리를 계속 차지해 다른 행의 보정을 민다.
4. **행이 없던 동안의 환불·해지가 사라진다.** 4.4는 서명된 거래의 만료일만으로 유효성을 판정한다. 환불 → 탈퇴 → 재가입 뒤 환불 전에 받아 둔 서명 거래를 내면 구독 행이 없어(파기) 재제출 차단(`last_notified_at`)이 걸리지 않고 만료일까지 유료가 된다. 영수증 제출 전에 도착한 해지 알림(주인 모름)도 반영되지 않는다.
5. **Play의 환불이 다음 조회로 지워진다.** 4.7은 "마지막에 조회한 상태가 맞는 상태다"인데 Google의 구독 상태에는 환불이 보이지 않는다. `refunded`로 내린 뒤 같은 토큰의 다른 알림·복원·재제출이 오면 `active`로 돌아간다.

## 수정 내용

| # | 규칙 | 문서 |
|---|---|---|
| 1 | **유예 중에는 거래 만료일 비교를 하지 않는다.** 순서가 뒤바뀐 옛 알림은 서명 시각으로 거른다 | api 4.6 표 · 7장 / features 7장 |
| 2 | **끝난 구독의 재결제는 결제한 계정의 것이다** — 행이 `expired`·`refunded`이고 거래의 계정 토큰이 요청자의 결제 의도이며 반영이 구독을 되살릴 때 `user_id`를 넘긴다(제출·복원·알림 공통). 살아 있는 구독은 종전대로 409 | api 4.4-3 · 7장 / features 7장 / domain 8.2 |
| 3 | **만료 보정의 상한 7일** — 확인할 수 없는 채로 만료일이 7일을 넘기면 `expired`. `last_notified_at`은 건드리지 않아 늦은 갱신 알림·거래가 되살린다 | api 4.2 · 7장(API 키) / features 4.3 / domain 8.2 |
| 4 | **iOS — 처음 연결하는 구독은 Apple에 지금 상태를 묻는다.** 끝났다고 답하면 제출은 `SUBSCRIPTION_RECEIPT_INVALID`·복원은 무시, 유효·유예면 조회한 상태로 반영. 물을 수 없으면 결제를 막지 않고 종전대로 | api 4.4-4 · 7장(API 키) / features 7장 |
| 5 | **Play — 환불의 고정.** `refunded`인 행은 같은 구매 토큰·같은 결제 주기의 조회 결과로 되살리지 않는다. 새 토큰이거나 만료 시각이 뒤로 간 `ACTIVE`만 되살린다 | api 4.7 / features 7장 / domain 8.2 |

함께 고친 문구: `features/subscription.md` 7장 "탈퇴 후 재가입" — 종전 "`archived_subscriptions`의 ID로 영수증을 검증"은 4.6·api 7장("거래 ID만으로 복원하지 않는다")과 어긋났다. "지금 제출한 서명된 거래"로 정정.

## 근거 — 스토어 공식 문서(2026-10-06 조회)

- **1번** — Apple `expiresDate`: "a static value that applies for each transaction". 유예 종료 시각은 갱신 정보의 `gracePeriodExpiresDate`로 따로 온다. `GRACE_PERIOD_EXPIRED`: "the billing grace period has ended without renewing the subscription, so you can turn off access" (App Store Server Notifications `notificationType`)
- **2번** — `originalTransactionId`가 만료 뒤 재구독에서 유지되는지는 **공식 레퍼런스에 명시가 없다**(Apple 직원의 포럼 답변: 같은 구독 그룹이면 유지, 다만 "평생 불변을 가정하지 말라"). 유지되든 바뀌든 맞는 규칙으로 썼다 — 바뀌면 새 행이 생겨 이 예외를 타지 않는다
- **3번** — 알림 재전송: "it retries five times, at 1, 12, 24, 48, and 72 hours after the previous attempt"(운영만. 샌드박스는 1회) → 합 약 6.5일
- **4번** — Get All Subscription Statuses의 `status`: 1 활성 · 2 만료 · 3 결제 재시도 · 4 유예 · 5 회수("The App Store refunded the transaction or revoked it from Family Sharing"). 한도는 운영 초당 50회
- **5번** — Google: 회수된 구독은 조회하면 `SUBSCRIPTION_STATE_EXPIRED`로 보인다(환불이 상태에 드러나지 않는다). "Voided Purchases API: Revoke access to voided orders". **확인하지 못한 것**: 회수 없이 환불만 한 경우 `voidedPurchaseNotification`이 오는지, 그때의 `subscriptionState` — 그래서 "그 뒤에 갱신 결제가 되면 되살린다"를 두어, 구독이 이어지는데 영영 막히는 경우를 없앴다. Android는 아직 운영 전이라 실결제 응답으로 한 번 더 확인해야 한다

## 완료 조건

- Given 유예 중인 구독 / When 유예 종료·만료·환불 알림이 온다(거래 만료일 < 유예 종료일) / Then `expired`·`refunded`로 내려가고 `users.tier = light`다
- Given 유예 중인 구독 / When 재청구 성공 알림(`DID_RENEW`)이 온다 / Then `active`로 돌아온다
- Given 다른 계정의 끝난 구독 / When 요청자가 자기 결제 의도로 결제한 거래를 제출하거나 그 알림이 먼저 온다 / Then 행이 요청자에게 넘어가고 요청자가 유료다(예전 계정은 무료 그대로)
- Given 다른 계정의 끝난 구독 / When 계정 토큰이 없거나 예전 계정의 의도인 거래를 제출한다 / Then `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT`
- Given 스토어에 확인할 수 없는 비종결 구독 / When 만료일이 7일을 넘긴 뒤 조회·배치가 돈다 / Then `expired`로 내려가고 `last_notified_at`은 그대로다
- Given 상한으로 내려간 구독 / When 다음 주기의 거래·갱신 알림이 온다 / Then 되살아난다
- Given 구독 행이 없는 계정 / When Apple이 환불·만료라 답하는 구독의 서명 거래를 제출한다 / Then `SUBSCRIPTION_RECEIPT_INVALID`(복원은 "복원할 구독 없음")
- Given 구독 행이 없는 계정 / When Apple이 유효(자동 갱신 꺼짐)라 답하는 거래를 제출한다 / Then 해지 예약 상태로 연결된다
- Given Apple에 물을 수 없다(키 미구성·조회 실패) / When 유효한 거래를 제출한다 / Then 종전대로 연결된다
- Given Apple의 답이 제출된 거래보다 옛것이다(방금 한 재구독을 아직 모른다) / When 그 거래를 제출한다 / Then 거절하지 않고 거래로 연결한다
- Given 환불 통지로 `refunded`가 된 Play 구독 / When 같은 토큰의 다른 알림·재제출·복원이 온다 / Then `refunded` 그대로다(제출은 `SUBSCRIPTION_RECEIPT_INVALID`)
- Given 환불로 끝난 Play 구독 / When 새 구매 토큰이 오거나 같은 토큰의 만료 시각이 뒤로 간 `ACTIVE`가 조회된다 / Then 되살아난다

## 처리 기록

- 2026-10-06 발행·반영. 문서 3종 개정, 코드 `subscription/policies/store-state.policy.ts` · `billing/services/billing-sync.service.ts` · `billing/services/subscription-reconcile.service.ts` · `billing/services/play-purchase.service.ts` · `billing/billing.orchestrator.ts` · `subscription/subscription.constant.ts`(`RECONCILE_FORCE_EXPIRE_MS`) 수정, 단위 테스트 48건 추가(완료 조건 전부 테스트로 확인).
- **운영에서 따로 확인할 것**: ① App Store Connect의 Billing Grace Period 설정 여부(켜져 있어야 1번이 실제로 발생한다) ② 운영 서버의 App Store Server API 키(`APP_STORE_ISSUER_ID`·`KEY_ID`·`PRIVATE_KEY_BASE64`) 구성 여부 — 비어 있으면 3번의 상한만 동작하고 4번은 꺼진다.
