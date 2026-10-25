# [FE] 프로필 "가장 많이 들은 주제" 옆 주제 한 줄 — 안 들어본 주제 탭 → 탐색 주제 목록

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/profile/` — `api/profile.dto.ts`·`profile.api.ts`·`profile.mock.ts`(`topic_highlight` 변환) · `profile.types.ts` · `components/TopicDonut.tsx`(헤드라인 옆 한 줄) · `profile.copy.ts`(ko·en) · 프로필 화면(요일 선택 중 숨김·탭 이동) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-24 22:41 "ㄱㄱ" ("아래가 아니라 옆") |
| 담당 | 프론트엔드 |
| Jira | [KAN-267](https://runtime364.atlassian.net/browse/KAN-267) · is blocked by [KAN-266](https://runtime364.atlassian.net/browse/KAN-266)(BE) |
| 발행 날짜 | 2026-10-24 |
| 시작 날짜 | 2026-10-24 |
| 기한 | 2026-10-27 (Medium — +3일) |
| 선행 | `tickets/backend/pending/profile-topic-highlight.md`(KAN-266) — **실기기 확인만** 그 배포 뒤. 코드는 필드가 없어도 안 깨지게 먼저 나간다 |
| 근거 문서 | `features/profile.md` 4.7-1 · `spec/uiux/profile-uiux.md` 4.6 "주제 한 줄" · `spec/api/profile-api.md` 4.1 `topic_highlight` |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

PM(2026-10-24): 주제 쪽 리텐션 — "가장 많이 들은 주제 옆에", 상태에 따라 유형·추천·다른 사람 1위가 번갈아 뜨게. 판정은 서버(KAN-266), 화면은 그리기만.

## 무엇을 한다

1. DTO·타입·mock: `weekly_listening.topic_highlight`(4 kind) 변환. 필드 없음·`null` → 그리지 않음.
2. `TopicDonut` 헤드라인 줄: 왼쪽 "커리어 38%" 한 줄 그대로, **오른쪽 정렬 보조 글씨 최대 2줄**(말줄임). 큰 글씨면 헤드라인 아래로.
3. 문구 ko·en(uiux 표). 안 들어본 주제만 버튼(44pt) → `navigation.navigate('Main', toTab('Explore', { applyTopicId }))`. 낭독 라벨·힌트.
4. 요일 막대 선택 중 숨김. 이번 주만(서버가 지난 주엔 `null`).
5. 분석 `profile_topic_highlight_tap { kind }`.
6. 테스트: 변환(4 kind · null · 필드 없음) · 문구 · 탭 이동 · 요일 선택 숨김. ko 스냅샷.

## 완료 조건

- Given 서버가 `unexplored_topic(심리학)` / When 프로필 / Then 헤드라인 옆 "안 들어본 주제 · 심리학 ›", 탭하면 탐색이 심리학 목록으로 열린다
- Given `peer_top_topic(경제)` / Then "같은 직군 1위 · 경제", 탭해도 아무 일 없음
- Given `top_topic_streak(3)` / Then "3주 연속 1위". Given `topic_count(4)` / Then "이번 주 4개 주제"
- Given `null` · 필드 없는 서버 / Then 아무것도 없고 헤드라인은 그대로
- Given 요일 막대 탭 / Then 한 줄이 숨고, 해제하면 돌아온다. Given 지난 주로 이동 / Then 없음
- Given 긴 주제명 / Then 헤드라인은 한 줄 유지, 옆 한 줄은 2줄 안에서 말줄임. Given 큰 글씨 / Then 헤드라인 아래 한 줄
- Given 영어 / Then "New to you · {name} ›" 등
- Given 실기기(개발계) / Then 위가 보인다 — KAN-266 개발계 배포 뒤

## 처리 기록

- 2026-10-24 발행(PM 22:41 "ㄱㄱ").
- 2026-10-24 **코드 반영** — 브랜치 `feat(fe)/profile-topic-highlight`:
  - DTO·타입·변환 `toTopicHighlight`(4종 · `null` · 필드 없음 · 모르는 kind → 그리지 않음). mock 은 이번 주에만, 시나리오 `topic-peer`·`topic-streak`·`topic-count`(기본 안 들어본 주제 "역사").
  - `TopicDonut` 헤드라인 줄을 가로로: 왼쪽 "커리어 38%"(옆 한 줄이 있으면 최대 62%, 한 줄 말줄임), 오른쪽 끝 보조 글씨 `sm` 최대 2줄. 글자 크기 1.5배 이상이면 헤드라인 아래 왼쪽 정렬(요약 3지표와 같은 기준).
  - 낭독 구조 변경: 종전엔 몸통 전체가 한 요소(목록 낭독)라 옆 버튼이 묻힌다 → 헤드라인이 목록 전체를 읽고 막대·줄은 숨김, 옆 한 줄은 따로(안 들어본 주제는 버튼 + 힌트).
  - 안 들어본 주제 탭 → `toTab('Explore', { applyTopicId })` + `profile_topic_highlight_tap { kind: unexplored }`(`analytics.md` 3.4 프로필 표 신설).
  - 화면: 고른 주 분포 갈래에서만 넘긴다 — 요일 선택 중·전체 기간 대체 분포에는 없음.
  - 테스트: 변환 · 문구 · 컴포넌트(버튼 탭 id · 표시 전용 · 없음 · 낭독 분리). ko 스냅샷 갱신. tsc·eslint·jest 991 통과.
  - **남은 것: 개발계 실기기**(BE #2035 dev 머지 `828c025c` · 개발계 배포 진행 중). 확인되면 이 md 와 BE md 를 `archive/`로, Jira KAN-266·267 완료.
- 2026-10-24 23:28 **범위 추가**(PM "일 선택했을 때도 리텐션 넣자") — 요일 막대를 고르면 숨기던 것을 **그날의 한 줄**(`daily_topic_highlight[요일]`, BE [KAN-268](https://runtime364.atlassian.net/browse/KAN-268))로 바꾼다. 문구 "N일 연속 1위" · "그날 N개 주제"(+ en). 완료 조건의 "요일 막대 탭 → 숨는다"는 "그날 한 줄로 바뀐다(그날 값 없으면 없음)"로 읽는다.
