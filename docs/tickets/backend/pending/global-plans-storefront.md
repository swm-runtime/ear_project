# [BE] 글로벌 6 — GLOBAL 요금제 행·`GET /plans` 시장 필터·`price_krw` null·스토어 `storefront/currency/price` 저장

| 항목 | 값 |
|---|---|
| 대상 | `plans.market` · GLOBAL 행 2개(Daily/Pro) · `GET /plans` · `subscriptions`·`store_notification_logs`의 `storefront`·`currency`·`price` · Apple/Play 영수증 파서 · `subscription-api.md` 4.1·4.4(changes) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-192](https://runtime364.atlassian.net/browse/KAN-192) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-19 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) `global-catalog-isolation.md` · 사람 손: **GLOBAL 스토어 상품 ID 확정**(박준현 — App Store Connect·Play Console에 상품 생성, 미결 #4) |
| 관련 | FE [KAN-196](https://runtime364.atlassian.net/browse/KAN-196) 요금제 화면이 이 응답을 쓴다 |
| 근거 문서 | **`spec/api/global-api.md` 4.6 · 8장 `plans`·`subscriptions` 행 · 9장 미결 #4** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | **보류** (2026-10-14 — PoC에 필수 아님. 아래 "보류 사유") |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `plans.market`(DEFAULT `kr`) 추가, GLOBAL 행 2개(Daily/Pro) 신규 — 영어 `name`·`description`, 별도 `store_product_id_*`, `price_krw` NULL.
- `GET /plans`를 `users.market`으로 필터. GLOBAL 응답은 `price_krw: null`(필드는 유지 — 스토어의 3.1.x 앱이 읽는다). `action` 판정은 종전 그대로.
- Apple 거래 `storefront`·`price`·`currency`, Play `regionCode`·가격을 `subscriptions`·`store_notification_logs`에 저장(응답값 그대로, 환산 없음).
- 구독 행은 시장을 가지지 않는다(결제는 스토어 국가 기준). 초대 코드는 변경 없음.
- `subscription-api.md` 4.1·4.4 개정 요청(changes/pending).

## 범위 밖

가격 책정(스토어) · 시장 전환 시 구독 이전(불허라 없음)

## 완료 조건

- Given GLOBAL 계정 / When `GET /plans` / Then GLOBAL 행만, `price_krw`가 전부 `null`, `store_product_id_*`가 GLOBAL 상품
- Given KR 계정 / Then 종전 응답과 동일(회귀)
- Given 미국 스토어 영수증 / When 반영 / Then `subscriptions.storefront = "USA"`, `currency = "USD"`, `price` 저장
- Given 초대 코드 등록 / Then 시장 무관 종전 동작

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.

## 보류 사유 (2026-10-14 박준현)

- **스토어 상품을 따로 만들 필요가 없다.** App Store·Play에 기존 구독 상품(Daily·Pro)의 **전 세계 현지 가격이 이미 설정돼 있다.** 해외 사용자도 같은 상품 ID로 현지 통화 결제를 하므로, 이 티켓의 핵심(GLOBAL 전용 요금제 행·별도 `store_product_id`)이 PoC에 필요 없다.
- 앱은 가격을 스토어 SDK의 현지가(`displayPrice`)로 그린다(FE KAN-196). 서버의 `price_krw`는 KR 참고값이라 해외 사용자 화면에 쓰이지 않으면 문제가 없다.
- 요금제 이름·설명이 한국어인 점은 FE가 영어 리소스로 보여 주거나(티어 키 기준), 나중에 시장별 행을 둘 때 함께 정리한다.

## 남은 결정 항목 (재개 조건)

- 해외에 **다른 가격·다른 혜택**(예: Daily 없이 Pro만)을 둘 때 → 별도 상품 + `plans.market` 필요, 이 티켓 재개.
- 결제의 국가·통화 분석이 필요해질 때 → `subscriptions.storefront/currency/price` 저장 부분만 떼어 재개.
- 해외 사용자 화면에 서버의 `plans.name`이 한국어로 보이는 문제가 FE 리소스로 해결되지 않을 때.

- 2026-10-14 보류. Jira KAN-192 같은 날 보류 댓글.
- 2026-10-16 **재개 조건 3번에 해당하는 부분만 처리** — 보류할 때의 가정("요금제 이름·설명은 FE가 영어 리소스로")이 틀렸다. 앱(`PlanList.tsx`)은 서버 `plans.name`·`description`을 그대로 그려 GLOBAL 사용자에게 한국어 설명·"무료 체험"이 보였다. PR `feat(be)/plan-text-by-market`:
  - `plans.name_en`·`description_en` 추가(마이그레이션 `1790400000000`, 현행 4개 티어 영어 문구 채움).
  - `planTextOf(plan, market)` — 시장의 언어로 고른다(GLOBAL 영어, KR 종전). `GET /plans`와 요금제 카드(`buildPlanView` — 설정·프로필·구독 상태의 현재·예약·지급 요금제 이름)가 이 한 곳을 쓴다. 앱 변경 없음.
  - 문서 `changes/pending/plan-text-by-market.md`.
  - 나머지(GLOBAL 전용 가격·상품, 결제 국가·통화 저장)는 보류 그대로다. 스토어 상품 이름의 영어 현지화는 콘솔 작업(박준현)이다.
