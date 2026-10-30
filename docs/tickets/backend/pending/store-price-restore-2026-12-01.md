# [BE] 11월 가격 할인 종료 — 12-01 스토어 가격 원복 · plans.price_krw 되돌림

| 항목 | 값 |
|---|---|
| 대상 | App Store Connect · Play Console 운영 구독 상품(대한민국) · `plans.price_krw` · 운영 env `PLAN_DISCOUNT_*` |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-303](https://runtime364.atlassian.net/browse/KAN-303) |
| 발행 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-30 |
| 기한 | 2026-12-01 (Lowest — 할인 종료일) |
| 선행 | KAN-286 운영 가격 인하(10-31~11-01, 사람 손 — 미착수) |
| 근거 문서 | `tickets/backend/pending/exp-price-discount.md` · `changes/pending/exp-price-discount.md` · `tickets/backend/pending/exp-prod-rollout-switches.md` |
| 중요도 | Lowest |
| 상태 | 발행 |

## 왜

11월 한 달 기간 한정 할인(KAN-286, 2026-10-30 결정 — 데일리 1,900 · 프로 3,900원, 대한민국만, 누가 사도 그 가격)이 12-01에 끝난다. 스토어 콘솔에 가격 예약 기능이 없어(App Store도 화면에서 예약이 보이지 않았다) 그날 **직접 올린다**. 앱의 할인 표시는 서버 `PLAN_DISCOUNT_ENDS_AT=2026-12-01T00:00:00+09:00`이 자동으로 끈다(#2197).

## 무엇을 한다 (12-01)

1. App Store Connect — 운영 데일리 · 프로 상품, **대한민국만** ₩1,900 → ₩3,900 · ₩3,900 → ₩9,900. 인상 때 "기존 구독자 가격 유지" 여부를 고른다(11월 구매자를 할인가로 둘지 — 미결).
2. Play Console — 운영 데일리 · 프로 기본 요금제, 대한민국만 같은 값으로 원복(새 구독자부터 적용).
3. 개발계 `dev.` 상품도 원복(2026-10-30 테스트용으로 내려 둠).
4. 운영 앱 구독 화면에서 "지금 할인 중" · 정가 취소선이 사라졌는지 확인.
5. `plans.price_krw`를 daily 3,900 · pro 9,900원으로 되돌리는 마이그레이션(참고값 — 앱은 스토어 가격을 그린다). 머지하면 `changes/pending/exp-price-discount.md`를 archive로 옮기고 KAN-286을 완료로 넘긴다.
6. 운영 env `PLAN_DISCOUNT_*` 정리 — 꺼도 되고 그대로 둬도 종료 시각 뒤라 표시가 없다(KAN-300).

## 완료 조건

- Given 2026-12-01 이후 / When 운영 앱 구독 화면을 연다 / Then 데일리 ₩3,900 · 프로 ₩9,900이 보이고 할인 표시가 없다
- Given `plans` 표 / Then daily 3,900 · pro 9,900
- Given 개발계 `dev.` 상품 / Then 대한민국 가격이 원래대로다

## 처리 기록

- 2026-10-30 발행(마크다운 + Jira KAN-303, KAN-286이 선행).
