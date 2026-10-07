# [FE] Android 요금제 변경 — 교체(이전 구매 토큰 전달)로 처리, 두 번째 구독 생성 금지

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/subscription/services/iap-adapter.ts`(Android 결제 요청) · `purchase.service.ts`(교체 입력·에러 문구) · `subscription.copy.ts` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| Jira | [KAN-158](https://runtime364.atlassian.net/browse/KAN-158) |
| 발행 날짜 | 2026-10-08 |
| 시작 날짜 | 2026-10-08 |
| 기한 | 2026-10-11 (Medium — 3일 안) |
| 선행 | 없음 — 개발계 Android 상품·서버·RTDN은 2026-10-07 준비 완료, rt 32 개발계 빌드(KAN-155)로 재현됨 |
| 관련 | `subscription-purchase-screen.md`([KAN-120](https://runtime364.atlassian.net/browse/KAN-120)) · 백엔드 `tickets/backend/archive/android-play-subscription-products.md`([KAN-130](https://runtime364.atlassian.net/browse/KAN-130) — 서버 쪽 "살아 있는 Play 구독은 하나" 가드) |
| 근거 문서 | `features/subscription.md` 4.4 · `spec/api/subscription-api.md` 4.4(한 계정에 살아 있는 Play 구독은 하나)·5장(`SUBSCRIPTION_ALREADY_SUBSCRIBED`) |
| 중요도 | Medium |
| 상태 | 대기 |

## 현상 (2026-10-08 00:39 KST, 개발계 Android rt 32)

Pro를 결제한 뒤 요금제 관리에서 **Daily로 변경**을 누르면 Google 결제 시트는 정상 완료되지만 앱은 **"결제 실패"** 를 띄운다. 개발계 서버 로그:

```
WARN [PlayPurchaseService] duplicate play subscription rejected  existing_subscription_id: e1901f59-…
LOG  [PlayStoreWebhookService] play store notification handled   reason: 'duplicate_subscription'
```

## 원인

Android는 Pro·Daily가 **독립된 정기 결제**라 Google은 둘 다 살 수 있게 둔다(iOS는 구독 그룹이 교체를 자동으로 한다). 요금제를 바꿀 때 앱이 **이전 구매의 토큰을 넘겨 교체**해야 Google이 새 구매에 `linkedPurchaseToken`을 붙이고, 서버가 그 값으로 같은 구독 행에 이어 붙인다.

현재 Android 결제 요청(`iap-adapter.ts` `requestSubscription`)은 `skus` + `obfuscatedAccountId`만 넘긴다 → Google이 Pro를 그대로 둔 채 **Daily를 두 번째 구독으로 생성** → 서버는 설계대로(`subscription-api.md` 4.4, KAN-130) 409 `SUBSCRIPTION_ALREADY_SUBSCRIBED`로 거부하고 확인(acknowledge)하지 않는다(확인되지 않은 구매는 Google이 3일 안에 자동 환불). 앱은 이 에러 코드를 모르기 때문에 기본 문구 "결제 실패"로 떨어진다.

**서버는 바꾸지 않는다.** 교체로 들어온 구매(`linkedPurchaseToken` 있음)는 이미 같은 행으로 처리된다(`play-billing.spec.ts` "교체로 산 구매는 같은 행을 바꾼다").

## 무엇을

1. **교체 입력 전달.** 사용자에게 살아 있는 Play 구독이 있고(`GET /users/me/subscription`의 `store = play_store`·`plan.action`이 `upgrade`/`downgrade`) 다른 요금제를 결제하면, expo-iap `google` 요청에 **현재 구독의 `purchaseToken`** 과 **`replacementMode`** 를 함께 넘긴다.
   - 현재 구매 토큰은 서버 응답에 없다 — 기기에서 `getAvailablePurchases()`로 가져온다(해당 상품 ID의 구독 구매). 없으면(기기·스토어 계정이 다름) 교체 없이 결제하지 말고 "구독한 기기에서 변경" 안내(`subscription.md` 4.4 마지막 줄과 같은 처리).
   - 모드는 서버가 준 `action`으로 고른다. **`upgrade` → 즉시 적용 + 비례 정산**(Google `CHARGE_PRORATED_PRICE`), **`downgrade` → 다음 갱신부터**(Google `DEFERRED`). `subscription.md` 4.4 "업그레이드 즉시, 다운그레이드는 만료 시점"과 일치. 티어 순서를 클라이언트가 비교하지 않는다.
   - expo-iap 5.8(현재 `package.json`)은 `purchaseToken` + `replacementMode`(Google `ReplacementMode` 정수) 필드다. 8.1부터 `subscriptionProductReplacementParams`로 바뀌므로 설치된 버전의 타입을 확인해 쓴다.
2. **에러 문구.** `SUBSCRIPTION_ALREADY_SUBSCRIBED`(409)를 `ERROR_CODES`와 `purchase.service.ts`의 결과 매핑에 추가하고 문구를 둔다. 예: "이미 구독 중인 요금제가 있어요. 요금제 관리에서 변경해 주세요." 확정 카피는 `spec/uiux/subscription-uiux.md`에 함께 추가(`changes/`가 아니라 이 PR에서 — 새 카피 등재).
3. **다운그레이드 결과 표시.** `DEFERRED` 교체는 결제 직후 티어가 바뀌지 않고 서버가 `pending_plan`(다음 티어·적용 시각)을 채운다(`subscription-api.md` 4.4 "다운그레이드는 pending_plan"). 결제 성공 뒤 "N월 N일부터 Daily"가 이용 중 카드에 보이는지 확인한다(이미 구현돼 있으면 확인만).

## 테스트 (개발계 Android, 라이선스 테스터)

- Pro 결제 → Daily [변경] → 시트에 "변경" 흐름(새 결제가 아니라 기존 구독 수정)으로 뜨고, 완료 뒤 이용 중 카드에 다운그레이드 예약 표시. 서버 로그에 `duplicate play subscription rejected`가 **찍히지 않는다**.
- Daily 결제 → Pro [변경] → 즉시 Pro로 바뀐다(비례 정산 금액은 시트에 Google이 표시).
- 이 티켓 전에 만들어진 두 번째 구독(Daily, 미확인)은 Google이 자동 환불한다 — 테스터 계정의 Play 구독 화면에서 사라지면 정리된 것. 남아 있으면 Play 구독 화면에서 수동 해지.

## 완료 조건

- Given Android에서 Pro 구독 중 / When Daily [변경]을 완료한다 / Then 서버 응답이 200이고 `GET /users/me/subscription`의 `pending_plan`이 Daily·다음 갱신 시각으로 채워지며, 서버 로그에 `duplicate_subscription`이 없다
- Given Android에서 Daily 구독 중 / When Pro [변경]을 완료한다 / Then 즉시 `plan.tier`가 pro가 되고 Google Play 구독 화면에 구독이 **하나**만 남는다
- Given 서버가 409 `SUBSCRIPTION_ALREADY_SUBSCRIBED`를 돌려준다 / When 앱이 결과를 보여준다 / Then "결제 실패"가 아니라 이 코드의 문구가 뜬다
- Given iOS / When 같은 변경을 한다 / Then 동작 변화 없음(Apple 구독 그룹 — 이 티켓의 변경은 Android 분기에만 닿는다)

## 처리 기록

- 2026-10-08 발행(마크다운 + Jira). 재현: 개발계 Android rt 32, 00:39 KST, 백엔드가 서버 로그로 확인.
