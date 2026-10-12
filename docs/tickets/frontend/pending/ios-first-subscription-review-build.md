# [FE] iOS 첫 구독 상품 심사 — 결제 화면을 켠 빌드로 재제출(운영 OTA 결제 UI on)

| 항목 | 값 |
|---|---|
| 대상 | iOS 1.2.0 스토어 제출 · 운영 결제 UI 플래그(`eas.json` production · `.github/workflows/eas-update.yml` main 채널 `EXPO_PUBLIC_SUBSCRIPTION_UI`) · App Store Connect 버전 제출의 "인앱 구입 및 구독" |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현 |
| 담당 | 이주호 |
| Jira | [KAN-180](https://runtime364.atlassian.net/browse/KAN-180) — KAN-177 을 막는다(blocks) · KAN-172 와 relates |
| 발행 날짜 | 2026-10-12 |
| 시작 날짜 | 2026-10-12 |
| 기한 | 2026-10-15 (Medium — 3일 안) |
| 선행 | 없음(티켓). 사람 손 확인: App Store Connect 구독 상품 2개 "제출 준비 완료" · 유료 앱 계약·세금·은행 정보 — 상태 미확인 |
| 관련 | `release-1-2-0-production-admin-paywall.md`(KAN-172 — 관리자만 결제창) · ai `production-payment-test-ios.md`(KAN-177 — 이 티켓 뒤에 한다) |
| 근거 문서 | `features/subscription.md` · `spec/api/subscription-api.md` 7장 · `frontend/src/shared/lib/feature-flags.ts` |
| 중요도 | Medium — 요청자가 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 배경

iOS 1.2.0 (15)는 결제 화면을 끈 채(`EXPO_PUBLIC_SUBSCRIPTION_UI=off`) 심사에 올라갔고, 승인 뒤 OTA 로 관리자에게만 열 계획이었다(KAN-172). 그런데 **App Store 는 처음 내는 구독 상품을 앱 버전과 함께 심사하고, 심사관이 앱 안에서 그 상품을 찾아 결제해 볼 수 있어야 한다.**

- 화면이 꺼져 있으면 상품이 반려되거나 "개발자 조치 필요"로 남는다. **승인되지 않은 상품은 나중에 OTA 로 화면을 열어도 운영 App Store 가 내주지 않는다** — 페이월에 상품이 안 뜨거나 결제가 실패한다.
- 숨긴 기능을 심사 뒤 OTA 로 켜는 것은 심사 지침 2.3.1(숨겨진 기능)·2.5.2 위반 소지도 있다.
- 결제 UI 플래그는 번들에 박히는 값이라 OTA 는 계정이 아니라 채널(+runtimeVersion) 단위로 나간다.

## 할 것

1. 지금 심사 중인 1.2.0 (15) 제출을 **심사에서 제거**(개발자 거부)
2. **운영 빌드·OTA env 의 결제 UI 를 on** — `eas.json` production 과 `eas-update.yml` main 채널의 `EXPO_PUBLIC_SUBSCRIPTION_UI` 를 `on`. **OTA 도 같이 켜야 한다** — 운영 runtime 34 OTA(`01a12f7c`)가 off 라, 새 빌드가 그걸 받으면 화면이 다시 꺼진다. Android 는 `EXPO_PUBLIC_SUBSCRIPTION_ANDROID=off` 그대로(KAN-130 운영 Play 상품 전)
3. iOS 1.2.0 새 빌드(빌드 번호 16) → App Store Connect 업로드
4. 버전 제출 화면 "인앱 구입 및 구독"에 `com.runtime.ear.subscription.daily.monthly` · `com.runtime.ear.subscription.pro.monthly` **첨부** — 상품 ID 는 운영 서버 `plans.store_product_id_ios`(마이그레이션 `1788300100000-SeedPaidPlans`)와 글자까지 같아야 한다
5. 심사 메모에 구독 위치(설정 > 구독 · 무료 한도 소진 시 페이월)와 심사용 계정 안내
6. 출시 방식은 **수동 출시** — 승인 후 공개 전에 TestFlight 로 팀 결제 테스트(KAN-177)를 하고 공개한다. TestFlight 결제는 Sandbox 이지만 운영 서버로 붙는다(운영 `APP_STORE_ENVIRONMENTS=Production,Sandbox` — 2026-10-12 확인)

## KAN-172(관리자만 결제창)와의 관계

심사관은 관리자 계정이 아니라서 **iOS 는 "관리자만 노출"로 심사를 통과할 수 없다.** iOS 결제 UI 는 이 빌드부터 모두에게 열리고, **공개 시점(수동 출시 버튼) = 결제 오픈 시점**이 된다. 관리자 한정 노출은 Android(Play 상품 준비 전)에만 의미가 남는다 — KAN-172 범위를 맞춰 고친다.

## 확인 필요(사람 손)

- App Store Connect 구독 상품 2개 상태(메타데이터·가격·심사용 스크린샷 → "제출 준비 완료"), 유료 앱 계약·세금·은행 정보
- 운영 앱 App Store 서버 알림 URL — Production·Sandbox 둘 다 `https://api.earcast.co.kr/api/v1/webhooks/app-store`(심사관·TestFlight 결제 알림은 Sandbox URL 로 온다)

## 완료 조건

- Given 새 iOS 빌드(16), When 운영 앱에서 무료 한도를 다 쓰거나 설정을 열면, Then 요금제와 결제 버튼이 보인다
- Given App Store Connect 버전 제출, When 인앱 구입 섹션을 보면, Then 구독 2개가 첨부돼 함께 심사 중이다
- Given 심사 통과(수동 출시 대기), When 팀이 TestFlight 로 결제하면, Then 운영 서버에 구독이 반영된다(KAN-177)
- Given Android 운영 앱, When 같은 화면을 열면, Then 결제 UI 는 여전히 꺼져 있다

## 처리 기록
