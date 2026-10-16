# [FE] iOS — 환불·취소된 거래를 구매로 서버에 다시 제출하지 않기

| 항목 | 값 |
|---|---|
| 대상 | `features/subscription/services/purchase.service.ts` `handlePurchaseUpdated`·`recoverUnfinished` · `services/iap-adapter.ts` `toStorePurchase`(취소 여부 전달) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-223](https://runtime364.atlassian.net/browse/KAN-223) |
| 발행 날짜 | 2026-10-16 |
| 시작 날짜 | 2026-10-16 |
| 기한 | 2026-10-19 (Medium) |
| 선행 | 없음 |
| 근거 문서 | `features/subscription.md`(구매 제출·회복) · `spec/api/subscription-api.md` 4.4 |
| 중요도 | Medium |
| 상태 | 대기 |

## 배경

2026-10-16 14:10 KST에 운영 Slack에 "결제 검증 거부 · App Store · `not_valid_now`" 알림이 왔다. 운영 로그와 DB로 확인한 경과는 다음과 같다.

1. 10-15 10:07 — 팀 관리자 계정이 정식 스토어 앱에서 daily → pro 변경을 시험했다. 결제 환경은 Production이었다.
2. 10-16 08:16 — Apple이 pro 거래를 전액 환불했다. 서버는 REFUND 알림을 받아 구독을 `refunded`로 바꿨다. 정상이다.
3. 10-16 14:10:36 — 그 기기에서 환불 뒤 처음 앱을 열었다(`users/me`·기기 등록).
4. **1초 뒤 14:10:37** — 앱이 **환불된 거래**를 `POST /users/me/subscription/purchases`로 제출했다. 서버는 취소된 거래라 400 `SUBSCRIPTION_RECEIPT_INVALID`(`not_valid_now`)로 거절했다. 이것도 의도된 동작이다.

원인은 앱의 동작이다. StoreKit은 앱이 열리면 거래가 취소됐다는 업데이트를 알려 준다. `purchase.service.ts`의 `handlePurchaseUpdated`는 이 업데이트를 결제 중이 아닐 때의 "회복"으로 보고 그대로 제출한다.

- 400을 받으면 거래를 끝내지 않는다(`doSubmit` — "400·409 거래를 끝내지 않는다"). 그래서 같은 거래가 다음에 또 제출될 수 있다.
- 사용자에게 보이는 화면은 없다. 결제 중이 아니면 실패를 알리지 않기 때문이다.
- 대신 운영 결제 거부 알림이 울린다. 진짜 결제 문제와 구분되지 않아 알림을 믿기 어렵게 된다.

## 요청 내용

1. **취소된 거래는 서버에 제출하지 않는다.** 스토어가 알려 온 거래가 환불·취소(StoreKit 2 `revocationDate`가 있음)이거나 이미 만료된 것이면 `submit`을 건너뛴다.
   - 권한 판정은 서버가 한다. 서버는 Apple 서버 알림(REFUND 등)으로 이미 구독을 반영했다.
   - 앱이 할 일은 구독 상태를 다시 읽어(`GET` 구독) 화면을 맞추는 것뿐이다. 앱이 직접 권한을 판정하지 않는다.
2. **그 거래는 끝낸다(`finishTransaction`).** 취소된 거래를 끝내지 않으면 미완료 큐에 남아 실행할 때마다 다시 올라온다.
   - "서버 200 뒤에만 끝낸다"는 규칙은 **구매로 반영할 거래**에 대한 것이다. 반영할 수 없는 취소 거래에는 해당하지 않는다.
   - 예외로 두는 이유를 주석과 `features/subscription.md`(또는 FE architecture)에 남긴다.
3. 판정에 쓸 값(취소 시각·만료 시각)을 `iap-adapter.ts`의 `toStorePurchase`가 `StorePurchase`에 실어 준다. 라이브러리(react-native-iap)가 iOS 거래에서 주는 필드를 확인해서 쓴다.

## 범위 밖

- 서버 변경은 없다. 서버의 400 거절은 맞는 동작이다.
- Android는 이번 대상이 아니다. Play는 구매 토큰을 서버가 Google에 물어 판정한다(4.7). 같은 증상이 보이면 따로 본다.

## 완료 조건

- Given 환불된 iOS 구독 거래가 있는 기기 / When 앱을 연다 / Then `POST /users/me/subscription/purchases`가 나가지 않고, 운영 결제 거부 알림이 울리지 않는다
- Given 같은 기기 / When 앱을 두 번째로 연다 / Then 그 거래가 다시 올라오지 않는다(끝낸 거래)
- Given 정상 결제·결제 직후 앱 종료 뒤 회복 / When 앱을 연다 / Then 종전대로 제출되고 200 뒤에 끝낸다(회귀 없음)
- Given 취소된 거래를 건너뛴 직후 / Then 구독 화면이 서버 상태(환불 → 무료)와 같다

## 처리 기록

- 2026-10-16 발행(마크다운 + Jira). 운영 로그 근거: 14:10:37 `store receipt rejected` `reason: not_valid_now`(10-15 이후 이 1건).
