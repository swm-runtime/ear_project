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
| 반영 날짜 | 2026-10-14 |
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
- 2026-10-14 15:55~16:08 KST 운영계에서 관리자 계정(Android, 라이선스 테스터 — `environment: sandbox`)으로 테스트. CloudWatch `/ear/api` 로그로 확인(박준현).

  | 시각(KST) | 조작 | 서버 |
  |---|---|---|
  | 15:56:06 | Daily 구매 | intent → RTDN 4(구매) 적용, tier `daily` → 영수증 제출 `unchanged`(알림이 먼저 반영) |
  | 15:56:29 | Pro 업그레이드 | RTDN 4 적용, tier `pro` → 옛 Daily 토큰 RTDN 13은 `replaced_token`으로 무시(정상) → 영수증 `unchanged` |
  | 15:58:01 | Daily로 변경(다운그레이드·다음 결제일) | 영수증 `unchanged`, RTDN 4 적용, acknowledge 409 → 성공 처리(KAN-165 수정 확인), RTDN 13 `replaced_token` 무시 |
  | 16:01:56 | 갱신 | RTDN 2 → 예약 다운그레이드 발효, tier `daily` |
  | 16:02:35 | 해지 | RTDN 3 적용(해지 예약) |
  | 16:03:08 | Pro intent 생성 | 이후 영수증·RTDN 없음 — 결제 시트에서 진행하지 않은 것으로 봄(서버 오류 없음) |
  | 16:04:55 | 구독 다시 시작 | RTDN 7 적용 |
  | 16:05:15 | 재해지 | RTDN 3 적용 |
  | 16:06:20 | 기간 종료 | RTDN 13 적용, tier `light`, 구독 종료 |

  - **완료 조건 1** 통과 — tier가 daily → pro → daily → light로 서버에서 동기화됐고 재생 한도는 tier에서 유도된다.
  - **완료 조건 2** 통과 — RTDN 2·3·4·7·13 전부 적용(또는 교체 토큰의 13만 의도대로 무시). 거절·503·재전송 대기 0건, 에러 로그 0건.
  - **완료 조건 3** — 이 기록으로 충족. 사용자 오픈 가능: **가능**. 단, FE가 같은 날 PR #1508로 Android 결제 UI를 운영에 먼저 열었다 — 이 보고가 선행이어야 했으므로 순서 어긋남을 기록해 둔다(결과는 통과라 되돌릴 일은 없음).
  - 범위 밖: 실결제(실카드) 검증은 하지 않았다(라이선스 테스터 결제만). Google 실응답 경로는 `subscription-iap-status` 기준 미검증 상태 그대로.
- 2026-10-14 `archive/`로 이동, KAN-174 완료.
