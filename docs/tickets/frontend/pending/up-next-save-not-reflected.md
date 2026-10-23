# [FE] 재생 목록 "다음에 들어볼 만한" 줄을 밀어 담아도 다시 밀면 담기가 또 나온다

| 항목 | 값 |
|---|---|
| 대상 | `features/player` — `components/PlayerQueuePanel.tsx`(추천 줄 `canSave`) · `hooks/usePlayerScreen.ts`(`saveQueueItem`) · `services/queue-context.ts`(`withSnapshotItemId`) · `hooks/useUpNextQuery.ts`(추천 캐시) |
| 요청 파트 | 프론트엔드 |
| 요청자 | FE 담당 — 2026-10-23 개발계 테스트 중 확인 |
| 담당 | 프론트엔드 |
| 발행 날짜 | 2026-10-23 |
| Jira | [KAN-259](https://runtime364.atlassian.net/browse/KAN-259) |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | 없음 |
| 관련 | [KAN-241](https://runtime364.atlassian.net/browse/KAN-241)(추천 블록·줄 스와이프) · [KAN-252](https://runtime364.atlassian.net/browse/KAN-252)(담기 뒤 탐색·시리즈 캐시 상태 — 이 티켓은 재생 목록 패널) |
| 근거 문서 | `features/player.md` 4.2 줄 스와이프("이미 담긴 줄은 면이 드러나지 않는다") |
| 심각도 | 중 (Jira 중요도 Medium) |

## 요지 (Jira 본문용)

- 재생 목록의 "다음에 들어볼 만한" 줄을 오른쪽으로 밀어 담으면 "담았어요" 토스트가 뜨지만, 같은 줄을 다시 밀면 담기 면이 또 나오고 담으면 토스트도 또 뜬다.
- 개발계(운영 미배포) 빌드에서 확인됐다.
- 원인: 담기 결과(`itemId`)를 탐색 맥락 스냅샷에만 적는다. 추천 줄은 스냅샷이 아니라 추천 쿼리 캐시에서 오고, 라이브러리 맥락은 스냅샷 자체가 없어서 아무 데도 반영되지 않는다.
- 할 일: 추천 줄의 담기 결과를 추천 캐시에 반영하고, 라이브러리 맥락이면 재생 목록도 다시 맞춘다.
- 상세 재현·원인·완료 조건은 원본 문서.

## 재현

1. 플레이어에서 재생 목록을 연다(탐색 맥락·라이브러리 맥락 각각).
2. "다음에 들어볼 만한" 줄 하나를 오른쪽으로 밀어 담는다 — "담았어요" 토스트가 뜬다.
3. 같은 줄을 다시 오른쪽으로 민다.
4. 기대: 담기 면이 드러나지 않는다. 실제: 담기 면이 또 나오고, 담으면 토스트가 또 뜬다.

## 원인 (코드 확인 — dev `9f024ecd`, KAN-252 수정 #1971 반영 뒤에도 그대로)

1. 추천 줄의 담기 가능 여부는 `canSave={item.itemId === null}`(`PlayerQueuePanel.tsx:955`)이고, `itemId`는 추천 쿼리 결과의 값이다.
2. `saveQueueItem`(`usePlayerScreen.ts:352`)은 낙관 반영·성공·실패 모두 `withSnapshotItemId(store.queueContext, …)`로 **스냅샷만** 고친다. `withSnapshotItemId`(`queue-context.ts:82`)는 탐색 맥락이 아니면 맥락을 그대로 돌려준다. 탐색 맥락이어도 추천 줄은 스냅샷에 없어서 바뀌는 줄이 없다.
3. 추천 쿼리 캐시(`upNextKeys`)를 고치는 곳이 없다 — 키는 `useUpNextQuery.ts` 안에서만 쓰인다.
4. 담기 브리지(`app/bootstrap/index.ts:216` `saveContent`)는 라이브러리 목록 캐시(`libraryKeys.all`)만 무효화한다. 라이브러리 맥락 재생 목록(`queueKeys.all`)은 다시 받지 않는다.

## 무엇을 한다

1. 추천 줄을 담으면 추천 캐시(`upNextKeys.all` 아래)의 그 편 `itemId`를 낙관 반영하고, 성공하면 실제 값으로, 실패하면 null로 되돌린다 — 스냅샷 쪽과 같은 순번(`saveSeqRef`) 규칙.
2. 라이브러리 맥락이면 담기 성공 뒤 재생 목록 캐시(`queueKeys.all`)도 무효화한다.
3. 시리즈 화면 [+]처럼 플레이어 밖에서 담은 경우에도 재생 목록 줄의 담기 상태가 맞는지 함께 본다(같은 계열 의심 — 재생 시작 때 만든 스냅샷의 `itemId`가 이후 담기를 반영하지 않는다. 기기 미확인).

## 완료 조건

- Given 탐색 맥락 재생 목록 / When 추천 줄을 밀어 담고 같은 줄을 다시 민다 / Then 담기 면이 드러나지 않는다
- Given 라이브러리 맥락 재생 목록 / When 같은 조작을 한다 / Then 위와 같고, 시트를 닫았다 다시 열면 그 편이 재생 목록에 들어 있다
- Given 추천 줄 담기가 실패했다 / Then 담기 면이 다시 드러나고 실패 토스트가 뜬다

## 처리 기록

- 2026-10-23 발행(FE 담당 요청으로 대신 발행 — 개발계에서 재현 확인, 원인은 코드 확인).
