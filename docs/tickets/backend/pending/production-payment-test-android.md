# [BE] 배포 이후 운영계 마지막 결제 테스트 — Android

| 항목 | 값 |
|---|---|
| 대상 | 운영계 Android 정기 결제(Play Billing) — 구매·갱신·해지·서버 알림(RTDN)·권한 반영 |
| 요청 파트 | 백엔드(담당자 소속 파트) |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-174](https://runtime364.atlassian.net/browse/KAN-174) |
| 발행 날짜 | 2026-10-12 |
| 시작 날짜 | 2026-10-12 |
| 기한 | 2026-10-15 (Medium — 3일 안) |
| 선행 | 프론트엔드 `release-1-2-0-production-admin-paywall.md`(KAN-172 — 운영 1.2.0 배포 + 관리자만 결제창 열기) — 진행 중. 운영 Play 정기 결제 상품 등록(KAN-130) — 사람 손, 상태는 담당이 확인 |
| 관련 | 같은 테스트의 iOS 쪽 — ai `production-payment-test-ios.md`(KAN-177, 박수헌) · `ios-1-2-0-native-build-payment-test.md`(KAN-155 — 개발계 결제 테스트) |
| 근거 문서 | `spec/api/subscription-api.md` · `features/subscription.md` · `features/paywall.md` 4.5 |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 요청

1.2.0 운영 배포 뒤, **운영계에서 Android 결제를 마지막으로 테스트**한다(PM 2026-10-12).

- 결제창은 OTA 로 일반 사용자에게 가려 두고 **관리자 계정에만 열린 상태**에서 테스트한다
- 테스트를 통과하면 FE 가 OTA 로 사용자에게 연다(선행 티켓의 4번)

## 완료 조건

- Given 운영 앱의 관리자 계정(Android), When 요금제를 구매하면, Then 서버에 구독이 반영되고 재생 한도가 구독 등급대로 바뀐다
- Given 같은 구독, When 해지·교체·갱신 알림이 오면, Then 서버 상태가 스토어와 같다
- Given 테스트 결과, When 처리 기록을 보면, Then 항목별 통과·실패와 실패 시 원인이 적혀 있고, 사용자 오픈 가능 여부를 PM 에게 알렸다

## 처리 기록

