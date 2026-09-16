# [FE] iOS 심사 반려(2.1(b)) — 인앱 결제 상품 없는 "구독" 언급을 바이너리에서 숨기고 재빌드·재제출

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/settings/`(구독 섹션·플랜 카드) · `frontend/src/features/profile/`(플랜 카드) · `frontend/src/features/player/player.copy.ts`(한도 소진 라벨) · 페이월 진입점(`usePlayGate.ts`) · EAS 네이티브 빌드 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-16 |
| 발견 시점 | App Store 심사 — Submission `5e689f1a-8fa3-42e1-9a2e-e6271898ca0c`, 1.0.0 (5), iPhone 17 Pro Max. **Guideline 2.1(b) Performance – App Completeness** 반려 |
| 근거 문서 | Apple 반려 메시지(아래 인용) · `features/paywall.md` · `features/subscription.md` · `spec/uiux/settings-uiux.md` 4.1 · `spec/uiux/profile-uiux.md` 4.1 |
| 심각도 | **상** — 스토어 심사가 이 건으로 멈춰 있다. 고치고 새 바이너리로 재제출해야 심사가 재개된다 |
| 우선순위 | High(오늘 안) |

## 문제

Apple 반려 메시지:

> We are unable to complete the review of the app because one or more of the In-App Purchase products have not been submitted for review. Specifically, the app includes references to **subscription** but the associated In-App Purchase products have not been submitted for review.
> Next Steps: submit the In-App Purchase products **and upload a new binary**.

리뷰어가 본 구독 언급(코드 기준):

| 위치 | 문구 |
|---|---|
| 설정 화면 — "구독" 섹션 제목 + 플랜 카드 | `SETTINGS_COPY.sections.subscription = '구독'` · `plan.freeAction = '구독 알아보기'` · `plan.a11y = '구독 관리 열기'` · 탭 시 `Subscription` 화면으로 이동(`useSettingsScreen.ts` `openPlan`) |
| 프로필 화면 — 플랜 카드 | `PROFILE_COPY … freeAction = '구독 알아보기'` · a11y `'구독 관리 열기'` · `Subscription` 이동(`useProfileScreen.ts` `openPlan`) |
| 플레이어·라이브러리·탐색 — 잔여 재생 표시 소진 시 | `PLAYER_COPY … a11yLabelExhausted = '오늘 재생 0회 남음, 구독 안내 열기'` · 탭 시 `openPaywall` → 자리 토스트 |

앱에는 **인앱 결제 구현이 없다** — 결제 라이브러리(react-native-iap·RevenueCat 등) 미설치, 상품 ID 없음. 서버 영수증 검증도 미구현(KAN-40). 즉 구독은 진입점만 있고 실제 구매가 불가능하다. Apple 기준으로 "구독을 언급하면 구매 가능한 IAP 상품이 같은 제출에 있어야" 하므로, 상품을 등록해 함께 내는 길(선택지 2)은 결제가 동작하지 않아 **다른 사유(2.1 기능 미동작·3.1.1)로 다시 반려**된다.

## 요청 내용

**MVP 바이너리에서 구독 언급을 전부 숨긴다.** 결제 기능이 실제로 붙는 시점(KAN-40 + FE 결제 라이브러리)에 되살린다.

1. **설정 화면** — "구독" 섹션과 플랜 카드를 렌더하지 않는다(섹션 제거). 무료 이용 안내가 필요하면 한도만 적는다: "무료 이용 중 · 하루 N편"은 유지 가능, **"구독 알아보기" 버튼·`Subscription` 이동은 제거**.
2. **프로필 화면** — 플랜 카드의 "구독 알아보기" 버튼·`Subscription` 이동 제거. "현재 플랜 / 무료 이용 중 · 하루 N편" 표시는 남겨도 된다(구독을 팔지 않는 정보 표시).
3. **한도 소진 진입점** — `a11yLabelExhausted`를 "오늘 재생 0회 남음"으로 바꾸고(구독 안내 문구 삭제), `openPaywall`은 한도 안내 토스트만 띄운다 — 현행 자리 토스트 문구("오늘 들을 수 있는 콘텐츠를 모두 들었어요")는 구독 언급이 없어 그대로 둔다. `PlayConfirmDialog`는 이미 "업그레이드 유도를 얹지 않는다" 규칙이라 변경 없음.
4. **금지** — 숨기면서 "웹에서 구독하세요" 같은 **외부 결제 안내를 넣지 않는다**(3.1.1 위반으로 재반려). 문구는 한도 안내로만 둔다.
5. 숨김은 **기능 플래그**(예: `EXPO_PUBLIC_SUBSCRIPTION_UI=off` 또는 상수)로 두어, 결제 구현 후 플래그만 켜서 되살릴 수 있게 한다. 삭제가 아니라 비노출이다.
6. **네이티브 재빌드 필수.** Apple이 "새 바이너리"를 요구했다. OTA로 문구만 바꾸면 심사 대상 바이너리가 그대로다. `eas build --platform ios` → TestFlight → 심사 재제출. 이전 반려(KAN-63 마이크 문구)와 같은 절차다.
7. 재제출 시 **App Review 메시지에 답장**을 남긴다: "이번 버전은 유료 구독을 제공하지 않으며 구독 관련 화면·문구를 제거했다. 인앱 결제는 다음 버전에서 상품과 함께 제출하겠다." 리뷰어가 문구 잔존을 다시 찾지 않도록 한다.

## 문서 영향

`settings-uiux.md` 4.1·`profile-uiux.md` 4.1의 플랜 카드·"구독 알아보기" 규칙은 **MVP 비노출**로 개정이 필요하다 — `changes/pending`으로 발행한다(이 티켓 처리 PR에서 함께). `paywall.md`의 페이월 규칙은 P1 유지, "MVP 바이너리에서는 진입점을 노출하지 않는다" 한 줄만 덧붙인다.

## 완료 조건

- Given 새 iOS 빌드 / When 설정·프로필·플레이어·라이브러리·탐색 화면을 본다 / Then "구독" 단어와 `Subscription` 화면으로 가는 진입점이 없다
- Given 무료 사용자가 오늘 한도를 다 썼다 / When 잔여 재생 표시를 탭한다 / Then 한도 안내만 뜨고 구독·업그레이드·외부 결제 안내는 없다
- Given 낭독기 / When 잔여 재생 표시(소진)에 초점 / Then "구독 안내 열기"를 읽지 않는다
- Given 기능 플래그를 켠다 / When 같은 화면을 본다 / Then 종전 구독 UI가 그대로 돌아온다(삭제가 아님)
- Given 그 빌드로 재제출 / When Apple 심사 / Then 2.1(b) 구독 상품 미제출 사유로 반려되지 않는다
