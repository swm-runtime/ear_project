# [FE] 재생 목록 "다음에 들어볼 만한"에서 재생하면 블록이 스켈레톤에 멈춘다

| 항목 | 값 |
|---|---|
| 대상 | `features/player` — `hooks/usePlayerScreen.ts`(`playUpNextItem` · `playQueueItem`) · `screens/PlayerScreen.tsx`(`setPanel` · `useUpNextQuery` 연결 · `upNext.isLoading`) · `hooks/useUpNextQuery.ts` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현 — 2026-10-23 개발계 사용 중 발견 |
| 담당 | 프론트엔드 |
| Jira | [KAN-250](https://runtime364.atlassian.net/browse/KAN-250) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-23 (High — 당일. #1898 운영 릴리스에 KAN-241 재생 목록이 함께 나간다) |
| 선행 | 없음 |
| 근거 문서 | `features/player.md` 4.2-2("추천 소스는 재생 중 콘텐츠가 바뀔 때 다시 받는다") |
| 중요도 | High |

## 재현

탐색에서 재생 → 재생 목록 열기 → "다음에 들어볼 만한" 줄 탭 → 블록이 스켈레톤으로 바뀌고 새 추천을 받지 않는다.

## 원인 (코드 확인 — dev `11287b1f`)

1. `usePlayerScreen.playUpNextItem`(`:316`)과 `playQueueItem`(`:302`)이 훅의 `setActivePanel(null)`을 **직접** 부른다. 화면의 `setPanel(null)`(`PlayerScreen.tsx:270`)을 거치지 않아 시트 닫힘 스프링(`queueProgress` → 0)과 `setIsQueueSettled(false)`가 돌지 않는다. **시트는 화면에 남는데 `activePanel`만 null**이 된다.
2. `useUpNextQuery`의 `enabled`(`PlayerScreen.tsx:194` — `activePanel === 'queue' && isQueueSettled && !isLibraryQueue`)가 false가 된다.
3. 새 편이라 `contentId`·`excludeIds`(스냅샷에 그 편이 더해짐)가 바뀌어 쿼리 키가 새로 생겼고, 데이터가 없으니 `isPending = true`다(TanStack Query는 꺼진 쿼리도 데이터가 없으면 pending). `upNext.isLoading: upNextQuery.isPending`(`:2329`)이 스켈레톤을 계속 그린다.

같은 우회 때문에 시트가 열려 보이는데 손잡이 제스처(`queueGestureRef.isOpen`)는 닫힘으로 알고 있다 — 다음 끌기가 엉뚱하게 시작될 수 있다.

## 무엇을 한다

1. **줄 탭 경로가 화면의 패널 상태와 모션을 함께 바꾸게 한다.** 의도에 따라 고른다.
   - **닫기**(지금 코드의 의도): `onSelect`·`onSelectUpNext`를 `setPanel(null)`을 부르는 화면 래퍼로 감싼다.
   - **열어 둔 채 다음 추천 받기**: `activePanel`을 null로 바꾸지 않는다. 새 편으로 키가 바뀌면 다시 받는다(4.2-2).
2. **스켈레톤 조건** — `isPending`이 아니라 실제 요청 중일 때만 그린다(`isLoading` = pending && fetching). 꺼진 쿼리가 스켈레톤에 묶이지 않게 한다.

## 완료 조건

- Given 탐색 맥락 재생 목록 / When "다음에 들어볼 만한" 줄을 탭한다 / Then 시트 상태와 패널 상태가 같고(1번에서 고른 동작), 시트가 열려 있으면 새 편 기준 추천이 3~5편 다시 뜬다
- Given 같은 상황에서 재생 목록 줄(스냅샷)을 탭한다 / Then 위와 같다
- Given 추천 쿼리가 꺼져 있다 / Then 스켈레톤을 그리지 않는다

## 처리 기록

- 2026-10-23 발행(BE — 원인 분석까지. 코드는 FE).
- 2026-10-23 반영(FE) — 1번은 **닫기**를 골랐다(`player.md` 4.2-1 "줄 탭 = 재생, 패널은 닫힌다" 그대로). `PlayerScreen` 이 줄 탭(`onSelect`·`onSelectUpNext`)을 화면의 `setPanel(null)` 로 감싸 시트 닫힘 모션·`isQueueSettled`·2단 접힘이 패널 상태와 함께 돈다 — 확인 팝업에서 [취소]해도 시트와 패널이 둘 다 닫힌 상태로 같다(Jira 댓글의 "목록·손잡이 탭 무반응" 증상 포함). 지금 듣는 줄 탭도 같은 경로로 닫힌다. 2번 — 추천 스켈레톤을 `isPending` 대신 `isLoading`(pending && fetching)으로 그린다. 반영 날짜 2026-10-23.
