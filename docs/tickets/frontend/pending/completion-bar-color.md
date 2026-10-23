# [FE] 라이브러리 카드 진행 바 — 들은 부분과 전체 바의 색 차이가 너무 적다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/library/components/LibraryItemTile.tsx`(`progressTrack`·`progressFill`) · `frontend/src/shared/theme/palette.ts`(`progress` 토큰) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현 |
| 담당 | 이주호 |
| Jira | [KAN-263](https://runtime364.atlassian.net/browse/KAN-263) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | 없음 |
| 근거 문서 | `frontend/design.md`(색 토큰) |
| 중요도 | Medium |
| 상태 | 발행 |

## 증상 (2026-10-23 박준현, Android dev 빌드)

라이브러리 카드의 진행 바에서 **들은 부분(채움)과 전체 바(트랙)의 색 차이가 너무 적어** 얼마나 들었는지 알아보기 어렵다.

## 원인

트랙 = 흰색 35%(`rgba(255,255,255,0.35)`), 채움 = 회색 `#8E8E93`(`palette.progress`). 사진 위에서 둘이 거의 같은 밝기로 보인다.

## 무엇을 한다

채움과 트랙의 대비를 키운다 — 색 값은 FE 판단(`palette.ts` 토큰에서만, 밝은·어두운 모드 둘 다).

## 완료 조건

- Given 듣는 중(50%) 카드 / When 본다 / Then 들은 부분과 남은 부분이 한눈에 구분된다(밝은 사진·어두운 사진 모두)
- Given 어두운 모드 / Then 같다

## 처리 기록

- 2026-10-23 발행(박준현 — "듣는 중일 때 전체 바 색깔하고 들은 거 색깔 차이가 너무 안 난다").
