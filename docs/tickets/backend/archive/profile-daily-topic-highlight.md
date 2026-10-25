# [BE] 프로필 요일 주제 한 줄(`daily_topic_highlight`) — 요일 선택 시에도 리텐션

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/profile/` — `profile.orchestrator.ts`(`buildTopicHighlights` · `buildDailyTopicHighlights`) · `profile.stats.ts`(`countTopTopicDayStreak`) · `profile.types.ts` · `profile.constant.ts` · `dto/weekly-listening-response.dto.ts` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-24 23:28 "일 선택했을 때도 리텐션 넣자" |
| 담당 | 백엔드(PM 지시로 FE 세션이 PR 작성, 리뷰는 BE) |
| Jira | [KAN-268](https://runtime364.atlassian.net/browse/KAN-268) · blocks [KAN-267](https://runtime364.atlassian.net/browse/KAN-267)(FE) · 확장 대상 [KAN-266](https://runtime364.atlassian.net/browse/KAN-266)(완료) |
| 발행 날짜 | 2026-10-24 |
| 시작 날짜 | 2026-10-24 |
| 기한 | 2026-10-27 (Medium — +3일) |
| 선행 | `tickets/backend/archive/profile-topic-highlight.md`(KAN-266) — 완료 |
| 근거 문서 | `features/profile.md` 4.7-1 · `spec/api/profile-api.md` 4.1 `daily_topic_highlight` |
| 중요도 | Medium |
| 상태 | 반영 — 개발계 배포(PR #2038), 운영은 다음 dev→main 릴리스 |

## 왜

KAN-266 은 요일 막대를 고르면 주제 한 줄을 숨겼다(주 기준 문구라). PM: 요일을 골랐을 때도 리텐션이 보여야 한다.

## 무엇을 한다

1. `weekly_listening.daily_topic_highlight` — 월~일 7칸, **이번 주에만**(지난 주·판정 실패는 7칸 `null`).
2. 그날 분포로: 그날 쏠림 → 안 들어본 주제(주간과 같은 값) > 같은 직군 1위(그날 1위와 다를 때) > **N일 연속 1위**(그 주 안 그날까지, 2일 이상, 기록 없는 날에서 끊김) > **그날 N개 주제** > (1에서 안 봤으면) 안 들어본 주제. 그날 기록 없으면 `null`.
3. 안 들어본 주제·같은 직군 집계는 주간과 **한 번만** 조회해 나눠 쓴다(처음 필요할 때).

## 완료 조건

- Given 월: 한 주제만 / Then 월 칸 = 안 들어본 주제(주간과 같은 값)
- Given 화: 3주제 고루, 1위가 월과 다름 / Then 화 칸 = `topic_count(3)`
- Given 수: 1위가 화와 같음 / Then 수 칸 = `top_topic_day_streak(2)`
- Given 기록 없는 요일 · 아직 오지 않은 요일 / Then `null`
- Given 지난 주(4.2) · 판정 실패 / Then 7칸 모두 `null`
- Given 주간과 요일이 모두 안 들어본 주제를 쓴다 / Then 노출 주제 조회는 한 번

## 처리 기록

- 2026-10-24 발행(PM 23:28).
- 2026-10-24 **반영 확인·BE 리뷰**(박준현). 코드 PR #2038(dev 머지 23:38, 개발계 배포 `d63307d7`). 리뷰 막힘 없음 — 요일 우선순위(쏠림→안 들어본 주제 · 같은 직군 1위 · N일 연속 1위(그날까지, 기록 없는 날에서 끊김) · 그날 N개 주제 · 안 들어본 주제), 미래·기록 없는 요일 `null`, 지난 주·판정 실패 7칸 `null`, 안 들어본 주제·직군 집계는 주간과 한 번만 조회(`once`). 확인: profile·playback 유닛 197 통과, e2e cohort 통과, lint·tsc 통과, 개발계 `GET /users/me/profile` 200 · `daily_topic_highlight` 7칸(본인 계정 이번 주 청취 없음 → 전부 `null`, 계약대로) · `failed_sections` 없음 · 실패 로그 0. 운영은 다음 dev→main 릴리스. 반영 날짜 2026-10-24.
