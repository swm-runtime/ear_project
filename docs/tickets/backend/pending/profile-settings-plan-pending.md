# [BE] 프로필·설정 plan 에 pending_plan 추가 — 다운그레이드 예약을 요약 줄에 표시

| 항목 | 값 |
|---|---|
| 대상 | 프로필·설정 `plan` 조립 함수 · `spec/api/profile-api.md` 4.1(이 티켓 발행 PR 에서 갱신 완료) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | Juyear |
| Jira | [KAN-161](https://runtime364.atlassian.net/browse/KAN-161) |
| 발행 날짜 | 2026-10-08 |
| 시작 날짜 | 2026-10-08 |
| 기한 | 2026-10-11 (Medium — 3일 안, 운영 결제 오픈 전) |
| 선행 | 없음 |
| 근거 문서 | `spec/api/subscription-api.md` 4.2(`pending_plan`) · `spec/uiux/settings-uiux.md` 4.1 · `spec/uiux/profile-uiux.md` 4.2 |
| 중요도 | Medium — 결제 오픈 전에 프로필·설정이 예약을 보여야 한다 |
| 상태 | 대기 |

## 왜

PM 2026-10-08: "Pro 했다가 다른 요금제로 바꾸면 해당 날짜까지 이용이라고 프로필이나 설정에 보이게 해야지."

- 해지(Pro → Light)는 이미 `plan.status = cancel_scheduled` + `expires_at` 으로 "Pro · N월 N일까지 이용 가능"이 뜬다.
- **다운그레이드 예약(Pro → Daily)은 프로필·설정의 `plan` 에 정보가 없어서** "Pro · 다음 결제일 N월 N일"만 보인다. 예약은 `GET /users/me/subscription` 의 `pending_plan` 에만 있다.

## 무엇을 한다

프로필(`GET /users/me/profile`)·설정(`GET /users/me/settings`)의 `plan`(같은 조립 함수)에 **`pending_plan`** 을 추가한다.

- 모양은 `subscription-api.md` 4.2 의 `pending_plan` 과 같다: `{ tier, plan_name, effective_at }`. 예약이 없으면 `null`.
- 판정 기준은 구독 응답과 같은 값(`subscriptions.pending_tier` 등)이다. 두 응답이 다른 판정을 내리지 않게 같은 함수를 쓴다.

## 앱 쪽 (같은 날 dev 반영)

- 필드가 있으면 요약 줄이 "Pro · N월 N일까지 이용 · 이후 Daily".
- 없으면(이 티켓 반영 전) 종전 그대로. 선택 필드로 받아서 깨지지 않는다.

## 완료 조건

- Given Pro → Daily 예약 / When `GET /users/me/profile`·`/settings` / Then `plan.pending_plan = { tier: daily, plan_name: Daily, effective_at: 다음 갱신 시각 }`
- Given 예약 없음 / When 같은 조회 / Then `plan.pending_plan = null`
- Given 예약된 날짜가 지나 갱신됨 / When 같은 조회 / Then `plan.tier = daily`, `pending_plan = null`

## 처리 기록

- 2026-10-08 발행(마크다운 + Jira KAN-161). 앱·문서는 `feat(fe)/plan-summary-pending-change` PR 에서 먼저 반영.
