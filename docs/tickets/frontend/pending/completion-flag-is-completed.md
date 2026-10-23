# [FE] 완청 표시·연속 재생 판정을 `is_completed`로 — 탐색 재생 자동 적립 폐기 후속

| 항목 | 값 |
|---|---|
| 대상 | `features/explore` — `explore.series-episode.ts`(편 상태·[재생] 다음 편) · `explore.queue.ts`(스냅샷 `isCompleted` → 연속 재생 건너뛰기) · `components/ExploreTile.tsx` · `components/ExploreFeaturedCard.tsx` · `api/explore.api.ts`(행·시리즈 편·상세·관련 DTO 매핑) · mock |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(BE) — 2026-10-23 자동 적립 폐기 영향 검토 |
| 담당 | 프론트엔드 |
| Jira | [KAN-249](https://runtime364.atlassian.net/browse/KAN-249) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-23 (High — 당일. **#1898 운영 릴리스 전에 들어가야 한다**) |
| 선행 | BE `tickets/backend/archive/complete-signal-without-library.md`([KAN-248](https://runtime364.atlassian.net/browse/KAN-248)) — PR #1928 → #1930(`is_completed`) dev 배포 |
| 근거 문서 | `spec/api/explore-api.md` 4.1·4.7 `is_completed` · `content-detail-api.md` 4.1 · `player-api.md` 4.8 · `features/explore.md` 4.4 |
| 중요도 | High |

## 왜

탐색 재생 자동 적립을 뺐다(#1905). 담지 않고 끝까지 들은 편은 라이브러리 행이 없어 `library.status`가 `completed`가 될 수 없다. 앱이 완청을 `library?.status === 'completed'`로 보는 곳이 전부 틀어진다.

- **시리즈 화면** — 들은 편이 "N분 남음"으로 보이고, 머리 [재생]이 그 편을 다시 고른다(`explore.series-episode.ts:24·73`).
- **탐색 연속 재생** — 스냅샷의 `isCompleted`가 늘 false라 들은 편을 다시 튼다. 재청취 창 밖이면 1회 차감된다(`explore.queue.ts:19` → `queue-context.ts:106`).
- **탐색 타일·피처드 카드** — 완청 표시가 빠진다(`ExploreTile.tsx:43` · `ExploreFeaturedCard.tsx:61`).

서버가 탐색 행(피드·목록·검색·인기)·시리즈 편·상세·관련 콘텐츠에 **`is_completed`**(라이브러리 `completed` 행 ∪ 재생 위치 최대 도달 ≥ 길이 × 90%)를 싣는다(BE #1930).

## 무엇을 한다

1. **DTO** — 위 응답의 `is_completed`를 타입·매핑에 더한다. 없으면(옛 서버) `library?.status === 'completed'`로 폴백한다. mock도 같이.
2. **판정 교체** — 위 네 곳의 완청 판정을 `isCompleted`(= `is_completed`)로 바꾼다. 클라이언트가 위치로 완청을 다시 계산하지 않는다(판정은 서버).
3. 라이브러리 화면(`features/library`)은 그대로 둔다 — 라이브러리 행이 있는 화면이라 `status`가 맞다.

4. **미니플레이어 복원 대상의 `id`가 null일 수 있다**(BE #1938 — 담지 않고 듣던 편도 복원 대상, `library-api.md` 4.3). `useLibraryScreen`의 숨김·삭제 대조(`dismissedResumeIds`·`hiddenItemIds`·`resumeTarget.id === item.id`)를 `content.id` 키로 바꾼다 — null끼리 키가 겹치면 담지 않은 편 하나를 숨길 때 다른 편도 숨는다. 타입 `ResumeTarget.id`를 `string | null`로.

## 범위 밖

- **지금 듣는 편의 완청 반영** — `queue-context.ts:19`는 세션의 `libraryItem.status`를 본다. 담지 않은 편은 진행 저장 응답의 `library_item`이 null이라 듣는 도중 완청으로 바뀌지 않는다. 연속 재생은 다음 편만 보므로 당장은 영향이 없다. 필요하면 BE가 진행 저장 응답에 완청 여부를 더한다(요청 시 BE 티켓).

## 완료 조건

- Given 담지 않은 편을 탐색에서 끝까지 들었다 / When 그 시리즈 화면을 연다 / Then 그 편이 "완청"으로 보이고 머리 [재생]이 다음 안 들은 편을 고른다
- Given 탐색 맥락 스냅샷에 끝까지 들은 편이 있다 / When 앞 편이 끝나 연속 재생된다 / Then 그 편을 건너뛴다
- Given 담지 않고 끝까지 들은 편 / When 탐색 피드·목록·검색을 본다 / Then 타일·피처드 카드에 완청 표시가 있다
- Given `is_completed`가 없는 응답(옛 서버) / Then 종전처럼 `library.status`로 그린다

## 처리 기록

- 2026-10-23 발행(BE — 자동 적립 폐기 영향 검토. 서버 쪽은 #1928·#1934).
- 2026-10-23 4번 추가 — 미니플레이어 복원 `id` null(BE #1938).
