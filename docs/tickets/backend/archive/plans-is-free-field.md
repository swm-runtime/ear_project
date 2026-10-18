# [BE] `GET /plans` 요금제에 무료 여부 필드(`is_free`) 추가

| 항목 | 값 |
|---|---|
| 대상 | `GET /plans` 응답 `plans[]` · `subscription-api.md` 4.1 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — FE KAN-196 처리 중 발견 |
| 담당 | 박준현 |
| Jira | [KAN-226](https://runtime364.atlassian.net/browse/KAN-226) · 관련 FE [KAN-196](https://runtime364.atlassian.net/browse/KAN-196) |
| 발행 날짜 | 2026-10-18 |
| 시작 날짜 | 2026-10-18 |
| 기한 | 2026-10-21 (Medium — 발행+3일) |
| 선행 | 없음 |
| 근거 문서 | `spec/api/subscription-api.md` 4.1 · `features/subscription.md` 4.2-1 · FE KAN-196 2026-10-15 코멘트 |
| 중요도 | Medium |
| 상태 | 반영 |

## 왜

앱은 KAN-196에서 `price_krw` 의존을 걷어냈다(GLOBAL 사용자에게 원화 값이 의미가 없다). 그 뒤로 **"이 요금제가 무료인가"를 직접 알려 주는 필드가 응답에 없다.** 그래서 앱은 지금 `store_product_id === null` + `action`(`current`·`cancel`)으로 무료를 추정한다.

문제는 `action: none`일 때다. `none` + 상품 없음은 두 경우가 섞인다.

- 무료 요금제(다른 스토어 구독자에게 보이는 Light)
- 이 플랫폼에 상품이 없는 유료 요금제

앱이 둘을 구별할 수 없어서, **다른 스토어에서 구독한 사용자의 Light 카드에서 "무료" 글자가 빠진다.** 무료 판정은 서버가 해야 한다(CLAUDE.md 공통 원칙 — 클라이언트는 표시만).

## 무엇을 한다

- `GET /plans`의 각 `plans[]` 항목에 **`is_free: boolean`**을 추가한다. 값은 서버가 요금제 정의(예: 가격 0 또는 무료 티어 플래그)로 판정한다 — 판정 기준은 BE가 정한다.
- 같은 요금제 카드를 조립하는 곳(`buildPlanView` 등 — 설정·프로필·구독 상태의 요금제 표시)에서도 필요하면 같은 값을 준다. 범위는 BE 판단.
- `subscription-api.md` 4.1 응답 예시·필드 표에 `is_free`를 적는다.
- **추가 필드라 옛 앱(1.2.x)은 무시한다.** 호환 분기 불필요.

## 범위 밖

- 앱 반영 — 필드가 dev에 나오면 FE가 `is_free`를 우선 쓰고, 없으면 지금 추정 로직으로 폴백한다(FE 후속, KAN-196 코멘트로 추적).
- 가격 표기(여전히 스토어 `displayPrice`).

## 완료 조건

- Given 유료 구독이 없는 KR 계정 / When `GET /plans?platform=ios` / Then Light 항목 `is_free = true`, Daily·Pro `is_free = false`
- Given Android에서 구독한 계정 / When `GET /plans?platform=ios` / Then 모든 항목 `action = none`이고 Light만 `is_free = true`
- Given GLOBAL 계정 / Then 같은 판정(시장 무관)
- Given 기존 필드 / Then 종전 값 그대로(회귀)

## 처리 기록

- 2026-10-18 발행(마크다운 + Jira). PM 결정 "BE에 요청".
- 2026-10-18 **반영**(PR `feat(be)/plans-is-free`). 반영 날짜 2026-10-18.
  - `GET /plans`의 `plans[]`에 `is_free: boolean`을 추가했다. 판정은 요금제 가격 0 이하이고(`isFreePlan`), 티어 이름으로 가르지 않는다. 같은 판정을 쓰던 결제 의도 거부와 `action` 판정도 이 함수로 모았다(동작 불변).
  - `buildPlanView`(프로필·설정)에는 넣지 않았다. 지금 요금제 하나를 가리키고, 무료는 이미 `status: free`로 나가기 때문이다.
  - 계약 문서 반영은 `changes/pending/plans-is-free.md`로 넘겼다.
  - 검증: 단위 테스트로 완료 조건 4개(KR 무구독 · 다른 스토어 구독자 iOS 목록 · GLOBAL · 기존 필드 회귀)를 확인했다. E2E `subscription-billing`의 요금제 목록에 `is_free`를 넣어 대조했고, `global-market`과 함께 17개 통과했다.

