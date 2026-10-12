# [FE] 운영 결제 UI OTA 풀고 iOS 새로 빌드(첫 구독 상품 심사용)

| 항목 | 값 |
|---|---|
| 대상 | iOS 1.2.0 스토어 제출 · 운영 결제 UI 플래그(`eas.json` production · `.github/workflows/eas-update.yml` main 채널 `EXPO_PUBLIC_SUBSCRIPTION_UI`) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현 |
| 담당 | 이주호 |
| Jira | [KAN-180](https://runtime364.atlassian.net/browse/KAN-180) — KAN-177 을 막는다(blocks) · KAN-172 와 relates |
| 발행 날짜 | 2026-10-12 |
| 시작 날짜 | 2026-10-12 |
| 기한 | 2026-10-15 (Medium — 3일 안) |
| 선행 | 없음 |
| 관련 | `release-1-2-0-production-admin-paywall.md`(KAN-172 — 관리자만 결제창) · ai `production-payment-test-ios.md`(KAN-177 — 이 티켓 뒤에 한다) |
| 근거 문서 | `features/subscription.md` · `spec/api/subscription-api.md` 7장 · `frontend/src/shared/lib/feature-flags.ts` |
| 중요도 | Medium — 요청자가 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 배경

iOS 1.2.0 (15)는 결제 화면을 끈 채(`EXPO_PUBLIC_SUBSCRIPTION_UI=off`) 빌드됐다. App Store 는 처음 내는 구독 상품을 앱 버전과 함께 심사하고 **심사관이 앱 안에서 그 상품을 찾을 수 있어야 해서**, 결제 화면이 켜진 빌드가 필요하다. 심사 제출(상품 첨부 포함)은 박준현이 한다.

## 할 것

1. **운영 결제 UI OTA 풀기** — `eas.json` production 과 `.github/workflows/eas-update.yml` main 채널의 `EXPO_PUBLIC_SUBSCRIPTION_UI` 를 `on`. 빌드 env 와 OTA env 를 **같이** 켠다 — 운영 runtime 34 OTA(`01a12f7c`)가 off 라 새 빌드가 그걸 받으면 화면이 다시 꺼진다. Android 는 `EXPO_PUBLIC_SUBSCRIPTION_ANDROID=off` 그대로(KAN-130 운영 Play 상품 전)
2. **iOS 1.2.0 새로 빌드**(빌드 번호 16) → App Store Connect 업로드

KAN-172(관리자만 결제창)와의 관계: 심사관은 관리자 계정이 아니라 iOS 는 이 빌드부터 결제 UI 가 모두에게 열린다. 관리자 한정 노출은 Android 에만 남는다.

## 완료 조건

- Given 새 iOS 빌드(16), When 운영 앱에서 무료 한도를 다 쓰거나 설정을 열면, Then 요금제와 결제 버튼이 보인다
- Given 운영 OTA 발행 후, When runtime 34 iOS 앱이 업데이트를 받으면, Then 결제 UI 가 꺼지지 않는다
- Given Android 운영 앱, When 같은 화면을 열면, Then 결제 UI 는 여전히 꺼져 있다

## 처리 기록
