# [FE] 1.2.0 운영계 배포 — 결제창은 OTA로 가리고 관리자만 연다

| 항목 | 값 |
|---|---|
| 대상 | 운영 1.2.0(runtime 34) 스토어 출시 · 결제 UI 노출 조건(`frontend/src/shared/lib/feature-flags.ts`) · 운영 OTA env(`eas.json` production · `.github/workflows/eas-update.yml` main 채널) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-172](https://runtime364.atlassian.net/browse/KAN-172) |
| 발행 날짜 | 2026-10-12 |
| 시작 날짜 | 2026-10-12 |
| 기한 | 2026-10-15 (Medium — 3일 안) |
| 선행 | 없음 |
| 관련 | 이 티켓이 운영 결제 마지막 테스트 두 건을 막는다 — 백엔드 `production-payment-test-android.md`(KAN-174, 박준현) · ai `production-payment-test-ios.md`(KAN-177, 박수헌). `ios-1-2-0-native-build-payment-test.md`(KAN-155) · `google-play-production-release.md`(KAN-101) |
| 근거 문서 | `features/paywall.md` 4.5 · `features/subscription.md` · `spec/api/settings-api.md`(`account.is_admin`) · `frontend/architecture.md` 2.1 |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 상태 | 진행 중 — 운영 머지·빌드 완료, 스토어 제출·관리자 전용 노출 남음 |

## 요청

1.2.0 을 운영계로 내보낸다. **결제창은 일반 사용자에게 가린 채** 나가고, **관리자 계정에만 열어** 운영 결제 테스트를 할 수 있게 한다. 테스트가 끝나면 OTA 로 사용자에게 연다(PM 2026-10-12).

## 지금 상태(발행 시점 2026-10-12 19:05)

- 운영 머지 PR #1235(main `795cf772`, 태그 `v1.2.0+5`) — 운영 API 배포·운영 OTA `01a12f7c` 성공
- 운영 빌드 — iOS **1.2.0 (15)** App Store Connect 업로드 완료, Android **1.2.0 vc 18** aab 생성(Play 업로드 사람 손)
- 결제 UI 는 운영에서 **모두에게 꺼져 있다** — 빌드 플래그 `EXPO_PUBLIC_SUBSCRIPTION_UI=off`(eas.json production · eas-update main 채널 둘 다). 결제 네이티브 모듈(expo-iap)은 바이너리에 들어 있다

## 할 것

1. iOS 심사 제출 · Android Play 업로드·출시(사람 손)
2. **관리자만 여는 노출 조건 추가** — 지금 플래그는 번들에 박히는 값이라 계정별로 다르게 할 수 없다. 운영에서는 "빌드 플래그 on **그리고** 서버가 관리자라고 판정"일 때만 결제 UI 를 그리도록 한 겹을 더한다. 판정 값은 이미 있는 `account.is_admin`(settings-api — 서버 판정 boolean, 표시 전용)을 쓴다. 클라이언트가 `role` 을 해석하지 않는다
3. 운영 OTA env 를 관리자 모드로 바꿔 발행 → 관리자 계정으로 결제 UI 가 보이는지 확인
4. 결제 테스트(박준현·박수헌 티켓) 통과 뒤 관리자 조건을 풀어 **모든 사용자에게 여는 OTA** 발행

## 남은 결정

- 관리자 판정을 settings 요약 응답에서 가져올지, 앱 시작 시 받는 계정 정보에 같은 값을 실을지(앱 시작 직후·설정을 안 연 상태에서도 페이월이 관리자 여부를 알아야 한다) — 후자면 백엔드 계약 추가가 필요하다
- 운영 결제 서버 준비(스토어 상품·서버 결제 키·유료 앱 계약)가 끝났는지 — 미완이면 3번 전에 막힌다

## 완료 조건

- Given 운영 스토어, When 1.2.0 을 받으면, Then iOS·Android 모두 출시 상태다
- Given 운영 앱의 일반 계정, When 무료 한도를 다 쓰거나 설정·프로필을 열면, Then 구독·요금제 문구가 어디에도 없다
- Given 운영 앱의 관리자 계정, When 같은 화면을 열면, Then 요금제와 결제 버튼이 보이고 결제를 시작할 수 있다
- Given 결제 테스트 두 건 완료, When 사용자 오픈 OTA 를 발행하면, Then 일반 계정에서도 결제 UI 가 보인다

## 처리 기록

