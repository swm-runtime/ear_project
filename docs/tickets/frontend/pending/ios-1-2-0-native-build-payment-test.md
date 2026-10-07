# [FE] rt 32 네이티브 빌드 — iOS preview 재빌드(개발계 결제 테스트) · Android 운영 앱 번들 내부 테스트 트랙 등록(심사 아님)

| 항목 | 값 |
|---|---|
| 대상 | EAS 빌드 — iOS `preview` 프로필 · Android `production` 프로필(내부 테스트 트랙 업로드만). **코드 수정 없음** |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| Jira | [KAN-155](https://runtime364.atlassian.net/browse/KAN-155) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 2026-10-10 (Medium — 3일 안) |
| 선행 | 없음 — 개발계 서버·dev 앱 구독 상품(iOS·Android)·샌드박스 테스터가 준비됐다(아래). 이 티켓이 KAN-120·KAN-143(완료 조건 확인)·KAN-141(FLAC LTE 실측)·KAN-130(Play 운영 상품 메뉴 개방)을 막는다(Jira `blocks`) |
| 관련 | `subscription-purchase-screen.md`(KAN-120) · `audio-quality-selection-ui.md`(KAN-143) · 백엔드 `audio-quality-tiers.md`(KAN-141) · `android-play-subscription-products.md`(KAN-130) |
| 근거 문서 | `spec/api/subscription-api.md` 6장 · `features/paywall.md` 4.5 · `frontend/architecture.md` 2.1(runtimeVersion) |
| 중요도 | Medium — 결제 테스트가 전부 이 빌드에 걸려 있다 |
| 상태 | 대기 |

## 왜

결제 화면(KAN-120)·음질 선택(KAN-143)·서명 URL 무교체 갱신(KAN-124) 코드는 `dev`에 들어갔지만 **runtime 32 네이티브 빌드가 아직 하나도 없다.** 결제 모듈(expo-iap)·expo-network·expo-symbols는 OTA로 갈 수 없고, 옛 바이너리(rt 31)에서는 기능 감지로 꺼져 있다.

**준비된 것(2026-10-07)**
- 개발계 서버: App Store 설정(`dev.runtime.ear`·Sandbox·조회 키), `plans.store_product_id_ios`, Apple 서버 알림 Sandbox URL 연결·테스트 알림 수신 확인
- dev 앱 App Store Connect 구독 상품 2개 · dev 앱 Play Console 정기 결제 2개(`dev.runtime.ear.sub.pro.monthly` · `dev.runtime.ear.sub.daily.monthly`, 기본 요금제 `monthly`)
- 샌드박스 테스터 계정 1개(App Store Connect)

## 무엇을 한다

**코드 수정은 없다.** 확인: `eas.json` preview·production env와 `eas-update.yml`에 `EXPO_PUBLIC_SUBSCRIPTION_UI=on`, `app.json` `runtimeVersion` 32, `expo-iap` 플러그인 등록, 상품 ID는 서버 `GET /plans`에서 받는다.

1. **iOS preview 재빌드(rt 32)** — `eas build -p ios --profile preview` → 내부 배포로 테스트 기기에 설치. 개발계 API를 보고 결제 UI가 켜진 빌드. 개발계 샌드박스 결제 테스트(구매·갱신·해지·만료·복원·다른 계정 409·강제 종료 회복·음질 선택)는 이 빌드로 한다 — 서버 확인은 백엔드가 개발계 로그·DB로 본다
2. **Android 운영 앱(`com.runtime.ear`) 번들 등록 — 내부 테스트 트랙 업로드만, 심사 아님.** `eas build -p android --profile production` → `eas submit`(내부 테스트 트랙). Play Console은 업로드된 AAB에 `com.android.vending.BILLING` 권한(Play Billing 라이브러리가 자동으로 넣음)이 있어야 운영 앱의 "수익 창출 → 정기 결제" 메뉴를 열어 준다. 프로덕션 트랙 출시(심사)는 이 티켓 범위가 아니다

## 완료 조건

- Given iOS preview rt 32 빌드를 깐 기기(샌드박스 로그인) / When 페이월에서 Pro [구독하기]를 누른다 / Then 샌드박스 결제 시트가 뜨고 승인 뒤 구독 중이 되며 개발계 로그에 `purchase applied`가 찍힌다
- Given Play Console 운영 앱 / When 내부 테스트 트랙을 본다 / Then 결제 라이브러리가 든 rt 32 AAB가 올라가 있고 "정기 결제" 메뉴가 열린다(심사 제출 없이)

## 처리 기록

- 2026-10-07 발행(마크다운 + Jira KAN-155). 서버·상품·테스터 준비는 백엔드가 같은 날 마쳤다. 범위는 iOS preview 재빌드와 Android 운영 번들 등록 둘 — TestFlight·심사 제출은 별도(KAN-120).
