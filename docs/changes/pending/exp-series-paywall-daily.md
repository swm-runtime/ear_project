# 시리즈 유료화 — 데일리 구독자도 4편 이후를 듣는다

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/experiments-api.md` 4.2-1(열리는 사람) · 4.2-3(에러 메시지 예시) · `features/paywall.md`(시리즈 잠금 절, 통합 때) · `tickets/backend/pending/exp-series-paywall.md` 결정 절 |
| 요청자 | 박준현(테크리드) — 팀 결정 |
| 관련 | KAN-290 · KAN-294 |
| 발행 날짜 | 2026-10-30 |

## 무엇을 바꾸는가

- **열리는 사람**: "유효 티어가 **pro** 이거나 가입 체험 중" → "저장 티어가 **유료 요금제**(`plans.price_krw > 0` — 현재 daily · pro, 초대 코드 · 후기 프로모션 Pro 포함) 이거나 가입 체험 중". 무료(light)만 잠긴다.
  - 티어명이 아니라 요금제 가격으로 판정한다(`PlanService.isPaidTier`). 요금제 행이 없으면 라이트로 폴백 — 잠그는 쪽.
- **에러 메시지**: `SERIES_EPISODE_LOCKED`의 `message`를 "이 편은 프로 구독에서 들을 수 있어요" → **"이 편은 구독하면 들을 수 있어요"**. 데일리도 열리므로 특정 요금제를 말하지 않는다. 에러 코드 · HTTP 상태 · `retryable`은 그대로.
- 앱 계약 변화 없음 — 앱은 `is_locked`와 에러 코드만 본다(KAN-294). 데일리 사용자에게는 `is_locked=false`가 내려간다.

## 왜

2026-10-30 팀 결정 — 시리즈를 데일리 구독자까지 연다.

## 완료 조건

- Given 데일리 구독자 / When 시리즈 4편 재생을 요청 / Then 재생된다(재생 한도 판정은 종전대로)
- Given 데일리 구독자 / Then 시리즈 편 목록 · 상세 · 탐색 · 라이브러리의 `is_locked`가 모두 false
- Given 무료(light) 사용자 / When 4편 재생 / Then 403 `SERIES_EPISODE_LOCKED`, 메시지 "이 편은 구독하면 들을 수 있어요"
- Given 위 문서 / Then 열리는 사람이 "유료 요금제(daily · pro) 또는 체험 중"으로 적혀 있다

## 처리 기록

- 2026-10-30 발행 — 코드 반영(`feat(be)/series-paywall-daily`), 문서는 통합 때 반영.
