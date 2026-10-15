# 주간 청취 상위 % — 같은 시장 사용자끼리 비교

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-15 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 결정 2026-10-15 — KAN-188 남은 일 "주간 지표 시장 축") |
| 반영 대상 | `spec/api/profile-api.md` 4.1 `listening_top_percent` "모집단"·"계산" 항목 · `features/profile.md` 4.6 "나와의 비교" 줄("전체 상위 %" → "같은 시장 사용자 중 상위 %") |
| 코드 반영 | PR `feat(be)/weekly-top-percent-by-market` |
| 근거 | `spec/api/global-api.md` 2.1 시장 모델 |

## 수정 내용

- **모집단**: 그 주가 끝나기 전에 가입한 **같은 시장(`users.market`)의** 전체 계정. 그 주 0초인 사용자도 넣는다(종전과 같음).
- **순위**: `1 + (그 주 청취 시간이 나보다 많은 같은 시장 사용자 수)`.
- 나머지(50% 기준선·동점·`null` 조건·`listening_highlight` 우선순위)는 그대로다.

## 사유

시장마다 카탈로그와 출시 시점이 다르다. 섞으면 한쪽 시장의 규모와 청취량이 다른 쪽 사용자의 순위를 정한다 — GLOBAL 출시 초기 소수의 사용자는 KR 전체와 비교돼 늘 하위권이 되고, 반대로 KR 순위도 GLOBAL 가입자 수만큼 흔들린다. 지금은 GLOBAL 사용자가 0명이라 KR 값은 바뀌지 않는다.

## 완료 조건

- Given `profile-api.md` 4.1 / When `listening_top_percent`의 모집단·계산을 읽는다 / Then "같은 시장" 조건이 적혀 있다
- Given `features/profile.md` 4.6 / When "나와의 비교" 줄을 읽는다 / Then 상위 %가 같은 시장 사용자 기준이라고 적혀 있다

## 처리 기록

- 2026-10-15 반영 — `profile-api.md` 4.1 `listening_top_percent`(같은 시장 모집단·순위) · `features/profile.md` 4.6. 반영 전 코드와 대조함.
