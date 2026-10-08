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
| 상태 | 완료(2026-10-08) |

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
- 2026-10-08 코드 반영(PR `fix(fe)/android-plan-change-replace`).
  - 교체 입력: 설치된 **expo-iap 5.8.2 는 정수 `replacementMode` 가 아니라** `purchaseToken` + `subscriptionProductReplacementParams { oldProductId, replacementMode: 'charge-prorated-price' | 'deferred' }`(Play Billing 8.1 상품 단위 교체)다. 이 티켓의 "5.8 은 정수" 설명은 틀렸다 — 설치본 타입(`node_modules/expo-iap/src/types.ts`)과 네이티브 파서(`ExpoIapHelper.kt`)로 확인했다.
  - 지금 구독 찾기: `getAvailablePurchases()` 중 확인(acknowledge)된 구매, 결제 대상과 다른 상품. 서버가 거부한 두 번째 구독(미확인)은 고르지 않는다. 없으면 시트를 열지 않고 `replaceSourceMissing` 안내.
  - 409 `SUBSCRIPTION_ALREADY_SUBSCRIBED` → 전용 문구(`subscription-uiux.md` 4.x 에러 표).
  - 다운그레이드 결과(`pending_plan` 토스트·이용 중 카드 "N월 N일부터 …")는 종전 코드 그대로.
  - **남은 것**: 개발계 Android(라이선스 테스터)로 완료 조건 1·2 확인. 확인되면 archive 로 옮기고 Jira 완료.
- 2026-10-08 09:40 BE 실측(Jira 코멘트): 1차의 상품 단위 교체(`subscriptionProductReplacementParams`)는 Play 시트가 "정기 결제 요금제를 변경할 수 없습니다"로 끝났다 — 기기 Play 스토어가 그 파라미터를 모른다(Google Issue 561369347).
- 2026-10-08 2차 반영(PR `feat(fe)/play-deferred-downgrade`).
  - **BE 제안 수정 1(`google.replacementMode` 정수)은 이 라이브러리에서 안 된다** — expo-iap 5.8.2·5.8.3 의 네이티브 파서는 그 키를 읽지 않고, openiap-google 3.6 은 구매 토큰만 오면 방식을 5(CHARGE_FULL_PRICE)로 고정한다(소스 확인). 즉 라이브러리로는 업·다운 모두 즉시 적용뿐이다.
  - PM 결정(2026-10-08): 업그레이드는 즉시, **다운그레이드는 기간 끝나면 자동** — 그래서 로컬 네이티브 모듈 `modules/play-subscription-change`(Android, Play Billing 9.1 직접)를 만들었다. 업그레이드 CHARGE_PRORATED_PRICE(2) · 다운그레이드 DEFERRED(6). runtime 은 32 유지(모듈 유무 분기).
  - 모듈 없는 지금 빌드: 업그레이드 = 구매 토큰만(즉시 적용, 라이브러리 고정 5) · 다운그레이드 = "앱을 업데이트해주세요" 안내.
  - 수정 2(교체 대상): 서버의 지금 구독 상품(이용 중 카드)과 같은 것만, 가장 최근 구매. 모르면 확인된 구매만.
  - 수정 3(로그): 스토어 실패에 code · responseCode · debugMessage 를 싣고 경고 로그를 남긴다. 모듈은 Play responseCode·debugMessage 를 그대로 돌려준다.
  - 다운그레이드 확인 팝업 + 요금제 관리 제목 밑 안내(PM).
  - **Kotlin 은 Windows 에서 컴파일하지 못했다** — 다음 Android 빌드가 첫 컴파일이다.
- 2026-10-08 10:15 · 12:25 BE 재실측(Jira 10231·10233): 2차(OTA `01a1190d`)·vc 34 모두 같은 거절. **진짜 원인은 `obfuscatedAccountId` 불일치** — 결제마다 새 결제 의도 id 를 실어, 교체되는 구독의 값과 달라 Google 이 DEVELOPER_ERROR(5) "Account identifiers don't match the previous subscription"으로 거절했다. (10231 은 2차 답글 직후 달려 효헌이가 놓친 채 vc 34 를 빌드했다 — 다음부터 빌드 전에 티켓 댓글을 다시 읽는다.)
- 2026-10-08 3차 반영(PR `fix(fe)/play-change-account-id`).
  - 교체 결제에는 교체되는 구매의 `obfuscatedAccountIdAndroid` 를 싣는다(모듈·결제 라이브러리 두 경로). 없으면 싣지 않는다(다운그레이드는 모듈 + 값이 있어야만). 새 의도 id 는 서버 제출에만.
  - **OTA 만으로 vc 34 에서 동작한다** — 모듈은 값을 받는 자리가 이미 있다. Kotlin 은 값이 null 이면 싣지 않도록 바꿨다(다음 빌드부터, 지금은 JS 가 null 을 보내지 않는다).
  - 거절(E_BILLING_5 · DeveloperError) → 전용 문구 `changeRejected`. 실패는 `logger.error` + Sentry(`reportError`)로 올린다(warn 은 개발 빌드에만 찍혀 preview 에서 안 남았다). 개발계 앱은 실패 안내에 스토어 원문을 덧붙인다.
  - 설정 버전 행: 개발계 앱에 ` · 빌드 <번호>`(nativeBuildVersion).
- 2026-10-08 12:40 PM 실측: Daily→Pro(즉시) 통과 추정 · **Pro→Daily 에서 무한 로딩**. Sentry EAR-APP-D: 다시 시도한 결제가 `5: There is an existing deferred replacement for the old product` — 첫 시도에서 **예약은 Google 에 섰는데 앱이 결과를 못 받아** 로딩이 멈췄다.
  - 원인: 교체 모듈은 자기 Billing 연결이라 결제 라이브러리의 구매 리스너가 울리지 않는다. 그런데 서비스는 반환값에서 **대상 상품(Daily)** 구매만 받아 확정하고 나머지는 리스너를 기다렸다. DEFERRED 교체는 대상이 아니라 지금 구독(Pro)의 구매가 오거나 빈 목록이라 영영 안 끝났다.
- 2026-10-08 4차 반영(PR `fix(fe)/play-deferred-result`): 모듈 경로(`resolvesDirectly`)면 반환값이 전부 — 대상이 없으면 옛 구독 구매를 서버에 제출하고, 빈 목록이면 `delayed` 로 끝낸다. "이미 예약돼 있음"은 안내 톤 문구. 다운그레이드 성공인데 서버에 `pending_plan` 이 아직 없으면 "다음 결제일부터 바꾼 요금제가 적용돼요".
- 2026-10-08 14:03~14:08 BE 최종 재실측 통과(Jira 10238, vc 34 + OTA `01a119b9`) — Daily 결제 → Daily→Pro(같은 행 pro, 비례 결제) → Pro→Daily DEFERRED(pro · active · `pending_tier=daily`, 앱 "10월 8일부터 Daily 요금제가 적용돼요") → Light 해지(cancelled, [구독 다시 시작]). 서버 쪽 함께 고친 것: #1277(교체된 옛 토큰 만료 무시) · #1281·#1282(DEFERRED 중 자동 갱신 판정). **이 셋은 다음 dev → main 배포에 함께 나가야 운영 결제 오픈이 안전하다**(BE).
- **반영 날짜: 2026-10-08** — archive 로 옮김(KAN-160 PR 에서 함께), Jira 완료.
