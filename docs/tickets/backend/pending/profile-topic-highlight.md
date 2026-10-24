# [BE] 프로필 주제 한 줄(`topic_highlight`) — 안 들어본 주제 · 같은 직군 1위 · 연속 1위 · 들은 주제 수

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/profile/` — `profile.orchestrator.ts`(`buildTopicHighlight` 외) · `profile.stats.ts`(순수 판정) · `profile.types.ts` · `profile.constant.ts` · `dto/weekly-listening-response.dto.ts` / `backend/src/modules/playback/` — 범위 집계 2종(`sumListenedSecByContentForCohort` · `countListenersForCohort`) |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-24 22:41 "ㄱㄱ" |
| 담당 | 백엔드(PM 지시로 FE 세션이 PR 작성, 리뷰는 BE) |
| Jira | [KAN-266](https://runtime364.atlassian.net/browse/KAN-266) · blocks [KAN-267](https://runtime364.atlassian.net/browse/KAN-267)(FE) |
| 발행 날짜 | 2026-10-24 |
| 시작 날짜 | 2026-10-24 |
| 기한 | 2026-10-27 (Medium — +3일) |
| 선행 | 없음 |
| 근거 문서 | `features/profile.md` 4.7-1 · `spec/api/profile-api.md` 4.1 `topic_highlight` · `changes/archive/profile-topic-highlight.md` |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

PM(2026-10-24): "가장 많이 들은 주제 옆에 리텐션을 넣자 — 어떨 때는 유형이 뜨고 어떨 때는 추천이 뜨고 · 다른 사람은 어떤 주제를 많이 들었어요 · 주제를 다양하게 더 많이 듣게". 한 주제만 듣는 사용자에게 다른 주제의 문을 열고, 고루 듣는 사용자에게는 자기 청취 모양을 돌려준다. **어느 쪽을 띄울지는 서버가 청취 상태로 판정한다**(PM 선택).

## 무엇을 한다

1. 주간 응답(`weekly_listening` — 4.1 · 4.2 같은 모양)에 `topic_highlight` 추가. **이번 주에만**, 우선순위대로 하나(계약 `profile-api.md` 4.1 표):
   1. 쏠림(주제 1개 또는 1위 ≥ 60%) → `unexplored_topic`
   2. 직군 있음 · 최근 28일 같은 시장·직군 청취자(나 제외) ≥ 5 · 그 1위 ≠ 내 1위 → `peer_top_topic`
   3. 1위 2주 이상 연속(최대 8주, 가입 주까지) → `top_topic_streak`
   4. 주제 2개 이상 → `topic_count`
   5. 1에서 안 봤으면 안 들어본 주제, 없으면 `null`
2. 안 들어본 주제 후보 = 그 시장 노출 주제 − 가입 후 들은 주제 − 직접 해제한 주제. 최근 28일 같은 시장 청취 1위, 없으면 노출 순서 첫 번째.
3. 범위 집계(playback): 콘텐츠별 청취 합 · 들은 사람 수(0초 행 제외). 사용자 축은 접어 집계값만 낸다.
4. **판정 실패는 `null`** — 주간 카드·통계 섹션을 실패시키지 않는다(warn 로그 `profile topic highlight failed`).
5. 앞 순위에서 정해지면 뒤 조회는 하지 않는다.

## 범위 밖

- 지난 주 한 줄 · 요일별 한 줄 · 캐시 테이블 · 추천 스코어링 변경 · 드립 탐험 편 표시(별도 제안)

## 완료 조건

- Given 이번 주 커리어만 들었다 / When 프로필 조회 / Then `topic_highlight = { kind: unexplored_topic, … }` — 한 번도 안 들었고 해제하지 않은 노출 주제 중 최근 28일 시장 청취 1위
- Given 직접 해제한 주제 / Then 그 주제는 권하지 않는다
- Given 고루 들었고(1위 < 60%) 같은 직군 청취자 ≥ 5, 그 1위가 내 1위와 다르다 / Then `peer_top_topic`
- Given 같은 직군 청취자 4명 이하 · 직군 미입력 / Then 직군 집계를 쓰지 않는다(4명이면 순위 집계 조회도 안 함)
- Given 이번 주 1위가 지난 주도 1위 / Then `top_topic_streak`(weeks ≥ 2)
- Given 그 외 2개 이상 주제 / Then `topic_count`
- Given 지난 주(4.2) · 이번 주 기록 없음 / Then `null`
- Given 판정 중 조회 실패 / Then `topic_highlight = null`, `failed_sections`에 STATS 없음
- Given 실제 DB / Then 범위 집계가 시장·직군·나 제외·0초 제외를 지킨다(e2e `profile-topic-highlight-cohort`)

## 처리 기록

- 2026-10-24 발행(PM 22:41 "ㄱㄱ").
