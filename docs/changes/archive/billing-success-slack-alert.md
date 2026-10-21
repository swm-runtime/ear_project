# 결제 성공·환불·해지 예약 Slack 알림 — 모니터링·운영 문서 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/backend-monitoring.md` 3-7(신설) · 3-6 첫 문단 · `infra/runbook.md` 4-1 알림 표·표 아래 "사용자 신호" 문단 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-18 |
| 관련 | KAN-132 후속(결제 실패 알림의 성공 쪽) · 브랜치 `feat(be)/billing-success-slack-alert` |

## 배경

결제 경로의 Slack 알림은 실패 쪽(3-6 — 검증 거부·스토어 알림 거부·보정 실패·두 번째 구독 거부·강제 만료)만 있었다. 결제는 드물고 사람이 바로 알고 싶어 하는 사건이라(첫 유료 고객·심사 결제가 실제로 통과했는지·환불), 일일 보고로 모으지 않고 **건마다** 한 줄로 올린다. 구현은 `billing/services/billing-event-alert.service.ts`(발송) · `billing-event-alert.format.ts`(문구) · `billing-sync.service.ts`의 `resolveTransitionKind`(전이 판정)다.

## 수정 내용

### 1. `backend-monitoring.md` — 3-7 신설

3-6 바로 뒤에 다음 절을 넣는다.

> ### 3-7. 결제 Slack — 구독 시작·환불·해지 예약 (신설 2026-10-18 — KAN-132 후속)
>
> 결제가 일어나면 건마다 Slack 한 줄(팀 알림 채널). 3-6 과 달리 **10분 묶음 창을 쓰지 않는다** — 건마다 의미가 있다. 구현은 `billing/services/billing-event-alert.service.ts`(발송) · `billing-event-alert.format.ts`(문구).
>
> | 알림 | 언제 | 문구 |
> |---|---|---|
> | 신규 구독 | 그 계정에 유효 구독이 **처음 생겼다**(구독 행이 없었음 → 비종결). 구매 제출(iOS·Android), App Store `SUBSCRIBED`·`OFFER_REDEEMED`, Play RTDN `SUBSCRIPTION_PURCHASED`(4) 중 **먼저 반영한 쪽**이 보낸다 | `:tada: 신규 구독 · App Store · Production · daily · 시장 KR · 국가 KOR · 3,900 KRW · 10. 18. 14:03` |
> | 재구독 | 끝난 구독 행(`expired`·`refunded`)이 새 결제로 되살아났다. 같은 경로 | `:tada: 재구독 · …` |
> | 무료 체험 시작 | 위 둘인데 그 결제 주기가 무료 체험이다(App Store `offerDiscountType = FREE_TRIAL` · Play `offerPhase.freeTrial`). 금액을 싣지 않는다 | `:seedling: 무료 체험 시작 · …` |
> | 환불·철회 | 구독이 `refunded`가 됐다 — App Store `REFUND`·`REVOKE`, Play RTDN `SUBSCRIPTION_REVOKED`(12)·환불 통지(voided) | `:money_with_wings: 환불·철회 · Google Play · Sandbox(시험 결제) · pro · 시장 GLOBAL · 국가 US · …` |
> | 해지 예약 | 자동 갱신이 켜진 유효 구독이 꺼졌다 — App Store `DID_CHANGE_RENEWAL_STATUS:AUTO_RENEW_DISABLED`, Play RTDN `SUBSCRIPTION_CANCELED`(3). 금액을 싣지 않는다 | `:wave: 해지 예약 · …` |
>
> - **한 결제에 한 번.** 같은 구매가 구매 제출·앱 재실행 시 미완료 거래 재제출·복원·스토어 알림으로 여러 번 들어오지만, 알림은 **구독 행을 실제로 바꾼 반영**(잠근 행의 반영 전 상태 → 반영 후 상태)에서만 나간다. 두 번째부터는 행이 이미 그 상태라 바뀌지 않는다. 롤백된 반영을 알리지 않도록 **커밋 뒤에** 보낸다.
> - **문구 칸**: 사건 · 스토어 · 스토어 환경(**`Production` / `Sandbox(시험 결제)`** — 심사·TestFlight·라이선스 테스터 결제가 운영 서버에도 Sandbox 로 들어온다. 매출로 읽지 않는다) · 요금제(티어 코드) · 시장(`users.market`) · 스토어 국가(App Store `storefront` 3자 · Play `regionCode` 2자) · 금액·통화(**App Store 만** — 거래의 `price`·`currency`. Play 구독 조회 응답에는 금액이 없다) · KST 시각. 모르는 칸은 뺀다. 국가·금액은 저장하지 않는다 — 스토어 응답에서 읽어 문구에만 쓴다(`domain.md`에 컬럼 없음).
> - **신원 값을 싣지 않는다** — 이메일·닉네임·`user_id`·거래 ID·주문 ID·구매 토큰. 시장 조회에 `user_id`를 쓰지만 문구에 넣지 않는다.
> - **보내지 않는 것**과 이유:
>   - **갱신**(App Store `DID_RENEW` · Play `SUBSCRIPTION_RENEWED`(2)) — 구독자 수에 비례해 매달 늘어 채널을 덮는다. 구독자 추이는 서비스 지표 탭(4장)에서 본다
>   - **결제 실패 복구**(App Store `DID_RENEW:BILLING_RECOVERY`·갱신 거래(`transactionReason = RENEWAL`)의 재제출, Play `SUBSCRIPTION_RECOVERED`(1)·`SUBSCRIPTION_RESTARTED`(7)) — 끝난 행이 되살아나지만 새 결제가 아니라 갱신이다
>   - **복원**·**04:45 구독 보정**이 처음 연결하거나 되살린 구독 — 사용자가 지금 결제한 것이 아니다(재설치·탈퇴 후 재가입 복원·유실 알림 보정)
>   - **만료**·**유예 진입**·**요금제 변경 예약**·**해지 예약 취소(자동 갱신 다시 켬)**·**환불 취소(`REFUND_REVERSED`)** — 결제 사건이 아니거나(만료·예약) 드물고 받아도 할 일이 없다
> - **해지 예약을 보내는 이유**: 이탈의 가장 이른 신호이고, 3-3·3-4 보고에 구독 줄이 없어 다른 곳에서 보이지 않는다. 구독자 한 명이 한 주기에 많아야 한 번이라 갱신처럼 채널을 덮지 않는다. 채널이 시끄러워지면 이 종류만 일일 보고로 옮긴다(3-4 와 같은 판단).
> - 던지지 않고 기다리지 않는다 — 시장 조회·Slack 이 실패해도 결제 응답은 그대로다(시장 조회 실패는 그 칸만 빼고 보낸다). 웹훅이 없으면 시장 조회도 하지 않는다. 추가 설정 없음 — 3-6 과 같은 웹훅.

### 2. `backend-monitoring.md` 3-6 첫 문단

"셋은 사람이 봐야 해서 …" 문장 끝에 덧붙인다: `성공 쪽(구독 시작·환불·해지 예약)은 3-7.`

### 3. `infra/runbook.md` 4-1 알림 표

"구독 보정 실패" 행 바로 아래에 다음 행을 넣는다.

| 대상 | 원천 | 임계값 · 조건 | 채널 | 지연 | 받으면 |
|---|---|---|---|---|---|
| 결제(구독 시작·환불·해지 예약) | 백엔드 `BillingEventAlertService` — 유효 구독이 처음 생김·`refunded`가 됨·자동 갱신 꺼짐(`backend-monitoring.md` 3-7) | **건마다**(묶지 않음 · 한 결제에 한 번) | Slack | 즉시 | 할 일 없음(정보). `Sandbox(시험 결제)`는 심사·테스트 결제다. 환불이 잦으면 스토어 콘솔에서 사유 확인 |

### 4. `infra/runbook.md` 4-1 표 아래 "사용자 신호" 문단

"사용자 신호(가입·탈퇴·스토어 리뷰·앱 삭제)와 일일 지표 보고도 …" 의 괄호에 `결제` 를 더하고 절 범위를 `3-2~3-5, 3-7`로 고친다 — 결제 행은 표에 있지만 임계값이 없는 정보다.

## 범위 밖

- 금액·국가를 `subscriptions`에 저장하지 않는다(`domain.md`에 없다). 매출 집계가 필요해지면 그때 스키마로 논의한다.
- Play 금액은 싣지 않는다 — `purchases.subscriptionsv2.get`에 없고, 주문 API(`orders`)를 따로 불러야 한다. 결제 흐름에 외부 호출을 하나 더 얹을 이유가 아직 없다.

## 완료 조건

- Given `features/backend-monitoring.md` / When 3-7 을 읽는다 / Then 보내는 사건 5종(신규 구독·재구독·무료 체험 시작·환불·철회·해지 예약)과 경로, "한 결제에 한 번"(행을 실제로 바꾼 반영·커밋 뒤), 문구 칸(Sandbox 구분 포함)·신원 값 제외, 보내지 않는 사건과 이유가 위와 같다
- Given `features/backend-monitoring.md` 3-6 / When 첫 문단을 읽는다 / Then 성공 쪽이 3-7 이라는 안내가 있다
- Given `infra/runbook.md` 4-1 알림 표 / When 결제 행을 찾는다 / Then "구독 보정 실패" 아래에 `BillingEventAlertService` · 건마다 · Slack · 즉시 · 정보 행이 있다
- Given 운영 서버 / When Sandbox 계정으로 iOS 구독 1건을 결제하고(앱의 구매 제출과 App Store `SUBSCRIBED`가 둘 다 들어온다) 앱을 다시 실행한다 / Then 채널에 `:tada: 신규 구독 · App Store · Sandbox(시험 결제) · …` 가 **한 줄만** 온다

## 처리 기록

- 2026-10-18 발행. 코드는 브랜치 `feat(be)/billing-success-slack-alert` — 유닛 테스트 `billing-payment-alert.spec.ts`(실제 결제 코드 위에서 재제출·복원·알림 재전송 시 한 번만) · `billing-event-alert.format.spec.ts` · `billing-event-alert.service.spec.ts`.
- 2026-10-19 **반영**(PR `docs(be)/apply-pending-changes-1019`). 반영 날짜 2026-10-19. `backend-monitoring.md` 3-6 첫 문단과 3-7 신설, `runbook.md` 4-1 알림 표와 "사용자 신호" 문단에 반영했다. 코드를 따라 재구독 판정을 좁혔다: 재구매로 다른 계정의 끝난 행을 넘겨받은 경우는 신규 구독으로 센다(`billing-sync.service.ts`).
