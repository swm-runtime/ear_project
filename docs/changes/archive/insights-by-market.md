# 서비스 지표 요약 — 시장별 집계 `by_market`

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-14 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 — KAN-190) |
| 반영 대상 | `spec/api/admin-api.md` 4.22(응답 예시·필드 설명) |
| 코드 반영 | PR `feat(be)/insights-by-market` |
| 근거 | `spec/api/global-api.md` 4.10 |

## 수정 내용

- 4.22 응답에 `by_market[]`: `market` · `users` · `signups_in_window` · `onboarding_completed` · `active_7d` · `listeners_7d` · `listen_sec` · `plays` · `paid_active`.
- 시장마다 한 칸이다(계정이 없는 시장도 0). 각 값은 `users`·`listening.window`의 같은 이름 지표를 시장으로 나눈 것이고 현재 계정 기준이다(탈퇴 기록에는 시장이 없다).

## 남은 것

- 로그 콘솔 "서비스 지표" 탭(`features/backend-monitoring.md` 4장)에 그릴지는 콘솔 담당이 정한다 — 이 기록의 반영 대상이 아니다.

## 사유

PoC 성과를 시장별로 읽어야 한다 — 섞인 숫자는 어느 트랙이 움직였는지 말해 주지 않는다.

## 완료 조건

- Given `admin-api.md` 4.22 / When 응답 예시를 읽는다 / Then `by_market`과 필드 설명이 있다

## 처리 기록

- 2026-10-15 반영 — `admin-api.md` 4.22 응답 예시·필드 설명(`listen_sec`·`plays`는 창 기준, `active_7d`·`listeners_7d`는 지금부터 7일 — `users`의 같은 이름 지표 기준). 반영 전 코드와 대조함.
