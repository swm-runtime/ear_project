# [BE] Android 해지 후 "정기결제 재신청" · 예약 되돌리기 QA

| 항목 | 값 |
|---|---|
| 대상 | 개발계 Play 결제(`dev.runtime.ear`) — 해지 → 재신청(RTDN 7) · 다운그레이드 예약 중 해지 · 예약 되돌리기 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현(Juyear) |
| Jira | [KAN-165](https://runtime364.atlassian.net/browse/KAN-165) |
| 발행 날짜 | 2026-10-09 |
| 시작 날짜 | 2026-10-09 |
| 기한 | 2026-10-12 |
| 선행 | 없음 — 개발계 앱 vc 34 + OTA `87f8890d`(#1310) 이후. 라이선스 테스터 계정 필요 |
| 중요도 | **Medium**(3일 안) — PM 발행(2026-10-09). 운영 결제 오픈 전에 끝나야 한다 |
| 근거 문서 | `features/subscription.md` 4.4 · `spec/api/subscription-api.md` 4.7 · `spec/uiux/subscription-uiux.md` · Google [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions) · [Replacement modes](https://developer.android.com/google/play/billing/subscriptions) |
| 상태 | 대기 |

## 왜

PM 실기기 확인(2026-10-09 03:19~03:25)에서 **Pro → Daily 예약 → Light(해지)** 뒤 Play 정기 결제 화면에 [정기결제 재신청]이 안 보였다가, 만료(03:23:49, RTDN 13) 뒤에야 보였다. 만료 뒤의 재신청은 해지 취소가 아니라 **새 결제**다.

Google 문서상:
- 해지했지만 만료 전인 구독은 [Resubscribe(정기결제 재신청)]로 해지가 취소되고 같은 구매 토큰으로 이어진다(`SUBSCRIPTION_RESTARTED` RTDN 7). 라이선스 테스터에게는 버튼이 항상 켜져 있다. "모든 앱은 Restore 를 지원해야 한다".
- DEFERRED 교체는 기존 항목의 자동 갱신을 끄고 새 항목을 대기시킨다. **"users can revert to the original plan"** — 예약을 되돌릴 수 있다고 적혀 있지만 방법은 없다. 지금 앱은 "Android 는 되돌릴 수 없다"(10-08 결정)로 만들어져 있어 이 전제부터 확인이 필요하다.

앱의 [구독 다시 시작]은 해지 예약 중 Pro 카드를 고르면 나오고, 스토어 구독 관리로 보낸다. 그 화면에 재신청이 없으면 이 버튼은 막다른 길이다.

**테스트 구독은 5분 주기라 해지 뒤 만료까지 몇 분뿐이다.** 해지 직후 바로 확인한다.

## 무엇을 한다

1. **예약 없는 해지 → 재신청**: Pro 구독 → Play 해지 → **만료 전** Play 정기 결제 화면에 [정기결제 재신청]이 보이는지 → 누르면 RTDN 7 → 서버 `active`·`is_auto_renew = true`, 앱 요금제 관리·프로필·설정이 구독 중으로 돌아오는지
2. **다운그레이드 예약 중 해지 → 재신청**: Pro → Daily 예약 → Play 해지 → 만료 전 재신청이 보이는지 · 누르면 **Daily 예약이 되살아나는지(`pending_tier = daily`) 아니면 Pro 만 이어지는지** · 서버가 그 상태를 맞게 반영하는지(`subscriptionsv2.get` 의 `lineItems`·`deferredItemReplacement` 원문을 처리 기록에 남긴다 — 토큰 원문 제외)
3. **해지 예약 중 화면**(#1310): 1·2의 만료 전 구간에 요금제 관리 Light 카드 [예약됨], 프로필·설정 "Pro · N월 N일까지 이용 · 이후 무료", 제목 밑 알림이 보이는지
4. **예약 되돌리기 가능 여부**: Pro → Daily 예약 상태에서 Play 정기 결제 화면에 요금제 변경·취소 경로가 있는지 확인한다. 앱에서 Pro 로 다시 교체 구매하는 실측은 FE 가 실측용 OTA 를 낸 뒤 이어서 한다(PM 승인 대기) — 이 티켓에서는 Play 화면·서버 상태만 본다

## 완료 조건

- Given 예약 없는 Pro 구독을 해지했다 / When 만료 전 Play 정기 결제 화면을 연다 / Then [정기결제 재신청]이 보이고, 누르면 RTDN 7 로 서버가 `active` 로 돌아온다 — 아니면 안 보이는 조건이 처리 기록에 적혀 있다
- Given Pro → Daily 예약 뒤 해지했다 / When 만료 전 재신청을 누른다 / Then 그 뒤 Play 상태(Daily 예약 유지 여부)와 서버 `pending_tier` 가 일치한다 — 결과가 처리 기록에 적혀 있다
- Given 해지 예약 중(만료 전) / When 앱 요금제 관리·프로필·설정을 연다 / Then #1310 의 표시가 보인다
- Given Pro → Daily 예약 상태 / When Play 정기 결제 화면을 본다 / Then 예약을 되돌리는 경로의 유무가 처리 기록에 적혀 있다
- 결과로 FE 수정이 필요하면 `tickets/frontend/pending/`에 따로 발행돼 있다

## 처리 기록

- 2026-10-09 발행(마크다운 + Jira KAN-165. PM 요청 — "이거 백엔드에서 QA 해달라고"). 개발계 로그(건수·시각만): 03:19:49 해지(3) → 03:23:49 만료(13), 이후 구독 3건 모두 `expired`.
