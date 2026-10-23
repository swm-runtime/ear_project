# [BE] 담지 않은 편의 완청 기록 — 라이브러리 행 없이도 `complete` 신호 남기기

| 항목 | 값 |
|---|---|
| 대상 | `PUT` 재생 위치 저장의 완청 판정(`playback-progress.service.ts` `completeIfReached`) · `user_signals(complete)` 적재 · `player-api.md` 4.3 서술 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) — 2026-10-23 06:55 "시청하면 왜 자동으로 라이브러리에 담겨? 그거 없애" 의 후속 |
| 담당 | 백엔드 |
| Jira | [KAN-248](https://runtime364.atlassian.net/browse/KAN-248) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | 없음(티켓). FE 자동 적립 제거는 머지됨(PR #1905, dev `e6c1e14b`) |
| 근거 문서 | `changes/pending/explore-play-no-auto-save.md` · `features/explore.md` 4.4(개정 2026-10-23) · `spec/api/player-api.md` 4.3 · `features/player.md` 4.4 · `drip-scheduling.md` 4.3 |
| 중요도 | Medium |

## 왜

탐색에서 재생하면 앱이 `save(reason=auto_play)`로 라이브러리에 담던 것을 PM 지시로 뺐다(#1905). 그런데 서버의 완청 판정은 **라이브러리 행이 전제**다 — `player-api.md` 4.3: "라이브러리에 없는 콘텐츠는 진행만 저장한다. 상태 전이·`complete` 신호는 라이브러리 행이 전제다. 실제로는 탐색 재생의 자동 적립이 행을 만들어 두므로 이 분기는 경합에서만 나타난다."

이제 이 분기가 평소 경로다. 담지 않고 끝까지 들은 편은 `complete` 신호가 쌓이지 않아 **추천·드립 입력에서 완청이 빠진다**(탐색이 무료 사용자의 주 소비 경로다 — `explore.md` 1장). `play` 신호·`play_records`·재생 한도 차감은 영향 없다. 앱의 끝남 화면은 위치로 판정해 영향 없다.

## 무엇을 한다

1. 완청 판정(보정 후 `max_reached_sec` ≥ `duration_sec` × 90%, 최초 도달)을 **라이브러리 행 유무와 무관하게** 한다 — 행이 없으면 `user_signals(action = 'complete')`만 적재하고 상태 전이는 건너뛴다. 행이 있으면 종전 그대로(`completed` 전이 + 신호).
2. **최초 1회 보장** — 행이 없을 때는 `library_items.status` 조건부 UPDATE 로 중복을 막을 수 없다. `playback_progresses` 쪽 표시(예: 최초 도달 시각) 또는 신호 존재 확인 등 BE가 정한 방식으로 같은 편의 `complete` 신호가 두 번 쌓이지 않게 한다. 스키마가 바뀌면 `domain.md` 먼저.
3. (결정) 완청한 뒤 그 편을 **나중에 담으면** 라이브러리 행을 `completed`로 넣을지 — 넣지 않으면 담긴 편이 "안 들음"으로 보인다. BE가 정해 `library-api.md`·`player-api.md`에 적는다.
4. `player-api.md` 4.3 "경합에서만 나타난다" 문구를 새 규칙으로 고치고 `changes/pending/explore-play-no-auto-save.md`를 archive 로 옮긴다.

## 범위 밖

- 앱 변경 없음 — 진행 저장 요청·응답 계약은 그대로다(응답 `library_item`은 행이 없으면 계속 null).
- 자동 적립 부활 — PM 결정으로 폐기됐다.

## 완료 조건

- Given 라이브러리에 없는 편을 탐색에서 재생한다 / When 진행 저장으로 90%를 처음 넘긴다 / Then `user_signals`에 `complete`가 1건 쌓이고 `library_items` 행은 생기지 않는다
- Given 위 편을 계속 듣거나 되감아 다시 90%를 넘긴다 / Then `complete` 신호가 더 쌓이지 않는다
- Given 라이브러리에 담긴 편 / Then 종전 그대로 `completed` 전이 + 신호 1건
- Given 결정 3 / Then 정한 동작이 `library-api.md`·`player-api.md`에 적혀 있고 서버가 그대로 동작한다

## 처리 기록

- 2026-10-23 발행(PM "ㄱㄱ" 07:00).
- **2026-10-23 반영** — 결정 3: 완청한 뒤 담으면(새 행·되살린 행, 드립·온보딩 적립 포함) `completed`로 넣는다(`completed_at` = 담은 시각). 최초 1회는 "덮어쓰기 전 도달 < 기준 ≤ 이번 도달" + 같은 편 완청 신호 존재 확인(진행 upsert의 행 잠금이 동시 저장을 줄 세운다)으로 막았다 — 스키마 변경 없음. 단위·E2E(`test/complete-without-library.e2e-spec.ts`). 반영 날짜 2026-10-23.
