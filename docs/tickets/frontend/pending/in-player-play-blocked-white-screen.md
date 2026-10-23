# [FE] 한도를 다 쓴 상태에서 재생 목록의 다른 편을 고르면 듣던 편이 끊기고 흰 화면에 갇힌다

| 항목 | 값 |
|---|---|
| 대상 | `features/player` — `hooks/usePlayGate.ts`(`requestPlay` · `startDeferred`) · `services/playback.service.ts`(`blockAtIssue`) · `screens/PlayerScreen.tsx`(세션 없음 분기) · `hooks/usePlayerScreen.ts`(`playQueueItem` · `playUpNextItem`) |
| 요청 파트 | 프론트엔드 |
| 요청자 | FE 담당 — 2026-10-23 개발계 테스트 중 확인 |
| 담당 | 프론트엔드 |
| 발행 날짜 | 2026-10-23 |
| Jira | [KAN-257](https://runtime364.atlassian.net/browse/KAN-257) |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-23 (High — 당일. 운영에도 같은 코드 경로가 있고, KAN-241 추천 블록이 이 경로를 자주 타게 만든다) |
| 선행 | 없음 |
| 관련 | [KAN-241](https://runtime364.atlassian.net/browse/KAN-241)(추천 블록·탐색 맥락 줄) · [KAN-250](https://runtime364.atlassian.net/browse/KAN-250)(같은 진입 함수 `playQueueItem`·`playUpNextItem`) |
| 근거 문서 | `features/paywall.md` 4.2(모든 재생 경로가 단일 게이트) · `features/player.md` 4.2 |
| 심각도 | 상 (Jira 중요도 High) |

## 요지 (Jira 본문용)

- 무료 계정으로 오늘 재생 한도를 다 쓴 상태에서, 플레이어 재생 목록의 다른 편(추천 줄·목록 줄)을 탭하면 듣던 편이 끊기고 화면이 흰색으로 바뀐다. 빠져나갈 방법이 없다.
- 개발계에서 확인됐다. 운영(main)에도 같은 코드 경로가 있다 — 라이브러리 맥락 재생 목록에서 오늘 안 들은 줄을 탭하는 경우(운영 재현은 미확인).
- 원인: 소진 힌트면 게이트가 발급부터 받는 경로(`startDeferred`)를 탄다. 이 경로는 "플레이어가 아직 안 떠 있다"고 가정해, 403이면 세션을 내리고 페이월만 띄운다. 플레이어 안에서 부르면 열린 플레이어가 세션 없이 남아 빈 화면을 그린다.
- 할 일: 플레이어 안에서 시작한 요청이 막히면 듣던 편을 지키고 안내만 띄운다(최소한 플레이어를 닫는다).
- 상세 재현·원인·완료 조건은 원본 문서.

## 재현

1. 무료 계정으로 오늘 남은 재생 횟수를 다 쓴다.
2. 오늘 이미 들은 편을 플레이어에서 재생한다.
3. 재생 목록을 열고 "다음에 들어볼 만한" 줄(또는 오늘 안 들은 목록 줄)을 탭한다.
4. 기대: 듣던 편과 플레이어는 그대로이고 페이월(또는 한도 안내)만 뜬다. 실제: 듣던 편이 끊기고 화면이 흰색으로 바뀐다. 닫기 수단이 없다.

## 원인 (코드 확인 — dev `9f024ecd`, KAN-250 수정 #1958 반영 뒤에도 그대로)

1. `playQueueItem`·`playUpNextItem`(`usePlayerScreen.ts:323·337`)이 `playGate.requestPlay`를 부른다. 줄이 오늘 차감 전이고 남은 횟수 힌트가 0이면 `isExhaustedHint`가 참이라 `startDeferred`로 간다(`usePlayGate.ts:238-240`).
2. `startDeferred`는 바로 `playbackService.start(...)`를 부른다(`:188`). 새 세션을 열면서 **듣던 세션을 먼저 내린다.** 콜백에 `onIssueBlocked`를 넘긴다(`:206`).
3. 발급이 403이면 `blockAtIssue`(`playback.service.ts:1155`)가 `onIssueBlocked`가 있으니 "진입점이 직접 처리한다(플레이어가 안 떠 있다)"로 보고 `clearSession()` 뒤 콜백을 부른다(`:1161-1162`). 플레이어 화면이 직접 처리하는 차단 경로(`session.state === 'blocked'` → `clearSession` + `goBack`, `usePlayerScreen.ts:150-166`)는 타지 않는다.
4. 플레이어는 열린 채 `session`이 null이다. `PlayerScreen.tsx:1675` `if (!session) return <View style={containerStyle} />`는 "세션 정리 직후의 한 프레임"을 가정한 분기인데, 여기서는 계속 그려진다. 닫기 버튼도 끌어 내리기 제스처도 없다.

운영(main)도 같은 구조다 — `playQueueItem`(main `usePlayerScreen.ts:218`) → `isExhaustedHint` → `startDeferred`(main `usePlayGate.ts:215-216`) → `blockAtIssue`(main `playback.service.ts:1044`) → 세션 없음 분기(main `PlayerScreen.tsx:1408`). 운영 재생 목록은 라이브러리 첫 페이지라, 오늘 안 들은 라이브러리 편 줄을 탭하면 같은 흐름이 된다.

## 무엇을 한다

1. **플레이어 안에서 시작한 재생 요청이 막히면 듣던 편을 지킨다.** 방법은 FE가 고른다. 예: 진입점이 `player`(또는 플레이어가 떠 있음)면 발급이 끝나기 전에 듣던 세션을 내리지 않는다 / 막히면 듣던 세션을 되살리고 페이월만 연다.
2. **세션 없음 분기에 출구를 둔다.** 세션이 null로 남으면 플레이어를 닫는다(`goBack`). 다른 원인으로 같은 상태가 생겨도 갇히지 않게 한다.
3. 운영에도 같은 경로가 있어 이번 수정이 운영 배포에 함께 나가야 한다 — 운영에서 재현되는지 먼저 확인한다.

## 완료 조건

- Given 오늘 한도를 다 쓴 무료 계정이 오늘 들은 편을 듣는 중 / When 재생 목록의 추천 줄(오늘 안 들은 편)을 탭한다 / Then 듣던 편이 계속 재생되고 플레이어가 그대로 있으며 페이월이 뜬다
- Given 같은 상황 / When 라이브러리 맥락 목록 줄(오늘 안 들은 편)을 탭한다 / Then 위와 같다
- Given 같은 상황 / When 탐색 맥락 목록 줄을 탭한다 / Then 위와 같다
- Given 어떤 이유로든 플레이어가 열린 채 세션이 사라졌다 / Then 흰 화면에 머물지 않고 플레이어가 닫힌다

## 처리 기록

- 2026-10-23 발행(FE 담당 요청으로 대신 발행 — 개발계에서 재현 확인, 원인은 코드 확인).
