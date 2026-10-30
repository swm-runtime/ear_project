# 구독 가격 인하 반영 — 데일리 1,900원 · 프로 3,900원 (KAN-286)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/subscription.md` 티어 표(41·42행) · `spec/uiux/subscription-uiux.md` 4.2(가격 예시) · `backend/domain.md` 8.1(표·확정 서술) · `spec/api/subscription-api.md` 응답 예시(`price_krw`) |
| 요청 파트 | 백엔드 — 박준현 |
| 관련 | 티켓 `tickets/backend/pending/exp-price-discount.md` · Jira [KAN-286](https://runtime364.atlassian.net/browse/KAN-286) · 마이그레이션 `1791800000000-LowerPaidPlanPrices` |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 없음 — 통합 과정에서 반영 |
| 선행 | 스토어 콘솔 가격 변경(사람 손, 미착수) — 스토어 가격이 바뀐 뒤에 문서를 고쳐야 문서가 실제 결제 가격과 맞는다 |

## 왜

단기 실험 ①(2026-10-29 확정)로 데일리 월 3,900 → 1,900원, 프로 월 9,900 → 3,900원으로 내린다. 기존 구독자 포함 전원 대상이다. 서버 `plans.price_krw`는 마이그레이션 `1791800000000-LowerPaidPlanPrices`가 바꾸고, 실제 결제 가격은 스토어 콘솔에서 바꾼다. 문서에 남은 옛 가격을 맞춘다.

## 수정 내용

- `features/subscription.md` 표 — daily "구독 (월 3,900원)" → "구독 (월 1,900원)", pro "구독 (월 9,900원)" → "구독 (월 3,900원)". 실험 가격이라는 점과 결정 날짜(2026-10-29, KAN-286)를 덧붙인다.
- `spec/uiux/subscription-uiux.md` 4.2 — 가격 예시 `₩3,900/월`은 표시 형식 예시라 값이 틀려도 동작에는 영향이 없다. 혼동을 막으려면 `₩1,900/월`로 바꾼다.
- `backend/domain.md` 8.1 — 표의 `daily` **3900** → **1900**, `pro` **9900** → **3900**. "유료 티어 값이 확정됐다(2026-10-02)" 문단에 "2026-10-29 실험 가격으로 인하(`1791800000000-LowerPaidPlanPrices`, KAN-286)"를 덧붙인다. 미결 표 1번(2082행)의 해소 서술은 이력이라 그대로 두거나 인하 사실만 덧붙인다.
- `spec/api/subscription-api.md` 응답 예시 — `price_krw` 3900 → 1900, 9900 → 3900.

## 문서 밖(참고 — 각 파트 담당에게 전달)

- `landing-page/src/content/site.ts`(317·331·361·470행) · `routes.ts`(93행) — 랜딩 페이지 가격 문구 3,900/9,900.
- `frontend/` 테스트·목(`subscription.mock.ts`, `PlanList.test.tsx`, `plan-catalog.test.ts`, `subscription.api.test.ts`) — 표시 값은 스토어 `displayPrice`를 쓰므로 동작에는 영향이 없다. 목 데이터를 맞출지는 FE 판단.

## 완료 조건

- Given 스토어 콘솔 가격 변경이 끝남 / When `features/subscription.md` 표를 연다 / Then daily 월 1,900원 · pro 월 3,900원이 적혀 있다
- Given `backend/domain.md` 8.1 / Then 표의 `price_krw`가 daily 1900 · pro 3900이고 인하 마이그레이션 이름이 적혀 있다
- Given `spec/api/subscription-api.md` 응답 예시 / Then `price_krw`가 1900 · 3900이다

## 처리 기록

- 2026-10-29 발행.
- 2026-10-30 **보류(pending 유지)** — 선행인 스토어 콘솔 가격 변경(사람 손)이 아직 미착수다(`tickets/backend/pending/exp-price-discount.md` 처리 기록 · `tickets/backend/pending/exp-prod-rollout-switches.md`). 이 기록의 완료 조건 첫 줄이 "스토어 콘솔 가격 변경이 끝남"이고, 먼저 고치면 문서가 실제 결제 가격과 어긋난다. 할인 표시 계약은 `exp-price-discount-display.md`로 따로 반영했다(4.1 할인 상태 예시만 실험 가격). 남은 것: 스토어 가격 변경 확인 뒤 `features/subscription.md` 티어 표 · `backend/domain.md` 8.1 · `spec/api/subscription-api.md` 4.1 기본 예시를 고친다. `spec/uiux/subscription-uiux.md` 4.2는 FE 소관이라 그 파트에 남긴다.
