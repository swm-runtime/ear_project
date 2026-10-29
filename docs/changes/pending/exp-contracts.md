# 단기 실험 계약(`spec/api/experiments-api.md`)을 화면 문서로 옮기기

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/onboarding-api.md` 4.8 · `spec/api/player-api.md` 4.1·4.2·4.4·4.7·에러 표 · `spec/api/explore-api.md` 4.1·4.2·4.2-1·4.5·4.7 · `spec/api/content-detail-api.md` 4.1 · `spec/api/library-api.md` 4.1 · `features/common-error-handling.md` 에러 코드 표 · `features/paywall.md` 4.1 · `features/drip-scheduling.md` 4.2 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 계약 원본 `spec/api/experiments-api.md` |
| 중요도 | Low — 실험 기간에는 `experiments-api.md`가 기준이다 |

## 배경

단기 실험 ⑧(KAN-292 ↔ KAN-295)·⑤(KAN-290 ↔ KAN-294)는 FE가 BE 계약을 기다린다. 화면 문서 여러 곳을 한꺼번에 고치는 대신 실험 계약을 한 문서로 먼저 냈다. 통합 때 아래로 옮긴다.

## 고칠 내용

1. `onboarding-api.md` 4.8 — 응답에 `first_content_id`(uuid | null, `completed`일 때만) · 선정 규칙(첫 드립 편 중 짧은 편 먼저, 지움·재생함·회수 제외) · 클라이언트 동작 표
2. `player-api.md` — 4.1·4.2·4.4·4.7 에러 표와 4.9 공통 표에 `SERIES_EPISODE_LOCKED` 403(retryable false, 차감 없음, 한도보다 먼저)
3. `explore-api.md`·`content-detail-api.md`·`library-api.md`·`player-api.md` 4.8 — 콘텐츠 객체에 `is_locked`(boolean)
4. `common-error-handling.md` 에러 코드 표에 `SERIES_EPISODE_LOCKED`
5. `paywall.md` 4.1 — 시리즈 4편부터 프로·체험만(무료 편수 `SERIES_FREE_EPISODES`, 스위치 `SERIES_PAYWALL_ENABLED`)
6. `drip-scheduling.md` 4.2 — 시리즈 연속 편이 잠긴 편을 비프로에게 주지 않는다

## 완료 조건

- Given 위 문서들 / When 각 절을 읽으면 / Then `experiments-api.md` 4.1·4.2와 같은 필드·에러·규칙이 적혀 있고, `experiments-api.md`는 "통합됨"으로 표시되거나 지워져 있다

## 처리 기록

- 2026-10-29 발행.
