# [FE] 담지 않은 편 완청·담기 뒤 화면 상태 맞추기 — 진행 저장 `is_completed` · 담기 응답 `status`

| 항목 | 값 |
|---|---|
| 대상 | `features/player/services/playback.service.ts`(재조회 신호) · `features/explore` — `hooks/useExploreScreen.ts` · `hooks/useSeriesScreen.ts`(담기 낙관 반영) · 분석 이벤트 `content_save` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(BE) — 2026-10-23 자동 적립 폐기 재검증 |
| 담당 | 프론트엔드 |
| Jira | [KAN-252](https://runtime364.atlassian.net/browse/KAN-252) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-23 (High — 당일. #1905를 운영에 내보내기 전에 필요) |
| 선행 | 없음 — 서버는 반영됨(#1943 진행 저장 `is_completed` · #1941 담기 상태 맞춤) |
| 근거 문서 | `spec/api/player-api.md` 4.3 · `spec/api/explore-api.md` 4.3 |
| 중요도 | High |

## 왜

1. **끝까지 들어도 화면이 그대로** — 재조회 신호(`onServerStateChanged`, `playback.service.ts:956-964`)는 진행 저장 응답의 `library_item`이 `completed`로 바뀔 때만 나간다. 담지 않은 편은 `library_item`이 null이라, KAN-249를 반영해도 시리즈 화면의 "N분 남음"·[재생]의 같은 편 선택이 새로고침 전까지 남는다.
2. **담기 직후 엇갈림** — 담기 낙관 반영이 `status: previous?.status ?? 'unplayed'`(`useExploreScreen.ts:403`, `useSeriesScreen.ts:224·382`)이고 성공해도 라이브러리만 다시 받는다. 서버는 이제 들은 만큼(`in_progress`/`completed`)으로 담는다 — 라이브러리는 완청, 탐색 캐시는 미청취로 보인다.
3. **GA4 `content_save`** — 자동 적립(auto_play)도 같은 이벤트를 보내 Slack 일일 보고 담기 수에 섞였다. 폐기 뒤 추이가 끊긴다.

## 무엇을 한다

1. 진행 저장 응답의 **`is_completed`**(추가 필드)가 false→true로 바뀌면 `library_item` 갈래와 같은 재조회 신호를 낸다.
2. 담기 성공 응답의 `library_item.status`로 탐색·시리즈 캐시를 고친다.
3. `content_save` 이벤트의 auto_play 몫을 정리한다(이미 안 보내면 출시일 기준 단절을 데이터 담당에 알림).

## 완료 조건

- Given 담지 않은 편을 시리즈 화면에서 끝까지 들었다 / When 시리즈 화면으로 돌아온다 / Then 새로고침 없이 그 편이 "완청"이고 [재생]이 다음 편을 고른다
- Given 탐색에서 절반 들은 편을 담는다 / Then 탐색·라이브러리 모두 듣는 중으로 보인다
- Given 이벤트 로그 / Then `content_save`가 직접 담기만 센다(또는 단절 시점이 기록돼 있다)

## 처리 기록

- 2026-10-23 발행(BE — 재검증 FE 항목).
