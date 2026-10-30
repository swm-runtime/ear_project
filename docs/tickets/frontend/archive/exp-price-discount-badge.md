# [FE] 단기 실험 ① 구독 화면 "지금 할인 중" — 취소선 정가 표시

| 항목 | 값 |
|---|---|
| 대상 | 구독 화면(SB1) 요금제 카드 · 페이월 바텀시트(PW1)의 가격 표시 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-299](https://runtime364.atlassian.net/browse/KAN-299) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-11-01 (Medium — 3일) |
| 선행 | KAN-286(BE) — `GET /plans`의 `original_price_krw` · `is_discounted` 계약(`spec/api/experiments-api.md` 4.4, BE PR 진행 중) · 스토어 콘솔 가격 변경(사람 손, 미착수) |
| 근거 문서 | `spec/api/experiments-api.md` 4.4 · `spec/uiux/subscription-uiux.md` 4.2 · `features/subscription.md` |
| 중요도 | Medium |
| 상태 | 완료 — 반영 2026-10-29 |

> 단기 실험 8종(2026-10-29 확정) 중 ①의 FE 몫이다.

## 왜

가격 장벽을 낮춘 효과를 본다. 단순 인하가 아니라 **"원래 3,900원인데 지금 할인 중"**으로 보여 준다(2026-10-29 결정 — KAN-286 댓글). 종료일은 미정이라 표시하지 않는다. 스토어 첫 구매 할인(intro offer)은 기간을 반드시 정해야 해서 쓰지 않는다.

## 무엇을 한다

- `GET /plans`에서 `is_discounted = true`인 요금제는 **취소선 정가(`original_price_krw`, 원화 형식) + 스토어 `displayPrice` + "지금 할인 중" 배지**를 그린다.
- `is_discounted = false`이거나 필드가 없으면(옛 서버) 지금과 같다.
- 실제 결제 금액은 늘 스토어 가격이다. 취소선 정가는 서버가 준 참고값이다 — 앱에서 가격·할인을 계산하거나 티어명으로 분기하지 않는다.
- 카피("지금 할인 중" 문구·배지 모양)는 `spec/uiux/subscription-uiux.md`에 먼저 적는다(문서 수정은 `changes/pending`).
- 표시를 켜고 끄는 것은 서버 스위치다 — 실험 종료 때 앱 배포가 필요 없다.

## 범위 밖

- 종료일·카운트다운 표시.
- 스토어 첫 구매 할인(intro offer).

## 완료 조건

- Given 서버가 daily에 `is_discounted: true` · `original_price_krw: 3900`을 준다 / When 구독 화면을 연다 / Then ~~3,900원~~ 옆에 스토어 가격(1,900원)과 "지금 할인 중"이 보인다
- Given `is_discounted: false` 또는 필드 없음 / Then 지금과 같은 가격 표시다
- Given 페이월 바텀시트 / Then 같은 규칙으로 보인다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-299, KAN-286 blocks).
- 2026-10-29 반영: 브랜치 `feat(fe)/exp-price-discount-badge`. `GET /plans`의 `original_price_krw`·`is_discounted`를 모델에 옮기고(옛 서버·`false`·정가 `null` = 할인 아님), 요금제 카드(SB1 요금제 관리 · PW1 페이월 — 같은 `PlanList`)에 취소선 정가(`₩3,900`) + 스토어 `displayPrice` + [지금 할인 중](en "On sale now") 배지. 할인율·종료일 없음, 판정은 서버 값 그대로. **표기 가드**: 스토어 가격이 원화가 아니면(상품 `currency ≠ KRW`) 긋지 않는다 — 계약 표와 다른 점은 `changes/pending/exp-price-discount-badge.md`에 기록. 카피·배치는 `spec/uiux/subscription-uiux.md` 4.2·4.6·5·6장. **남은 선행: 스토어 콘솔 가격 변경(사람 손, 미착수)** — 바뀌기 전에는 스토어가 옛 가격(₩3,900)을 줘 서버 스위치를 켜면 정가와 가격이 같게 보이므로, 콘솔 가격 반영 뒤에 `PLAN_DISCOUNT_DISPLAY_ENABLED`를 켠다.
