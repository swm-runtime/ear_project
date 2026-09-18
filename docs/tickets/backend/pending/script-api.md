# [BE] 스크립트(자막) 조회 API — 실서버에서 대본 패널을 연다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/content/`(`content_scripts` 소유) · `backend/src/modules/playback/`(재생 발급 응답) · `backend/src/modules/admin/`(업로드 적재) · `docs/spec/api/player-api.md` · `docs/spec/api/admin-api.md` · `docs/backend/domain.md` 5.3 |
| 요청 파트 | 프론트엔드 → 백엔드 |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | PM 결정 — 자막(대본) 기능을 실서버에서 연다. FE 화면은 이미 있고 mock 으로만 돈다 |
| 근거 문서 | PRD FR-25(P1) · `features/player.md` 4.6 · `spec/uiux/player-uiux.md` 4.6 PL6 · `spec/api/player-api.md` 2장·9장("P1 구현 시 추가") · `backend/domain.md` 5.3 · `backend/architecture.md` 9.4 |
| 중요도 | **Medium**(3일 안) — 이게 없으면 FE·AI 쪽 작업이 끝나도 기능을 열 수 없다(세 티켓의 병목) |
| 상태 | 대기 |
| Jira | KAN-71 |
| 짝 티켓 | `tickets/ai/pending/script-timed-segments.md`(데이터 생산) · `tickets/frontend/pending/script-real-api.md`(연동) |

## 배경

플레이어의 **대본 패널(PL6)** 은 FE 에 구현돼 있다 — 현재 문단 강조, 재생 위치 따라가기, 문단 탭 → 그 구간으로 이동. 하지만 **실서버 계약이 없어** mock 빌드에서만 보인다(`frontend/src/features/player/hooks/useScriptQuery.ts` — mock 이 아니면 항상 `null` → 버튼을 그리지 않는다).

스키마(`content_scripts`, `domain.md` 5.3)와 관리자 업로드 필드(`admin.md` 3.1 `script_segments`)는 문서에 있고, 엔드포인트만 "P1 구현 시 추가"로 비어 있다.

## 요청

### 1. 스크립트 조회 엔드포인트

`GET /contents/:id/script` (이름·위치는 BE 판단 — `player-api.md`에 추가).

```json
{
  "segments": [
    { "start_sec": 0, "end_sec": 12.4, "speaker": "윤아", "text": "…" },
    { "start_sec": 12.4, "end_sec": 27.9, "speaker": "이음", "text": "…" }
  ]
}
```

- **접근 통제는 오디오와 동일해야 한다**(`architecture.md` 9.4 — "오디오만 막고 텍스트를 열어두지 않는다"). 재생 권한이 없는 사용자(한도 소진·회수·미발행)가 대본만 읽을 수 있으면 안 된다. 재생 발급(`POST /contents/:id/play`)을 통과한 세션에만 내주는 방식이 가장 단순해 보인다 — 방식은 BE 판단.
- 스크립트가 없는 콘텐츠는 **404 가 아니라 `segments: []`**. FE 는 빈 배열도 "없음"으로 취급해 버튼을 그리지 않는다.
- 세그먼트는 `start_sec` 오름차순, 겹치지 않는다. 초 단위 소수 허용.

### 2. `segments` 에 `speaker` 추가

`domain.md` 5.3 의 세그먼트는 `{ start_sec, end_sec, text }`다. 대본이 **윤아·이음 2인 대화체**(`ai/PIPELINE.md`)라 화자 구분이 필요하다 — FE 는 화자 이름을 문단 머리에 그린다. `speaker: string | null`(1인 낭독·파트너 콘텐츠는 null). jsonb 라 마이그레이션 없이 계약·문서만 바꾸면 된다.

### 3. 재생 발급 응답에 스크립트 존재 플래그

`POST /contents/:id/play` 응답(`player-api.md` 4.2)에 `has_script: boolean`. FE 가 **버튼을 그릴지**를 조회 전에 알아야 한다 — 없으면 플레이어를 열 때마다 스크립트를 미리 받아야 버튼 노출을 정할 수 있다(`player-api.md` 9장에 이미 "발급 응답의 스크립트 존재 플래그"로 적혀 있다).

### 4. 업로드 적재

관리자 업로드(`admin-api.md` 4.6)가 `script_segments`를 받아 `content_scripts`에 적재한다(`admin.md` 3.1 에 선택 필드로 이미 있다 — "스크립트 업로드"는 `admin-api.md` 2장에서 P1 로 빠져 있다). 입력은 AI 파이프라인이 만드는 JSON 을 그대로 받는 것을 제안한다 — 형식은 짝 티켓(AI)에서 위 조회 응답과 같은 모양으로 맞춘다. `admin.md` 8장 미결("수동 입력인지 SRT/VTT 인지")은 "파이프라인 JSON"으로 닫는다.

### 5. (같은 김에) 재생 발급 응답에 `topics`

`changes/pending/player-controls-redesign.md` 계약 요청 1 — `POST /contents/:id/play` 응답에 `topics: [{ id, name }]`. 플레이어의 카테고리 줄이 진입 경로에 따라 비는 문제(2026-09-18 FE 에서 우회 수정, #478)의 근본 해결이다. 같은 응답을 건드리는 작업이라 함께 묶는 것을 제안한다 — 분리해도 된다.

## 범위 밖

- 스크립트 **생산**(타임스탬프가 붙은 세그먼트 만들기) — AI 티켓.
- 스크립트 검색·부분 조회 — 요구가 없다(`domain.md` 5.3).
- 기존 발행분의 스크립트 소급 적재 — 데이터가 준비되면(AI 티켓) 별도 배치로.

## 완료 조건

- Given 스크립트가 적재된 콘텐츠를 재생 중인 사용자 / When `GET /contents/:id/script` / Then `segments` 가 `start_sec` 오름차순으로 오고 각 항목에 `speaker`(또는 null)·`text` 가 있다
- Given 스크립트가 없는 콘텐츠 / When 조회한다 / Then 200 + `segments: []`
- Given 재생 권한이 없는 사용자(한도 소진·회수된 콘텐츠·미로그인) / When 조회한다 / Then 오디오 발급이 거부되는 것과 같은 에러로 거부된다
- Given 재생 발급 응답 / When 읽는다 / Then `has_script` 가 실제 적재 여부와 일치한다
- Given 관리자 업로드에 `script_segments` 를 실었다 / When 발행한다 / Then `content_scripts` 에 적재되고 위 조회로 같은 내용이 나온다
- Given `player-api.md`·`admin-api.md`·`domain.md` 5.3 / When 읽는다 / Then 엔드포인트·`has_script`·`speaker`·업로드 형식이 적혀 있다
