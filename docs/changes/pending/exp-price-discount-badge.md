# 할인 표시(정가 취소선 + "지금 할인 중") 화면 규칙 반영 (KAN-299)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/uiux/subscription-uiux.md` 4.2·4.6·5·6장(**이 PR에서 직접 반영** — FE 소관 화면 문서) · `spec/api/experiments-api.md` 4.4 "클라이언트 동작" 표·미결 표 · `features/subscription.md` "국가·통화 차이"(통합 때 반영) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(프론트엔드) |
| 관련 | 티켓 `tickets/frontend/archive/exp-price-discount-badge.md`([KAN-299](https://runtime364.atlassian.net/browse/KAN-299)) · 선행 BE [KAN-286](https://runtime364.atlassian.net/browse/KAN-286)(PR #2146) · 계약 변경 기록 `changes/pending/exp-price-discount-display.md` |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 없음 — 통합 과정에서 반영 |
| 선행 | `changes/pending/exp-price-discount-display.md`(계약을 `subscription-api.md` 4.1로 옮기는 기록) — 같은 통합에서 함께 반영한다 |

## 왜

단기 실험 ①(2026-10-29)의 앱 표시 — 서버가 `is_discounted = true`를 준 요금제에 취소선 정가 + 스토어 가격 + "지금 할인 중"을 그린다. 카피·배치는 `experiments-api.md` 4.4가 `spec/uiux` 소관으로 넘겼고, 화면 문서는 FE 소관이라 이 PR에서 바로 적었다(KAN-226·KAN-146 선례).

구현하며 계약에 없던 **표기 가드** 하나를 더했다: 서버 판정은 시장 무관이라 GLOBAL 스토어 계정(`$1.99`)에도 `true`가 올 수 있는데, 정가는 원화(`original_price_krw`)라 그 옆에 `₩3,900`을 그으면 뜻이 맞지 않는다. 그래서 **스토어 상품 통화가 `KRW`일 때만** 취소선을 긋는다(통화를 모르면 긋지 않는다). 할인 여부를 앱이 판정하는 것이 아니라 그릴 수 있는가만 본다 — 그래도 계약 문서의 "클라이언트 동작" 표와 다르므로 여기 적어 통합 때 맞춘다(루트 `CLAUDE.md` "문서와 충돌하는 구현은 만들지 않는다").

## 수정 내용

**이 PR에서 반영(`spec/uiux/subscription-uiux.md`)**

- 4.2 SB2 표에 "할인 표시" 행 — 취소선 정가(`₩3,900` 형식, `xs`·`textSecondary`)를 스토어 가격 위에 쌓고, 이름 옆 [지금 할인 중] 배지(면 `color.primary`·글자 `color.onPrimary`, [이용 중]과 같은 알약 크기, 연속 곡률). 이용 중 카드는 회색 단계. 카피 ko "지금 할인 중" · en "On sale now". 할인율·종료일 없음. 원화가 아닌 스토어 가격 옆에는 긋지 않는다.
- 4.6 PW1 — 할인 표시도 SB2 그대로.
- 5장 접근성 — 할인 중 카드 낭독 "정가 3,900원, 지금 {가격}, 할인 중".
- 6장 금지 — 앱이 할인을 판정하거나 할인율·종료일을 계산해 그리는 것.

**통합 때 반영**

- `spec/api/experiments-api.md` 4.4 "클라이언트 동작" 표 — 행 추가: **"`is_discounted = true`인데 스토어 가격이 원화가 아님(스토어 상품 `currency ≠ KRW`·모름) → 할인 UI 없음(표기 가드 — 정가가 원화라서)"**. 미결 표의 "4.4 '지금 할인 중' 카피·취소선 배치" 행은 "`spec/uiux/subscription-uiux.md` 4.2에 확정(2026-10-29 — KAN-299)"으로 닫는다. 계약을 `subscription-api.md` 4.1로 옮기는 경우(`exp-price-discount-display.md`) 이 행도 함께 옮긴다.
- `features/subscription.md` "국가·통화 차이" — "할인 표시(정가 취소선)는 서버 `is_discounted` 판정 그대로 그리되, 정가가 원화라 **스토어 가격이 원화일 때만** 긋는다(KAN-299). 화면 규칙은 `spec/uiux/subscription-uiux.md` 4.2"를 덧붙인다.

## 완료 조건

- Given 이 PR 머지 / When `spec/uiux/subscription-uiux.md` 4.2를 연다 / Then "할인 표시" 행에 취소선 정가 형식·배지 모양·카피(ko·en)·원화 가드가 있고, 5장에 할인 중 낭독 문장이 있다
- Given 통합 반영 / When `spec/api/experiments-api.md` 4.4(또는 옮겨 간 `subscription-api.md` 4.1)의 클라이언트 동작 표를 연다 / Then "스토어 가격이 원화가 아니면 할인 UI 없음" 행이 있고, 미결 표의 카피·배치 행이 닫혀 있다
- Given 통합 반영 / When `features/subscription.md` "국가·통화 차이"를 연다 / Then 할인 표시가 서버 판정이고 원화 스토어 가격에만 그린다는 서술이 있다

## 처리 기록

- 2026-10-29 발행. `spec/uiux/subscription-uiux.md`는 KAN-299 PR에서 반영 — 남은 것은 "통합 때 반영" 두 항목.
