# [FE] 구독 결제 화면 — iOS(StoreKit 2) 먼저, Android(Play Billing)는 2단계

| 항목 | 값 |
|---|---|
| 대상 | 페이월 시트 · 설정 > 구독 관리 화면(신설) · 결제 라이브러리 도입 · `frontend/src/shared/lib/feature-flags.ts`(`IS_SUBSCRIPTION_UI_ENABLED`) · `docs/spec/uiux/`(구독·페이월 화면·카피) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-04 |
| 시작 날짜 | 2026-10-04 |
| 기한 | 2026-10-07 (Medium — 3일 안). **범위가 커서 1단계(iOS)만으로도 3일을 넘길 수 있다** — 넘기면 중요도를 내리지 않고 사유를 처리 기록에 적는다(CLAUDE.md "중요도") |
| 선행 | **1단계(iOS): 없음** — 서버 운영 배포·설정·App Store 알림 연결이 끝났다(2026-10-02, `v1.1.0+9`). **2단계(Android): 티켓이 아닌 선행** — ① Play Console 구독 상품 2개 생성(담당: 박준현 / 상태: 미완 — 이 티켓 2단계의 "결제 라이브러리가 든 빌드 업로드"가 먼저 있어야 상품 메뉴가 열린다) ② 그 상품 ID를 서버 DB에 등록(담당: 박준현 / 상태: 상품 ID 확정 대기) |
| Jira | [KAN-120](https://runtime364.atlassian.net/browse/KAN-120) |
| 관련 | 백엔드 `tickets/backend/pending/subscription-receipt-verification.md`([KAN-40](https://runtime364.atlassian.net/browse/KAN-40)) · `google-ios-in-app-payment.md`([KAN-106](https://runtime364.atlassian.net/browse/KAN-106)) — 서버 쪽은 이 티켓의 선행이 아니라 **함께 닫히는 짝**이다(실제 결제로 확인해야 서버 티켓도 archive된다) |
| 근거 문서 | `spec/api/subscription-api.md`(계약 전체 — **이 문서가 기준**) · `features/subscription.md` 4.2~4.7·5장 · `features/paywall.md` 4.5 · `features/common-error-handling.md` 9.10-3 |
| 중요도 | Medium — 서버는 운영에서 결제를 받을 준비가 됐지만 앱에 화면이 없어 아무도 결제할 수 없다 |
| 상태 | 대기 |

## 배경

구독 결제의 서버 쪽이 운영에 배포됐다. iOS는 2026-10-02(`v1.1.0+9`), Android는 2026-10-03(`v1.1.0+10`)이다. App Store 서버 알림과 Google Play 실시간 알림도 운영 서버에 실제로 도착해 처리되는 것을 확인했다. **남은 것은 앱의 결제 화면이다.**

요금제는 확정됐다 — 데일리 월 3,900원·하루 5편, 프로 월 9,900원·무제한(`domain.md` 8.1). App Store Connect에 구독 그룹과 상품 2개가 만들어져 있다(심사 제출 전).

지금 앱은 구독을 한 글자도 언급하지 않는다(`IS_SUBSCRIPTION_UI_ENABLED = false` — App Store 반려 2.1(b), KAN-66). 이 티켓이 결제를 붙이고 그 플래그를 켠다.

## 범위

**1단계 — iOS (StoreKit 2).** 이 단계만 끝나도 iOS 결제를 열 수 있다.

**2단계 — Android (Play Billing).** 1단계와 같은 화면·같은 API이고 스토어 연결만 다르다. 서버는 준비됐지만 Play Console에 상품이 아직 없다. **2단계의 첫 작업(결제 라이브러리가 든 빌드를 내부 테스트 트랙에 올리기)은 1단계와 병행해 먼저 해 달라** — 그 빌드가 올라가야 Play Console에서 구독 상품을 만들 수 있다.

화면 구성·카피·라이브러리 선택(`expo-iap` · `react-native-iap` 등)은 FE가 정한다. 정한 화면과 카피는 `spec/uiux/`에 적는다.

## 서버 계약 요약

전체는 `spec/api/subscription-api.md`다. 아래는 화면이 부르는 순서대로 추린 것이다.

| # | 호출 | 언제 | 받는 것 |
|---|---|---|---|
| 1 | `GET /plans?platform=ios\|android` | 페이월 시트·구독 관리 화면을 그릴 때 | `plans[]`(`store_product_id` · `entitlements` · `action`) + `is_email_verified` |
| 2 | `POST /users/me/subscription/purchase-intents` | [구독하기]·[업그레이드]·[변경] 탭 → **결제 시트를 열기 직전** | `intent_id` · `store_product_id` · `account_token` |
| 3 | `POST /users/me/subscription/purchases` | 스토어 결제 성공 직후, 그리고 **앱 실행 시 미완료 거래가 있을 때** | 4번과 같은 본문 — 이 값으로 화면을 확정한다 |
| 4 | `GET /users/me/subscription` | 앱 실행·포그라운드 복귀 | `plan` · `entitlements` · `store` · `pending_plan` |
| 5 | `POST /users/me/subscription/restore` | [구매 복원] | `restored` + 4번과 같은 본문 |

- **버튼은 `action`으로 그린다**(`purchase` 구독하기 / `current` 이용 중 / `upgrade` 업그레이드 / `downgrade` 변경 / `none` 버튼 없음). 클라이언트가 티어 순서를 비교하지 않는다
- **가격은 스토어 SDK가 준 현지 가격을 그린다.** `price_krw`는 참고값이다 — SDK 조회가 실패하면 폴백으로 쓰지 않고 "요금제를 불러올 수 없어요"다
- **기능 분기는 `entitlements`로 한다**(`daily_play_limit` · `ads_enabled` 등). 티어명으로 분기하지 않는다
- **해지 API는 없다.** [구독 해지]·[결제 수단 확인]은 스토어 구독 관리 화면으로 보낸다(4번의 `store`가 어느 스토어인지 알려 준다)

## 반드시 지켜야 하는 것

이 여섯 가지는 어기면 **돈을 낸 사용자가 권한을 못 받거나, 남의 결제가 붙는** 문제가 된다.

1. **결제에 `account_token`을 실어 보낸다.** iOS는 `appAccountToken`(UUID), Android는 `obfuscatedAccountId`. 2번 응답의 값을 그대로 넣는다. 서버가 이 값으로 "이 거래를 시작한 계정"을 확인한다 — 빠지면 다른 계정이 그 영수증을 제출해도 막을 근거가 약해진다
2. **서버가 200을 준 뒤에만 거래를 끝낸다**(iOS `finish`). 3번이 실패했는데 거래를 끝내면 "결제됐는데 티어가 없음"이 되고 되돌릴 방법이 없다
3. **Android의 구매 확인(acknowledge)은 앱이 하지 않는다 — 서버가 한다.** 앱이 먼저 확인하면 서버 반영이 실패했을 때 같은 문제가 된다
4. **앱 실행 시 미완료 거래를 서버에 제출한다**(3번, `intent_id` 없이). 결제 직후 앱이 죽었거나 네트워크가 끊긴 경우를 여기서 회복한다
5. **iOS는 StoreKit 2의 서명된 거래(JWS)를 보낸다**(`Transaction.jwsRepresentation`). StoreKit 1 영수증(base64)은 서버가 받지 않는다
6. **이메일 인증을 먼저 본다.** 1번의 `is_email_verified`가 `false`면 [구독하기] 탭 시 이메일 등록·인증 화면(`auth.md` 4.4)을 먼저 열고, 끝나면 결제 흐름으로 돌아온다. 서버도 2번에서 다시 막는다(`EMAIL_REQUIRED_FOR_PURCHASE`)

## 오류 처리

`subscription-api.md` 5장 · `common-error-handling.md` 9.10-3.

| error_code | HTTP | 화면 |
|---|---|---|
| `EMAIL_REQUIRED_FOR_PURCHASE` | 409 | 이메일 등록·인증 화면으로 → 완료 후 결제 흐름 복귀 |
| `SUBSCRIPTION_PLAN_UNAVAILABLE` | 400 | "지금은 이 요금제를 구독할 수 없어요" + 요금제 목록 재조회 |
| `SUBSCRIPTION_STORE_MISMATCH` | 409 | "다른 스토어에서 구독 중이에요. 구독한 기기에서 변경해주세요" |
| `SUBSCRIPTION_RECEIPT_INVALID` | 400 | "구독을 확인할 수 없어요". **거래를 끝내지 않는다.** 자동 재시도 대상이 아니다 — 문의 경로 안내 |
| `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT` | 409 | "이미 다른 계정에서 사용 중인 구독이에요" |
| `SUBSCRIPTION_STORE_UNAVAILABLE` | 503 (retryable) | "구독을 확인하고 있어요… 잠시 후 자동으로 반영됩니다". **거래를 끝내지 않고** 재시도한다 |

- 사용자가 결제 시트를 닫은 것(취소)은 서버 호출도 오류 문구도 없다 — 원래 화면 그대로
- 화면 상태 목록(로딩·미구독·구독 중·해지 예약·유예·만료·검증 중 등)은 `subscription.md` 5장

## 그 밖에 알아둘 것

- **페이월의 자리는 지금의 한도 안내 시트다**(`paywall.md` 4.5). 플래그가 켜지면 그 시트 아래에 요금제 비교·결제 버튼을 얹는다. 결제 성공 후에는 시트를 닫고 막혔던 콘텐츠(`blocked_content_id`)를 자동 재생한다
- **다운그레이드는 즉시 바뀌지 않는다.** 스토어가 다음 결제일로 예약하고, 4번의 `pending_plan`(`tier` · `plan_name` · `effective_at`)이 채워진다 — "N월 N일부터 데일리" 같은 안내의 근거다. 업그레이드는 즉시 반영된다
- **가입 체험과 겹칠 수 있다.** 체험 중인 계정은 `plan.trial`이 채워져 있고 `daily_play_limit`이 `null`이다(`tickets/frontend/pending/signup-trial-notice.md` — KAN-119). 체험 중에도 구독할 수 있고, 그때 `tier`·`plan_name`은 구독 티어가 된다
- **스토어 정책상 필수 표기** — 자동 갱신 조건, 갱신 시점, 해지 방법, 가격·기간, 약관·개인정보처리방침 링크(`subscription.md` 5장). 빠지면 심사에서 반려된다
- **운영 계정 하나가 수동으로 프로다.** 구독 행 없이 `users.tier = pro`로 올려 둔 테스트 계정이 있다. 그 계정으로 샌드박스 결제를 하면 이후 티어가 구독 상태를 따라가 만료 시 무료로 내려간다 — 결제 테스트는 다른 계정으로 한다

## 배포 주의

- **`EXPO_PUBLIC_SUBSCRIPTION_UI=on`은 결제가 붙은 빌드에서만 켠다.** 플래그는 번들에 박히는 값이라, 결제 네이티브 모듈이 없는 스토어 빌드(1.1.0)에 OTA로 켜진 번들이 나가면 구독 버튼만 보이고 결제는 안 되는 상태가 된다 — App Store 반려 사유(2.1(b))이기도 하다
- **결제 화면은 TestFlight / 내부 테스트 트랙으로만 먼저 내보낸다.** 운영 채널 OTA에 싣지 않는다. 결제 라이브러리는 네이티브 변경이라 새 빌드(runtimeVersion 변경)가 필요하고, 그 빌드에서만 플래그를 켠다
- **App Store 구독 상품은 앱 버전과 함께 심사에 제출한다.** 첫 구독 상품은 새 앱 버전의 심사에 묶여 올라간다

## 테스트 방법

**운영 앱 + 샌드박스로 한다**(개발 앱 `dev.runtime.ear`에는 구독 상품이 없다). 운영 서버는 실결제와 샌드박스 결제를 모두 받도록 설정돼 있고, 샌드박스 결제는 DB에 구분돼 기록된다.

- iOS: TestFlight 빌드에서 결제하면 자동으로 샌드박스다(과금 없음). App Store Connect의 샌드박스 테스터 계정을 써도 된다. 샌드박스 구독은 갱신 주기가 짧아(월간 = 5분) 갱신·만료를 금방 볼 수 있다
- Android(2단계): Play Console "라이선스 테스트"에 등록한 계정으로 내부 테스트 트랙 빌드에서 결제한다
- 결제·복원·해지·환불을 할 때 **시각을 박준현에게 알려 주면** 서버 로그(`purchase applied` · `app store notification handled`)와 대조한다. 서버 쪽도 Apple·Google이 서명한 실제 거래로는 이 테스트가 처음이다

## 완료 조건

**1단계 — iOS**

- Given 구독이 없는 계정(이메일 인증됨) / When 페이월 또는 구독 관리에서 프로를 [구독하기]하고 결제를 마친다 / Then 화면이 즉시 프로로 바뀌고 `GET /users/me/subscription`이 `status: subscribed`, `tier: pro`를 준다
- Given 한도에 막혀 페이월이 뜬 상태 / When 결제를 마친다 / Then 시트가 닫히고 막혔던 콘텐츠가 자동 재생된다
- Given 이메일 인증이 안 된 계정 / When [구독하기]를 누른다 / Then 이메일 등록·인증 화면이 먼저 뜨고, 인증을 마치면 결제 흐름으로 돌아온다
- Given 결제 시트 / When 사용자가 닫는다 / Then 원래 화면 그대로이고 오류 문구가 없다
- Given 결제는 됐지만 서버 제출 전에 앱이 종료된 상태 / When 앱을 다시 연다 / Then 미완료 거래가 서버에 제출되고 구독이 반영된다
- Given 서버가 503(`SUBSCRIPTION_STORE_UNAVAILABLE`)을 답한 상태 / When 화면을 본다 / Then "확인 중" 안내가 나오고 거래는 끝나지 않은 채 재시도된다
- Given 구독 중인 스토어 계정으로 앱을 새로 설치·로그인 / When [구매 복원]을 누른다 / Then "구독이 복원되었어요"와 함께 구독 상태가 된다. 구독이 없으면 "복원할 구독이 없어요"
- Given 프로 구독자 / When 데일리로 [변경]한다 / Then 티어는 프로 그대로이고 "언제부터 데일리"가 `pending_plan.effective_at` 날짜로 표시된다
- Given 스토어에서 해지한 구독자 / When 앱을 다시 연다 / Then "N월 N일까지 이용 가능해요"(`cancel_scheduled`)로 보인다
- Given 구독 화면 / When 본다 / Then 자동 갱신 조건·해지 방법·가격·기간·약관/개인정보처리방침 링크가 있다
- Given 운영 채널(스토어 1.1.0 빌드) / When 이 티켓의 변경이 머지된다 / Then 구독 UI가 켜진 번들이 그 빌드에 OTA로 나가지 않는다
- Given `spec/uiux/` / When 읽는다 / Then 페이월·구독 관리 화면의 상태와 확정 카피가 적혀 있다

**2단계 — Android**

- Given 결제 라이브러리가 든 Android 빌드 / When 내부 테스트 트랙에 올린다 / Then Play Console에서 구독 상품 메뉴가 열린다(**이 조건은 1단계와 병행해 먼저 채운다**)
- Given Play 상품이 등록되고 서버에 상품 ID가 들어간 상태 / When Android에서 프로를 구독한다 / Then 화면이 즉시 프로로 바뀌고 `store: play_store`로 조회된다
- Given Android 결제 / When 결제가 끝난다 / Then 앱은 구매를 확인(acknowledge)하지 않는다 — 서버가 한다
- Given iOS에서 구독 중인 계정 / When Android에서 요금제 화면을 연다 / Then 현재 요금제만 "이용 중"으로 보이고 나머지는 버튼이 없으며, 결제를 시도하면 "다른 스토어에서 구독 중이에요"가 나온다
- Given Android 구독자 / When [구매 복원]·요금제 변경·해지를 한다 / Then 1단계의 같은 조건과 같은 결과다
