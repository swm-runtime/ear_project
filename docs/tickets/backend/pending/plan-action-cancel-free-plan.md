# [BE] 요금제 action 에 cancel 추가 — 유료 구독자의 무료 요금제(해지 경로를 요금제 변경으로)

| 항목 | 값 |
|---|---|
| 대상 | `GET /plans` 의 `action` 판정 · `spec/api/subscription-api.md` 4.1(표는 이 티켓 발행 PR 에서 갱신 완료) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | Juyear |
| Jira | [KAN-159](https://runtime364.atlassian.net/browse/KAN-159) |
| 발행 날짜 | 2026-10-08 |
| 시작 날짜 | 2026-10-08 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | `spec/uiux/subscription-uiux.md` 4.1·4.2 · `features/subscription.md` 4.5 |
| 중요도 | Low — PM 발행(2026-10-08). 중요도 미지정이라 이번 주 마감으로 잡았다. 앱은 `cancel` 이 없으면 종전대로 동작해 막히는 일은 없다 |
| 상태 | 대기 |

## 왜

PM 2026-10-08: 요금제 관리 화면에서 다른 요금제로 갈 때는 "카드를 고르고 목록 아래 버튼 하나"를 누르는데, 해지만 이용 중 카드 안 [구독 해지] 버튼이다. 조작 문법이 둘이다. 해지도 **무료 요금제(Light) 카드를 고르고 "Light로 변경"** 으로 통일한다.

지금 서버는 유료 구독자의 무료 요금제를 `action = none`(고를 수 없음)으로 준다. 앱이 "구독 중이니 무료는 해지"라고 스스로 판정하면 "판정은 서버" 원칙(CLAUDE.md)에 어긋나서 서버 값이 필요하다.

## 무엇을 한다

`GET /plans` 의 `action` 에 **`cancel`** 을 추가한다.

- `cancel` — **유효한 구독이 있고 자동 갱신이 켜진 유료 구독자**(구독 중 `active` · 결제 문제 유예 `grace`)의 **무료 요금제**
- 계속 `none`:
  - 해지 예약(`cancel_scheduled`): 이미 해지했다. 되돌리기는 이용 중 카드의 [구독 다시 시작]이 맡는다
  - 다른 스토어 구독자: 이 기기에서 바꿀 수 없다
  - 그 플랫폼에 상품이 없는 유료 요금제
- 해지 API 는 만들지 않는다. 앱은 버튼을 누르면 스토어 구독 관리 화면을 연다(`subscription.md` 4.5).

## 앱 쪽(같은 날 dev 반영)

- `cancel` 카드는 **요금제 관리 화면에서만** 고를 수 있다. 버튼은 "{이름}로 변경"(보조 버튼), 밑에 "지금 요금제는 N월 N일까지 이용할 수 있어요"(다음 결제일).
- 서버가 `cancel` 을 주면 이용 중 카드의 [구독 해지]가 빠진다. 안 주면(이 티켓 반영 전) 종전 그대로라 해지 경로가 끊기지 않는다.
- 페이월에서는 `cancel` 카드를 고를 수 없다(`none` 과 같게 그린다). 기본 선택도 유료 카드다.

## 완료 조건

- Given 자동 갱신이 켜진 Pro 구독자 / When `GET /plans` / Then Light 는 `cancel`, Daily 는 `downgrade`, Pro 는 `current`
- Given 해지 예약 상태의 구독자 / When `GET /plans` / Then Light 는 `none`
- Given 다른 스토어 구독자 / When `GET /plans` / Then 무료·유료 모두 `none`
- Given 구독 없는 사용자 / When `GET /plans` / Then Light 는 `current`(종전 그대로)

## 처리 기록

- 2026-10-08 발행(마크다운 + Jira KAN-159). 앱·문서는 `feat(fe)/cancel-via-free-plan` PR 에서 먼저 반영.
