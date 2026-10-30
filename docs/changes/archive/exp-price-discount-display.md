# 요금제 할인 표시(정가 취소선 + "지금 할인 중") 계약 반영 (KAN-286)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/subscription-api.md` 4.1(`GET /plans` 응답 필드 표·예시) · `features/subscription.md`(가격 표시 규칙 — 7장 "가격 표기") |
| 요청 파트 | 백엔드 — 박준현 |
| 관련 | 원문 `spec/api/experiments-api.md` 4.4 · 티켓 `tickets/backend/pending/exp-price-discount.md` · Jira [KAN-286](https://runtime364.atlassian.net/browse/KAN-286) · FE 티켓(발행 예정) |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 없음 — 통합 과정에서 반영 |
| 선행 | 없음 |

## 왜

단기 실험 ① 가격 인하(2026-10-29)를 앱이 **할인처럼** 보여 주기로 결정했다 — 정가 취소선 + "지금 할인 중", 종료일 없음. 앱은 스토어 `displayPrice`만 알아서 정가를 서버가 준다(`original_price_krw`·`is_discounted`, 서버 스위치 `PLAN_DISCOUNT_DISPLAY_ENABLED`). 실험 기간 동안은 `experiments-api.md` 4.4가 기준이고, 통합 때 원래 계약 문서로 옮긴다.

## 수정 내용

- `spec/api/subscription-api.md` 4.1 — 응답 예시에 `original_price_krw`·`is_discounted`를 넣고, 필드 표에 두 행을 더한다(판정 규칙·옛 서버 처리·"취소선 정가는 참고값, 결제 가격은 스토어" 문장은 `experiments-api.md` 4.4 그대로). env 키 3개는 서버 내부 설정이라 계약 문서에는 "서버 스위치"로만 적고 키 이름은 `backend/.env.example`을 가리킨다.
- `features/subscription.md` 가격 표기 규칙 — "할인 표시는 서버가 `is_discounted`로 판정하고 앱은 `original_price_krw` 취소선 + 배지만 그린다. 실험 기간 한정(부당 할인 표시 위험)"을 덧붙인다.
- 반영 후 `experiments-api.md` 4.4는 "옮김 — `subscription-api.md` 4.1" 한 줄로 줄인다. 실험이 끝나 표시를 없앴다면 필드를 남길지(언제나 `false`) 제거할지 그때 정한다.

## 완료 조건

- Given 통합 반영 / When `spec/api/subscription-api.md` 4.1을 연다 / Then `original_price_krw`·`is_discounted` 필드와 판정 규칙이 있고 `experiments-api.md` 4.4와 내용이 같다
- Given 통합 반영 / When `features/subscription.md`의 가격 표기 규칙을 연다 / Then 할인 표시가 서버 판정이고 실험 기간 한정이라는 서술이 있다
- Given 통합 반영 / When `experiments-api.md` 4.4를 연다 / Then 옮긴 곳을 가리키는 한 줄만 남아 있다

## 처리 기록

- 2026-10-29 발행.
- 2026-10-30 반영 — `spec/api/subscription-api.md` 4.1(응답 예시에 두 필드 · 필드 표 두 행 · "할인 표시" 소절 — 판정 규칙 · 옛 서버 처리 · "취소선 정가는 참고값, 결제 가격은 스토어" · 실험 기간 한정. env 키 이름은 적지 않고 `backend/.env.example`을 가리킴) · 1장 "가격 표기" 행, `features/subscription.md` 7장 "국가·통화 차이" 뒤에 할인 표시 항목. `experiments-api.md` 4.4는 옮긴 곳 한 줄로 줄였다. 4.1 기본 예시의 가격(3,900 · 9,900)은 `exp-price-discount.md`(보류 — 스토어 가격 변경 전)에 맡기고, 할인 상태 예시만 실험 가격으로 적었다.
