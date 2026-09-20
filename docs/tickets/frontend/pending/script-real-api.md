# [FE] 대본(자막) 패널을 실서버에 연결한다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/player/hooks/useScriptQuery.ts` · `api/player.api.ts`·`player.dto.ts` · `player.types.ts` · `screens/PlayerScreen.tsx`(버튼 노출 판단) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | PM 결정 — 자막(대본) 기능을 실서버에서 연다 |
| 근거 문서 | PRD FR-25(P1) · `features/player.md` 4.6 · `spec/uiux/player-uiux.md` 4.6 PL6 |
| 중요도 | **Medium** — 단, **BE 티켓이 끝나야 착수할 수 있다**. 마감은 BE 계약 확정일로부터 3일 |
| 상태 | 진행 — 코드 반영(2026-09-20). **대본이 실린 발행분 + 개발계 동기화(KAN-83) 대기** → 실기기 확인 |
| Jira | KAN-73 |
| 짝 티켓 | `tickets/backend/pending/script-api.md` · `tickets/ai/pending/script-timed-segments.md` |

## 배경

대본 패널(PL6)은 화면이 다 돼 있다 — 현재 문단 강조(밝기 + 굵기), 재생 위치 따라가기, 문단 탭 seek, 가장자리에서 문단이 스스로 투명해지는 페이드, 대본을 편 채 재생 목록을 끌면 접히는 처리까지(2026-09-18~19). 데이터만 mock 이다: `useScriptQuery` 는 mock 빌드가 아니면 항상 `null` 을 돌려줘 버튼을 그리지 않는다.

## 할 일

1. **조회 연결** — `player.api.ts` 에 스크립트 조회를 추가하고(`player.dto.ts` 에 `ScriptResponseDto { segments: [{ start_sec, end_sec, speaker, text }] }`), `useScriptQuery` 의 `queryFn` 을 실제 호출로 바꾼다. mock 분기는 `IS_PLAYER_API_MOCKED` 로 유지한다.
2. **버튼 노출** — 재생 발급 응답의 `has_script` 로 정한다. 지금은 "조회 결과가 null 이 아니면 그린다"인데, 그러면 플레이어를 열 때마다 대본을 미리 받아야 한다. `has_script: true` 일 때만 버튼을 그리고, **조회는 패널을 처음 열 때** 한다(재생 목록과 같은 방식 — `useQueueQuery` 의 `enabled`).
3. **빈 배열 = 없음** — `segments: []` 는 버튼을 숨기는 것으로 처리한다(`has_script` 와 어긋난 경우의 방어).
4. **실패 처리** — 조회 실패 시 패널 안에 "대본을 불러오지 못했어요" + [다시 시도](재생 목록 패널과 같은 문법). 재생에는 영향 없다. 401/403 은 공통 에러 계약(`common-error-handling.md`)을 따른다.
5. **카테고리 우회 제거(선택)** — BE 가 발급 응답에 `topics` 를 같이 싣는다면(`script-api.md` 5항), 진입 경로별로 `topicIds` 를 끼워 넣던 우회(#478 — 복원 미니플레이어는 목록에서 찾아 채움)를 걷고 응답 값을 쓴다.
6. 실기기 확인 — 긴 대본(20분짜리)의 스크롤 성능, 재생 중 현재 문단 따라가기, 문단 탭 seek 의 정확도(AI 티켓의 시각 기준이 배포본과 맞는지 함께 본다).

## 범위 밖

- 대본 검색·공유·복사(복사는 FR-33 로 막혀 있다).
- 글자 단위 하이라이트.

## 완료 조건

- Given 스크립트가 있는 콘텐츠를 실서버 빌드에서 재생한다 / When 플레이어를 연다 / Then 대본 버튼이 보이고, 누르면 패널에 실제 대본이 뜨며 현재 문단이 강조된다
- Given 대본 패널이 열려 있다 / When 문단을 탭한다 / Then 그 문단의 첫 마디부터 재생된다
- Given 스크립트가 없는 콘텐츠(`has_script: false` 또는 `segments: []`) / When 플레이어를 연다 / Then 대본 버튼이 보이지 않고 컨트롤 줄 배치가 흔들리지 않는다
- Given 스크립트 조회가 실패한다 / When 패널을 연다 / Then 패널 안에 실패 안내와 [다시 시도]가 보이고 재생은 계속된다
- Given mock 빌드 / When 플레이어를 연다 / Then 종전과 같이 mock 대본이 보인다

## 처리 기록

- 2026-09-19 — **BE 계약 확정(KAN-71, `feat(be)/content-script-api`)**: 조회 `GET /contents/:content_id/script`(`player-api.md` 4.7, 없으면 `segments: []`), **`has_script`·`content.topics`는 재생 발급 응답(`POST /contents/:id/audio-urls`, 4.1) 최상위/`content` 필드**다 — `/play` 응답이 아니다. `speaker`는 `string | null`. 접근 통제는 오디오와 동일(회수·한도 403, 없는 콘텐츠 404). dev 머지 후 개발계, `dev → main` 후 운영. 5항(카테고리 우회 제거)은 `content.topics`로 가능하다.

## 처리 기록

- 2026-09-20 **코드 반영**(PR `feat(fe)/script-real-api`) — 실서버에 대본 데이터가 아직 없어 `pending/`에 둔다.
  - 계약은 확정본(`player-api.md` 4.1 · 4.7)을 따랐다. 이 티켓의 "재생 발급 응답"은 `POST /contents/:id/audio-urls`다(4.1) — `has_script` 와 `content.topics` 가 거기 실린다.
  - 할 일 1: `fetchScript`(`GET /contents/:content_id/script`) + `ScriptResponseDto`. mock 분기는 `IS_PLAYER_API_MOCKED` 그대로.
  - 할 일 2: 세션에 `hasScript` 를 싣고 **버튼 노출은 그 값으로**, 조회는 **패널을 처음 열 때**(`enabled`) 한다. 한 번 받으면 세션 동안 다시 받지 않는다.
  - 할 일 3: 빈 배열이면 버튼을 숨기고 열려 있던 패널도 접힌다.
  - 할 일 4: `PlayerScriptStatus` — 불러오는 중(인디케이터) · 실패("대본을 불러오지 못했어요" + [다시 시도]). 재생 목록 패널과 같은 문법이고 재생에는 영향이 없다. 401/403 은 공용 API 클라이언트의 공통 처리를 그대로 탄다.
  - 할 일 5: 발급 응답의 `content.topics` 를 카테고리 줄의 원천으로 쓴다. 옛 서버 응답(필드 없음)이면 진입 목록이 넘긴 값을 유지한다 — #478 의 우회는 그 폴백으로만 남는다.
  - 옛 서버 방어: `has_script`·`content.topics` 는 DTO 에서 선택 필드다. 없으면 버튼을 그리지 않는다(종전과 같은 화면).
  - 확인: tsc · eslint · jest(126건). 웹 mock — 버튼 노출 → 누르면 불러오는 중 → 대본 22문단 표시.
  - **남은 것**: 할 일 6(실기기 — 긴 대본 스크롤, 현재 문단 따라가기, 문단 탭 seek 정확도). **대본 데이터가 개발계에 하나도 없어 지금은 확인할 수 없다** — AI 티켓 KAN-72(타임스탬프 붙은 세그먼트 생산)와 관리자 업로드 적재가 선행이다. 데이터가 한 편이라도 들어오면 개발계 앱에서 바로 보인다(OTA 로 나간다, 재빌드 없음).
- 2026-09-20 13:50 **재확인 — AI 티켓(KAN-72)이 닫혔지만 실기기 확인은 아직 불가능하다.** FE 코드는 고칠 것이 없다.
  - KAN-72 는 **파이프라인 코드** 반영이다(TTS 단계가 `script-segments.json` 생성 → 업로드 화면이 `script_file` 첨부). 그 처리 기록에 따르면 배포 뒤 새로 제작·발행한 편이 아직 없고 기존 85편은 소급 대상이 아니다 — **대본이 적재된 콘텐츠는 아직 0편이다.**
  - **더 큰 걸림돌**: 운영 → 개발계 콘텐츠 동기화(`backend/deploy/sync-content-*.sh`)의 `TABLES` 에 `content_scripts` 가 없다. 운영에 대본이 발행돼도 개발계 앱에는 닿지 않는다 → 인프라 티켓 **KAN-83**(`tickets/infra/pending/content-sync-include-scripts.md`) 발행.
  - 개발계 서버 로그: 대본 조회(`/script`) 호출 0건. 모든 콘텐츠가 `has_script: false` 라 버튼이 안 뜨는 정상 동작이다.
  - **실기기 확인이 가능해지는 조건**: ① 대본이 실린 편이 운영에 한 편 발행된다 ② KAN-83 이 반영돼 개발계로 넘어온다. (운영 앱으로 보려면 runtime 4 운영 빌드가 먼저다.)

