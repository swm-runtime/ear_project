# [FE] 재생 목록 = 들어온 맥락(라이브러리 / 탐색 목록 스냅샷) + 탐색 맥락 "다음에 들어볼 만한" 추천 블록

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/player/` — `usePlayGate.ts`(맥락 전달) · 재생 스토어(맥락 보관) · `PlayerQueuePanel.tsx`·`useQueueQuery.ts`·`useQueueOrder.ts`(맥락 분기·헤더·담기·추천 섹션) · `player.copy.ts` · `player-library.bridge.ts`(담기·interest 폴백 브리지) / `features/explore/`(재생 시작 지점에서 목록 스냅샷 넘기기 — 피드·주제별·인기·검색·시리즈 화면) / `features/library/`(라이브러리 맥락 표시) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 03:58 "ㄱㄱ 1,2 두개다" |
| 담당 | 프론트엔드 |
| Jira | [KAN-241](https://runtime364.atlassian.net/browse/KAN-241) · 관련 BE [KAN-240](https://runtime364.atlassian.net/browse/KAN-240)(relates — related API 연결 단계만 BE 뒤) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일. 범위가 커서 밀리면 사유를 처리 기록에 적는다) |
| 선행 | 없음(맥락·패널·interest 폴백은 바로). **related API 연결**만 BE [KAN-240](https://runtime364.atlassian.net/browse/KAN-240) 뒤 — 그 전엔 폴백만으로 붙인다. 문서 개정 기록 `changes/pending/player-queue-context.md` 1~3·6·7절을 같은 PR에서 반영 |
| 근거 문서 | `changes/pending/player-queue-context.md` · `features/player.md` 4.2-1·4.7-1·8장 · `spec/uiux/player-uiux.md` 4.6-1 · `features/paywall.md` 4.2 |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

재생 목록 패널(PL12)은 어디서 열었든 **라이브러리 첫 페이지**다. 탐색·검색에서 라이브러리에 없는 편을 틀면 지금 듣는 편이 목록에 없고 "재생 중" 줄도 안 뜬다. PM 결정(2026-10-22): **재생목록 = 들어온 맥락**(유튜브 뮤직·애플 뮤직 방식) + 탐색 맥락에서는 **"다음에 들어볼 만한" 추천 블록**. 연속 재생은 그대로 비범위(FR-24) — 패널은 열람·선택 전용.

## 무엇을 한다 (순서대로)

1. **맥락 타입·전달** — `PlayQueueContext = { kind: 'library' } | { kind: 'explore'; source: QueueSource; items: ExploreItem[] }`. `QueueSource`는 헤더 라벨의 근거(`{ type: 'section', title } | { type: 'topic', name } | { type: 'search', query } | { type: 'popular', period } | { type: 'series', title }`). `usePlayGate.startPlayback(target, entryPoint, { queue })`로 받아 **재생 스토어**에 둔다(플레이어가 살아 있는 동안 — 콜드 스타트 복원은 `library`). 넘기지 않은 진입(푸시·공유·미니플레이어 복원·상세 화면 단독)은 `library`.
2. **스냅샷 만들기**(탐색 쪽) — 재생 시작 시점에 그 목록의 콘텐츠 행만(시리즈 카드 제외) 불러 둔 페이지까지. 피드 섹션(가로 캐러셀 — 그 섹션 항목) · 주제 필터 목록 · 인기 목록(현재 구간) · 검색 결과 · 시리즈 화면 편 목록. 현재 편이 스냅샷에 없으면 맨 위에 넣는다.
3. **패널 분기** — `library`면 종전 그대로(`useQueueQuery` 조회·`useQueueOrder` 끌기·서버 저장). `explore`면 조회 없이 스냅샷을 그린다: **헤더 출처 한 줄**("탐색 · 인기 주간" / "주제 · 커리어" / "검색 ‘커리어’" / "시리즈 · ○○" — 손잡이 글자도 같게), 순서 손잡이 없음, 라이브러리에 없는 줄에 **담기 버튼**(E 타일 담기 규칙·낙관 반영·토스트는 탐색 것 재사용 — 브리지로). 줄 탭 = 단일 게이트, 진입점은 맥락 따라 `library`/`explore`. 패널에서 줄을 바꿔도 맥락 유지.
4. **추천 블록**(`explore` 맥락만) — 목록 아래 섹션 **"다음에 들어볼 만한"** 3~5편. 소스 ① `GET /contents/:id/related?limit=5&exclude_ids=…`(KAN-240 — 응답 행은 탐색 4.1 모양, `exclude_ids`=스냅샷 id) → ② 비거나 실패면 탐색 `interest` 섹션(피드 쿼리 캐시 `exploreKeys.feed()` 재사용, 없으면 조회) 중 현재·스냅샷 제외 상위 5. 0건이면 섹션 없음. 줄 탭 = 재생(게이트, 진입점 `player`), 틀면 스냅샷에 더해진다. 담기 버튼. 로딩은 줄 스켈레톤 2개(0.3초 미만 미표시), 실패는 조용히 섹션 생략. 현재 편이 바뀌면 다시 받는다. **KAN-240 전엔 ①을 건너뛰고 ②만**(API 호출 코드는 플래그 없이 404/네트워크 실패 → 폴백 경로로 흘려도 되지만, 매 번 404 를 내지 않게 BE 머지 전엔 ① 호출을 두지 않는다).
5. **카피·접근성** — `player.copy.ts` `queuePanel.sourceHeader`(5종)·`upNextTitle`·`saveA11y` ko·en, ko 스냅샷 `-u`. 헤더·섹션 제목 header 역할, 담기 44pt·낭독 "라이브러리에 담기".
6. **분석** — `track('queue_panel_open', { context: 'library' | 'explore' })`, 추천 줄 재생은 기존 재생 이벤트의 entry `player`로 구분(새 이벤트 없음).
7. **테스트** — 맥락 분기(라이브러리/탐색/폴백) · 스냅샷(시리즈 카드 제외·현재 편 맨 위) · 헤더 라벨 5종 · 끌기 없음 · 담기 · 추천 폴백(interest 중 제외 규칙) · 자동 재생 없음(완청 후 아무 일 없음).
8. **문서** — changes 문서 1~3·6·7절을 같은 PR에서 반영하고 `archive/`로(KAN-240 뒤에 4·5절이 남으면 changes 는 BE PR 몫).

## 범위 밖

- 연속 재생·완청 후 자동 다음(FR-24) · 시리즈 "다음 화 듣기"(KAN-225 보류 — 시리즈 화면 편 목록을 맥락으로 쓰는 것은 들어오되, 유도로 읽히면 PM 판단으로 라이브러리 맥락으로 되돌린다: **확인 항목**) · 맥락 서버 저장 · related API 자체(BE KAN-240) · 추천 스코어링 변경

## 완료 조건

- Given 탐색 인기(주간)에서 재생 / When 패널 열기 / Then 헤더 "탐색 · 인기 주간", 그 목록 순서(시리즈 카드 없음), 현재 편 "재생 중", 순서 손잡이 없음, 라이브러리에 없는 줄에 담기
- Given 라이브러리에서 재생 / Then 종전과 동일(사용자 순서·끌기·서버 저장·헤더 "재생 목록")
- Given 푸시·공유·콜드 스타트 미니플레이어 복원 / Then 라이브러리 맥락
- Given 검색 결과 "커리어"에서 재생 / Then 헤더 "검색 ‘커리어’". Given 주제 필터 / Then "주제 · <이름>". Given 시리즈 화면 / Then "시리즈 · <제목>"
- Given 상세 화면을 거쳐 탐색 맥락 편 재생(스냅샷에 없음) / Then 그 편이 맨 위에 "재생 중"
- Given 탐색 맥락 패널 / Then 목록 아래 "다음에 들어볼 만한" 3~5편(KAN-240 뒤 related → 폴백 interest; 전엔 interest), 현재·스냅샷 편 제외, 탭 = 재생 시작(게이트·팝업 조건 동일), 완청 후 자동 재생 없음
- Given 추천 줄 재생 / Then 맥락·헤더 유지, 그 편이 스냅샷에 더해져 "재생 중"
- Given 담기 탭 / Then 낙관 반영 + 라이브러리 화면에 나타난다(탐색 담기와 동일)
- Given 영어 표시 언어 / Then 헤더 "Explore · Popular this week" 등, 섹션 "Up next for you"

## 처리 기록

- 2026-10-22 발행(PM 03:58).
