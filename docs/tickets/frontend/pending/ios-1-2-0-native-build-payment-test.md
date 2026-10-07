# [FE] 1.2.0(rt 32) 네이티브 빌드 — iOS: preview 결제 테스트 → TestFlight → 심사 제출(구독 상품 포함) · Android: preview 빌드 + 운영 내부 테스트 트랙 업로드

| 항목 | 값 |
|---|---|
| 대상 | EAS 빌드(`preview` · `production` 프로필, **iOS·Android**) · TestFlight 내부 테스트 · App Store 심사 제출 · Play 내부 테스트 트랙 업로드. **코드 수정 없음** |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| Jira | [KAN-155](https://runtime364.atlassian.net/browse/KAN-155) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 2026-10-10 (Medium — 3일 안) |
| 선행 | 없음 — 서버(개발계·운영)·dev 앱 구독 상품·샌드박스 테스터가 전부 준비됐다(아래 "서버 쪽 준비"). 이 티켓이 KAN-120·KAN-143(완료 조건 확인)·KAN-141(FLAC LTE 실측)을 막는다(Jira `blocks`) |
| 관련 | `subscription-purchase-screen.md`(KAN-120) · `audio-quality-selection-ui.md`(KAN-143) · 백엔드 `audio-quality-tiers.md`(KAN-141) · `audio-url-refresh-gapless.md`(KAN-124) |
| 근거 문서 | `spec/api/subscription-api.md` 6장(흐름) · `features/subscription.md` 4.2~4.7 · `features/paywall.md` 4.5 · `frontend/architecture.md` 2.1(runtimeVersion) |
| 중요도 | Medium — 결제 테스트와 1.2.0 출시가 전부 이 빌드에 걸려 있다 |
| 상태 | 대기 |

## 왜

iOS 결제 화면(KAN-120)·음질 선택(KAN-143)·서명 URL 무교체 갱신(KAN-124) 코드는 전부 `dev`에 들어갔지만, **runtime 32 네이티브 빌드가 아직 하나도 없다.** 결제 모듈(expo-iap)·expo-network·expo-symbols는 OTA로 갈 수 없고, 옛 바이너리(rt 31)에서는 기능 감지로 꺼져 있다. 결제 테스트와 출시 모두 이 빌드가 선행이다.

**서버 쪽 준비(2026-10-07 완료)**

- **개발계**: dev 앱(`dev.runtime.ear`, Apple ID 6813738593)에 구독 상품 2개 생성(`dev.runtime.ear.subscription.daily.monthly` · `dev.runtime.ear.subscription.pro.monthly` — 운영 상품 ID는 계정 전체에서 고유해 재사용할 수 없어 번들 ID를 따랐다). 개발계 Secrets에 App Store 설정(`APP_STORE_BUNDLE_ID=dev.runtime.ear` · `APP_STORE_ENVIRONMENTS=Sandbox` · 조회 키), `plans.store_product_id_ios` 갱신, Apple 서버 알림 Sandbox URL(`https://api-dev.earcast.co.kr/api/v1/webhooks/app-store`) 연결 — 테스트 알림 수신·서명 검증 확인
- **운영**: v1.2.0+3 — 결제 수정분(#1158 · #1204 · #1217 · #1221) 포함. 운영 상품 2개·알림 URL·조회 키는 2026-10-02부터 있음
- **샌드박스 테스터** 1개 생성(App Store Connect → 사용자 및 액세스 → 샌드박스). 둘째 계정이 필요하면 같은 곳에서 `+sandbox2` 별칭으로

## 무엇을 한다

**코드 수정은 없다.** 확인한 것: `eas.json` `preview`·`production` env와 `.github/workflows/eas-update.yml`에 `EXPO_PUBLIC_SUBSCRIPTION_UI=on`이 같은 값으로 있고, `app.json` `runtimeVersion`은 `32`, `expo-iap` 플러그인 등록됨, 상품 ID는 서버 `GET /plans` 응답(`store_product_id`)에서 받으므로 환경별 분기가 필요 없다.

1. **preview 빌드(iOS, rt 32)** — `eas build -p ios --profile preview`. 개발계 API를 보고 결제 UI가 켜진 빌드. 내부 배포로 테스트 기기에 설치
2. **개발계 결제 시나리오** — 기기: 설정 → App Store → **샌드박스 계정** 로그인(기기의 실제 Apple ID는 그대로). 앱: 이메일 인증을 끝낸 계정으로 로그인(소셜 로그인 어느 것이든 — 샌드박스 계정은 결제 시트 전용이다)

   | 순서 | 앱에서 | 기대(앱) | 기대(서버 — 백엔드가 개발계 로그·DB로 확인) |
   |---|---|---|---|
   | ① | 페이월 → Pro [구독하기] → 시트 승인 | 구독 중 표시, 막혔던 콘텐츠 자동 재생(paywall 4.5) | `purchase intent created` → `purchase applied`, `users.tier = pro` |
   | ② | 5분 대기 | — | `app store notification handled` `SUBSCRIBED` → 5분마다 `DID_RENEW`(샌드박스 월간 = 5분, 12회 뒤 만료) |
   | ③ | 설정 → App Store → 샌드박스 계정 → 구독 관리 → 자동 갱신 끄기 / 다시 켜기 | 해지 예약 / 구독 중 | `DID_CHANGE_RENEWAL_STATUS` |
   | ④ | 12회 갱신 뒤 만료(약 1시간) | 무료·페이월 복귀 | `EXPIRED` → `tier = light` |
   | ⑤ | 앱 삭제 → 재설치 → 같은 계정 → [구매 복원] | "구독이 복원되었어요" | `purchases restored` `restored: 1` |
   | ⑥ | **다른 앱 계정**으로 로그인 → [구매 복원] | 409 "이미 다른 계정에서 사용 중인 구독이에요" | `SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT` |
   | ⑦ | 시트 승인 직후 강제 종료 → 재실행 | 자동으로 구독 중 | `purchase applied`(`intent_id` 없이) |
   | ⑧ | 음질 선택(KAN-143): Light 계정은 무손실 잠금 → Pro 계정은 무손실 선택 → FLAC 있는 콘텐츠 재생 | 다음 편부터 무손실 | 발급 `quality = lossless`. **LTE에서 재생 시작 지연을 재서 KAN-141 처리 기록에 적는다** |

   다시 처음부터 하려면 App Store Connect 샌드박스 테스터의 "구매 내역 지우기". "결제 중단 테스트"·"구독 갱신 속도"도 같은 곳.
3. **운영 TestFlight 빌드(production 프로필, rt 32)** → 내부 테스트 그룹(베타 심사 없음). 샌드박스로 ①·⑤만 최종 확인 — 운영 상품 ID·운영 서버
4. **App Store 심사 제출** — 1.2.0 빌드와 **구독 상품 2개를 같은 제출에 포함**. 심사 통과 전에는 운영 실결제가 되지 않는다. 심사 중 Apple의 결제는 샌드박스로 들어오고 운영 서버가 `Sandbox`를 받게 돼 있다
5. rt 32 빌드가 나오면 `production` 채널 OTA가 그 기기에 닿기 시작한다 — 스토어 1.1.0(rt 31)은 영향 없음(종전 JS 유지)

**Android(추가 2026-10-07)** — 결제는 2단계(KAN-120 2단계·KAN-130)지만, **결제 라이브러리가 든 빌드가 Play에 올라가 있어야** 그 다음이 시작된다.

6. **운영 앱(`com.runtime.ear`) — 내부 테스트 트랙 업로드만, 심사 아님.** `eas build -p android --profile production` → `eas submit`(내부 테스트 트랙). Play Console은 업로드된 AAB에 `com.android.vending.BILLING` 권한(Play Billing 라이브러리가 자동으로 넣음)이 있어야 "수익 창출 → 정기 결제" 메뉴를 열어 준다. 프로덕션 트랙 출시(심사)는 이 티켓 범위가 아니다
7. **preview 앱(`dev.runtime.ear`) — rt 32 preview 빌드(APK) 내부 배포.** 개발계 Play 결제 테스트용. 대상 상품은 dev 앱 Play Console의 정기 결제 2개(`dev.runtime.ear.sub.pro.monthly` · `dev.runtime.ear.sub.daily.monthly`, 기본 요금제 `monthly` — 2026-10-07 생성). 구매 테스트는 Play Console → 설정 → **라이선스 테스트**에 등록한 Google 계정으로 하고, 서버 쪽 Play 설정(`GOOGLE_PLAY_*`)·`plans.store_product_id_android`는 백엔드가 KAN-130에서 넣는다 — 이 티켓은 빌드 업로드까지

## 완료 조건

- Given preview rt 32 빌드를 깐 기기(샌드박스 로그인) / When Pro를 구매한다 / Then 과금 없이 구독 중이 되고 개발계 로그에 `purchase applied`, 5분 뒤 `DID_RENEW` 처리가 찍힌다
- Given 위 기기 / When ③~⑦을 각각 한다 / Then 표의 기대 결과와 같다(KAN-120 완료 조건)
- Given Pro 계정 / When 무손실을 골라 FLAC 콘텐츠를 LTE에서 재생한다 / Then 재생 시작 지연 실측값이 KAN-141 처리 기록에 적혀 있다
- Given 운영 TestFlight rt 32 빌드 / When 샌드박스로 구매·복원한다 / Then 운영 서버에 `environment = sandbox` 구독 행이 생기고 티어가 반영된다
- Given App Store Connect / When 1.2.0을 제출한다 / Then 구독 상품 2개가 같은 제출에 묶여 있다
- Given Play Console 운영 앱 / When 내부 테스트 트랙을 본다 / Then 결제 라이브러리가 든 rt 32 AAB가 올라가 있고 "정기 결제" 메뉴가 열린다(심사 제출 없이)
- Given dev 앱 rt 32 preview APK / When 라이선스 테스터 계정으로 설치한다 / Then 페이월에서 Play 결제 시트가 뜬다(서버 반영은 KAN-130 완료 조건)

## 처리 기록

- 2026-10-07 발행(마크다운 + Jira KAN-155). 서버·상품·테스터 준비는 백엔드가 같은 날 마쳤다(위 "서버 쪽 준비").
- 2026-10-07 — Android 항목(6·7) 추가: 운영 앱 내부 테스트 트랙 업로드(심사 아님) · dev 앱 preview 빌드.
