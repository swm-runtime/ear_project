# `GET /plans` 무료 여부 필드 `is_free` — 계약 문서 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/subscription-api.md` 4.1(응답 예시·필드 표) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-18 |
| 관련 | KAN-226 · 티켓 `tickets/backend/archive/plans-is-free-field.md` · 브랜치 `feat(be)/plans-is-free` |

## 배경

앱이 `price_krw` 의존을 걷어낸 뒤(KAN-196), 앱은 무료 요금제를 `store_product_id`·`action`으로 추정했다. 그런데 다른 스토어 구독자에게는 무료 행과 "이 플랫폼에 상품이 없는 유료 행"이 둘 다 `action: none`·상품 없음이라 구별되지 않는다. 그래서 무료 판정을 서버가 내려 준다.

## 수정 내용

`subscription-api.md` 4.1 응답 예시의 각 `plans[]` 항목 `price_krw` 다음에 `"is_free"`를 넣는다. Light는 `true`, Daily·Pro는 `false`다.

필드 표에 다음 행을 추가한다.

| 필드 | 설명 |
|---|---|
| `is_free` | 무료 요금제인가 — **서버가 판정한다.** 요금제 정의의 가격(`plans.price_krw`)이 0 이하면 `true`다. 티어 이름으로 가르지 않는다. 시장·플랫폼·구독 상태와 무관하다. 앱은 "무료" 표시를 이 값으로 한다(`store_product_id`·`action`으로 추정하지 않는다). 추가 필드라 옛 앱은 무시한다 |

## 범위 밖

- 프로필·설정·구독 상태의 요금제 표시(`buildPlanView`)에는 넣지 않았다. 그 객체는 "지금 쓰는 요금제" 하나를 가리키고, 무료는 이미 `status: free`로 나간다. 비교 카드의 무료 표시 문제는 `GET /plans`에만 있었다.

## 완료 조건

- Given `subscription-api.md` 4.1 / When 응답 예시와 필드 표를 읽는다 / Then `is_free`(가격 0 이하 = 무료, 시장·플랫폼·구독 상태 무관)가 위와 같다

## 처리 기록

- 2026-10-18 발행. 코드는 `isFreePlan`(`billing.orchestrator.ts`) 한 곳에서 판정하며, 같은 판정을 쓰던 결제 의도 거부와 `action` 판정도 이 함수로 모았다.
- 2026-10-19 **반영**(PR `docs(be)/apply-pending-changes-1019`). 반영 날짜 2026-10-19. `subscription-api.md` 4.1 응답 예시와 필드 표(`is_free`, 기존 표 머리글 "의미"에 맞춤)에 반영했다.
