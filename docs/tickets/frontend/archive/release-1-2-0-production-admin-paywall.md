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
| 상태 | 진행 중 — 운영 머지·빌드 완료, 결제 UI 는 iOS(10-13)·Android(10-14) 모두 운영 on, 스토어 출시 남음 |

## 요청

1.2.0 을 운영계로 내보낸다. **결제창은 일반 사용자에게 가린 채** 나가고, **관리자 계정에만 열어** 운영 결제 테스트를 할 수 있게 한다. 테스트가 끝나면 OTA 로 사용자에게 연다(PM 2026-10-12).

## 지금 상태(발행 시점 2026-10-12 19:05)

- 운영 머지 PR #1235(main `795cf772`, 태그 `v1.2.0+5`) — 운영 API 배포·운영 OTA `01a12f7c` 성공
- 운영 빌드 — iOS **1.2.0 (15)** App Store Connect 업로드 완료, Android **1.2.0 vc 18** aab 생성(Play 업로드 사람 손)
- 결제 UI 는 운영에서 **모두에게 꺼져 있었다** — 빌드 플래그 `EXPO_PUBLIC_SUBSCRIPTION_UI=off`(eas.json production · eas-update main 채널 둘 다). 결제 네이티브 모듈(expo-iap)은 바이너리에 들어 있다. **2026-10-12 KAN-180 으로 이 플래그를 `on` 으로 바꿨다** — iOS 심사관이 첫 구독 상품을 봐야 해서다. 아래 "할 것 2·3(관리자만 노출)"은 이로써 iOS 에는 적용하지 않는다(KAN-180 이 대체). Android 는 `SUBSCRIPTION_ANDROID=off` 라 여전히 전원 비노출

## 할 것

1. iOS 심사 제출 · Android Play 업로드·출시(사람 손)
2. ~~**관리자만 여는 노출 조건 추가**~~ — **2026-10-12 KAN-180 으로 방향 변경.** iOS 는 첫 구독 상품 심사 때문에 모두에게 열어야 해서 관리자 게이트를 적용하지 않는다. Android 는 `SUBSCRIPTION_ANDROID=off` 라 지금 전원 비노출이고, 관리자 한정 노출은 운영 Play 상품(KAN-130) 등록 후 Android 결제 테스트를 할 때 다시 본다 — 그때 `account.is_admin`(settings-api, 서버 판정 boolean) 기반으로 한 겹 더하는 것을 검토한다(클라이언트가 `role` 을 해석하지 않는다). 지금은 구현하지 않는다(켜질 자리가 없다)
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

- 2026-10-12 — iOS 관리자 전용 노출(할 것 2·3)은 KAN-180(`ios-first-subscription-review-build.md`)으로 대체. iOS 는 전원 노출로 전환(심사용). Android 관리자 게이트는 KAN-130 후로 보류. 남은 것: iOS·Android 스토어 출시(사람 손), 결제 테스트 두 건(KAN-174·KAN-177) 통과 후 사용자 오픈 OTA(할 것 4) — iOS 는 이미 전원 오픈이라 사실상 Android 전용 단계가 된다.
- 2026-10-14 — **Android 운영 결제 UI on**(`EXPO_PUBLIC_SUBSCRIPTION_ANDROID=on` — eas.json production · eas-update main 채널 둘 다). KAN-174(박준현) 2026-10-12 코멘트: 운영 Play 정기 결제 2개(`com.runtime.ear.sub.daily.monthly` · `.pro.monthly`) 생성·활성, 운영 `plans.store_product_id_android` 등록 완료 → "③ 앱 Android 결제 UI on → 라이선스 테스터로 종단 테스트" 요청. 관리자 게이트(할 것 2)는 넣지 않고 전원 노출로 연다 — iOS 와 같은 상태. 결제 모듈이 없는 옛 바이너리(rt 31 이하)는 런타임 감지로 여전히 꺼진다. 이로써 할 것 4(사용자 오픈 OTA)는 iOS·Android 모두 끝났고 남은 것은 스토어 출시(1번)와 결제 테스트 결과(KAN-174·KAN-177).
- 2026-10-19 **완료 — archive**(반영 날짜 2026-10-19). 완료 조건 대조: ① 1.2.0 iOS·Android 출시 — 운영 기기 수에 1.2.0 iOS 237·Android 142(KAN-198 10-18 집계), 그 위에 1.2.1이 나갔다. ② 일반 계정 구독 문구 없음 · ③ 관리자만 결제 — **2026-10-12·10-14 결정으로 대체**(관리자 게이트 없이 iOS·Android 전원 노출). 관리자 계정 결제는 KAN-174 운영 종단 테스트로 확인. ④ 결제 테스트 두 건 뒤 사용자 오픈 OTA — Android KAN-174 완료, iOS KAN-177 ①~⑦ 통과(10-17 환불 포함), 오픈 OTA는 10-13·10-14에 발행됨. KAN-177에 남은 환불 입금 확인은 AI 파트 일이라 이 티켓과 무관. Jira KAN-172는 이미 완료였고 마크다운만 남아 있었다.
