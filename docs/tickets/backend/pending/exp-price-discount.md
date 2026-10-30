# [BE] 단기 실험 ① 구독 가격 인하 — 베이직(데일리) 1,900원 · 프로 3,900원

| 항목 | 값 |
|---|---|
| 대상 | App Store Connect · Play Console 구독 상품 가격 · `plans.price_krw` |
| 요청 파트 | 백엔드(운영) |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-286](https://runtime364.atlassian.net/browse/KAN-286) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | 없음 (스토어 콘솔 가격 변경은 이 티켓 안에서 한다 — 사람 손 작업, 미착수) |
| 근거 문서 | `features/subscription.md` 표 · `spec/uiux/subscription-uiux.md` 4.2 · `backend/domain.md` 8.1 |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

가격 장벽을 낮췄을 때 유료 전환이 오르는지 본다. 앱은 스토어 가격(`displayPrice`)만 보여 주고 서버 `plans.price_krw`는 참고값이라(`subscription.md`), 실제 가격은 스토어 콘솔에서 정해진다. "베이직"은 코드상 `daily` 티어다.

## 무엇을 한다

- App Store Connect · Play Console에서 daily 3,900원 → 1,900원, pro 9,900원 → 3,900원으로 변경(상품 id는 그대로).
- `plans.price_krw`를 새 가격에 맞추는 데이터 마이그레이션, 플랜 `name`·`description`에 가격 문구가 있으면 함께 점검.
- 변경 시각을 처리 기록에 남긴다 — 전후 전환율 비교의 기준점이다.
- 문서 수정은 `changes/pending`에 기록(`subscription.md` 표의 3,900/9,900).

## 결정 (2026-10-29)

- 기존 구독자 포함 모두 인하한다 — 스토어 결제 구독자가 없어 영향이 없다. 스토어의 "기존 구독자 가격 유지"를 고르지 않는다.

## 범위 밖

- 정가 취소선 같은 할인 표시 — 스토어 첫 구매 할인(intro offer)과 FE 작업이 필요하다. 하기로 하면 별도 티켓.
- 가격 동시 A/B — 상품 id 추가와 사용자별 상품 매핑이 필요하다(L).

## 완료 조건

- Given 스토어 가격 변경이 반영됨 / When 앱 구독 화면을 연다 / Then daily 1,900원 · pro 3,900원이 표시된다
- Given 샌드박스 계정 / When 새 가격으로 구독한다 / Then 서버 검증이 통과하고 티어가 반영된다
- Given 운영 DB / Then `plans.price_krw`가 새 가격과 같다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-286).
- 2026-10-29 결정 반영(Jira 댓글).
- 2026-10-29 서버 데이터 마이그레이션 PR(`1791800000000-LowerPaidPlanPrices` — `plans.price_krw` daily 1900 · pro 3900, `name`·`description`에는 가격 문구가 없어 그대로) — 스토어 콘솔 가격 변경(사람 손)은 미착수. 문서 반영은 `changes/pending/exp-price-discount.md`.
- 2026-10-29 결정 변경: 기본 가격 인하 + 앱 '지금 할인 중' 표시(취소선 정가) — 서버가 정가·할인 여부를 준다(스위치 PLAN_DISCOUNT_DISPLAY_ENABLED). 스토어 첫 구매 할인은 기간 필수라 쓰지 않는다. BE PR #2146
- 2026-10-30 결정 변경: **11월 한 달 기간 한정 할인** — 스토어 가격을 11월 동안 1,900 · 3,900원으로 내렸다가 12-01에 3,900 · 9,900원으로 되돌린다(기간 중 구매자 누구나). 서버: `PLAN_DISCOUNT_ENDS_AT`(이 시각부터 할인 표시 자동 꺼짐 — 경계에 배포 불필요). 남은 일: 스토어 콘솔에서 11월 가격 예약(사람 손) · 운영 env(`PLAN_DISCOUNT_*` + `PLAN_DISCOUNT_ENDS_AT=2026-12-01T00:00:00+09:00`) · 12-01 뒤 `plans.price_krw` 되돌림 마이그레이션.
