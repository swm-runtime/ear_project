# [FE] 담지 않은 편을 미니플레이어로 열 때 — 재생 목록·연속 재생·카테고리 줄

| 항목 | 값 |
|---|---|
| 대상 | `features/library` — `hooks/useLibraryScreen.ts`(미니플레이어 진입 큐 · 주제 찾기) · `features/player` — `hooks/usePlayGate.ts` · `services/queue-context.ts` · `docs/features/player.md` 4.2-1(changes) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(BE) — 2026-10-23 자동 적립 폐기 재검증 |
| 담당 | 프론트엔드 |
| Jira | [KAN-251](https://runtime364.atlassian.net/browse/KAN-251) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-23 (High — 당일. #1905(자동 적립 폐기)를 운영에 내보내기 전에 필요) |
| 선행 | 없음 — 서버는 반영됨(#1938 · #1942: 담지 않고 듣던 편도 복원 대상, `resume_target.id = null`) |
| 근거 문서 | `spec/api/library-api.md` 4.3 · `features/player.md` 4.2-1 |
| 중요도 | High |

## 왜

서버가 탐색에서만 듣던(담지 않은) 편도 미니플레이어 복원 대상으로 준다(FR-24). 그런데 앱은 미니플레이어 진입을 "라이브러리 맥락"으로 연다.

1. **재생 목록·연속 재생** — 미니플레이어 진입은 큐를 넘기지 않아(`useLibraryScreen.ts:364`) 라이브러리 맥락이 된다(`usePlayGate.ts:49`). 담지 않은 편은 라이브러리 첫 페이지에 없어 패널에 지금 듣는 편이 없고(`PlayerScreen.tsx:165-183` — `withCurrentFirst`는 탐색 맥락만), 연속 재생은 `queue-context.ts:105`의 `index === -1`로 멈춘다. `player.md` 4.2-1 "라이브러리 맥락 = 전부 담긴 편" 전제가 깨졌다.
2. **카테고리 줄** — `useLibraryScreen.ts:253`이 주제를 `items.find(item.id === resumeTarget.id)`로 찾는다. id가 null이면 못 찾아 미니플레이어로 연 플레이어의 카테고리 줄이 빈다.

## 무엇을 한다

1. **결정 + 문서**: 복원 대상의 `id`가 null(담지 않은 편)이면 어떤 맥락으로 열지 정한다(예: 탐색 맥락 스냅샷 = 그 편 하나 → 다음에 들어볼 만한 추천). `player.md` 4.2-1을 `changes/pending/`으로 개정 요청.
2. 위 결정대로 진입 큐를 넘긴다.
3. 주제는 복원 응답의 `content.topic_ids`를 쓴다(rt36 응답에 이미 있다).

## 완료 조건

- Given 담지 않고 듣던 편이 미니플레이어에 떠 있다 / When 플레이어를 연다 / Then 재생 목록에 그 편이 지금 듣는 줄로 보이고, 끝나면 정한 규칙대로 다음 편으로 넘어가거나 멈춘다
- Given 같은 상황 / Then 플레이어 카테고리 줄에 그 편의 주제가 보인다
- Given 담긴 편이 미니플레이어에 떠 있다 / Then 종전 라이브러리 맥락 그대로다

## 처리 기록

- 2026-10-23 발행(BE — 재검증 FE 항목).
