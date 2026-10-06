# [BE] 구간 제목(sections) — 자막 저장 테이블에 추가하고 재생 발급 응답으로 내려주기

| 항목 | 값 |
|---|---|
| 대상 | `backend/domain.md` 5.3 `content_scripts` · `modules/admin`(`script_file` 검증·적재) · `modules/playback`(재생 발급 응답) · `spec/api/admin-api.md` 4.6·4.10 · `spec/api/player-api.md` 4.1 |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌 ([KAN-137](https://runtime364.atlassian.net/browse/KAN-137)) |
| 담당 | 박준현 |
| 발행 날짜 | 2026-10-06 |
| 시작 날짜 | 2026-10-06 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| Jira | [KAN-144](https://runtime364.atlassian.net/browse/KAN-144) |
| 근거 문서 | `tickets/ai/pending/section-summary-generation.md`([KAN-137](https://runtime364.atlassian.net/browse/KAN-137)) · `tickets/frontend/pending/player-bar-section-summary.md`([KAN-127](https://runtime364.atlassian.net/browse/KAN-127)) · `backend/domain.md` 5.3 · `spec/api/admin-api.md` 4.6 · `spec/api/player-api.md` 4.1·4.7 |
| 중요도 | Low — KAN-137·KAN-127과 같은 마감. FE 구현(KAN-127)이 이 티켓을 기다린다 |
| 상태 | **완료** (2026-10-06) |

> 이 문서는 Jira KAN-144 본문(2026-10-06 발행)을 저장소로 옮긴 것이다 — 발행 시 `pending/`에 마크다운이 함께 올라오지 않아, 처리 PR에서 본문 그대로 `archive/`에 둔다.

## 배경

KAN-127(FE)은 재생 중 미니 플레이어 위에 *지금 듣는 구간*을 보여 준다. 데이터는 KAN-137(AI)에서 만들고, 2026-10-06 박수헌이 이렇게 정했다.

- **구간 = 대본의 구간 제목 그대로.** 파이프라인 대본 본문은 이미 `### #1 제목` 형태로 4~8개 구간으로 나뉘어 있다(90편 실측 중앙값 5개). 앞뒤 구역은 인트로·도입·마무리라는 이름으로 내보낸다 — 한 편에 7~11개.
- **시작 시각은 자막 세그먼트와 같은 배포본 기준**이고 파이프라인이 만든다. 구간 첫 턴의 세그먼트 시각을 쓰므로 추가 정렬이 없다. 첫 구간(`인트로`)은 0초부터다 — 앞 징글 구간도 인트로로 본다.
- **저장은 자막 저장 테이블(`content_scripts`)에 함께.** 시각이 오디오에 묶여 있어 자막과 운명이 같다 — 오디오가 바뀌면 함께 교체되고, 자막이 지워지면 함께 지워져야 한다.

## 요청

1. **문서 먼저** — `domain.md` 5.3에 `sections` 컬럼, `admin-api.md` 4.6 `script_file` 형식, `player-api.md` 4.1 응답 필드를 적는다.
   ```
   content_scripts
     sections   jsonb   [{ start_sec, title }]   기본 '[]'
   ```

2. **업로드(`script_file`) — 객체 형식을 추가하고, 지금 배열 형식도 계속 받는다**
   ```json
   {
     "segments": [ { "start_sec": 7.0, "end_sec": 12.4, "speaker": "윤아", "text": "…" } ],
     "sections": [
       { "start_sec": 0, "title": "인트로" },
       { "start_sec": 31.2, "title": "도입" },
       { "start_sec": 74.8, "title": "깬 직후의 멍함은 잠이 모자란 신호가 아니다" },
       { "start_sec": 1052.3, "title": "마무리" }
     ]
   }
   ```
   - 배열 형식(지금) = 구간 없음(`sections = []`). 이미 발행된 콘텐츠·파트너 콘텐츠는 그대로 동작한다.
   - `segments` 검증은 지금 규칙 그대로.
   - `sections` 검증: 0~30개, `start_sec ≥ 0`, **`start_sec` 엄격한 오름차순**(같은 값 금지), 마지막 `start_sec` < 오디오 길이, `title` 비어 있지 않은 문자열 ≤ 60자, 모르는 키 거부. **하나라도 어긋나면 지금 규칙처럼 파일을 통째로 거부**하고 `script_rejected_reason`에 사유를 남긴다.
   - 적재: `segments`와 같은 행·같은 트랜잭션에서 통째로 교체한다. **대본 삭제 규칙(오디오를 바꾸는 재발행에 `script_file`이 없거나 거부 → 행 삭제, `admin-api.md` 4.10)이 그대로 구간에도 적용된다.**
   - `script_file` 단독 PATCH(버전 무변경)도 같은 형식을 받는다.

3. **재생 발급 응답(`player-api.md` 4.1)에 `sections` 추가** — `[{ start_sec, title }]`, 없으면 `[]`.
   - 대본 조회(4.7)가 아니라 발급 응답에 싣는 이유: 4.7은 대본 패널을 **처음 열 때만** 부르게 돼 있고(`player.md` 4.6) 응답이 수십 KB다. 미니 플레이어는 재생을 시작할 때부터 구간이 필요하다. 구간은 10개 안팎·1KB 미만이다.
   - 접근 통제는 발급과 같다(판정을 통과한 응답에 실린다). 새 엔드포인트·에러 코드는 없다.

4. 화면 규칙은 FE 몫(KAN-127 · `player.md`) — 현재 구간은 `start_sec ≤ 재생 위치`인 마지막 항목, 빈 배열이면 영역을 숨긴다.

## 파이프라인 쪽 (KAN-137 · 박수헌)

- 패키지가 `script-segments.json`을 객체 형식(`segments` + `sections`)으로 만든다. **이 티켓이 배포되기 전에는 지금 배열 형식을 그대로 보낸다** — 객체를 먼저 보내면 파일이 거부돼 자막까지 빠진다.
- 기존 발행분은 지금 앱에 나가 있는 오디오와 맞는 구간 시각을 다시 만들 수 없다(2026-10-06 재합성으로 파이프라인의 자막 시각이 새 오디오 기준이 됐다). 소급하지 않고, 배포 음질 결정 뒤 재발행(새 오디오 + 자막 + 구간)에서 함께 싣는다.

## 완료 조건

- Given `domain.md`·`admin-api.md`·`player-api.md` / When 읽는다 / Then `sections` 컬럼, `script_file` 객체 형식과 검증, 발급 응답 필드가 적혀 있다
- Given `sections`가 든 객체 형식 `script_file` / When 업로드·재발행한다 / Then `segments`와 `sections`가 같은 행에 저장되고, 발급 응답에 `sections`가 그대로 내려간다
- Given 지금 배열 형식 `script_file` / When 업로드한다 / Then 지금처럼 적재되고 발급 응답의 `sections`는 `[]`다
- Given 오름차순이 아니거나 `title`이 빈 `sections` / When 업로드한다 / Then 파일이 통째로 거부되고 `script_rejected_reason`에 사유가 남는다
- Given 오디오를 바꾸는 재발행에 `script_file`이 없다 / When 처리한다 / Then 대본 행과 함께 구간도 사라지고 발급 응답의 `sections`는 `[]`다

## 처리 기록 (반영 날짜: 2026-10-06 — PR `feat(be)/content-script-sections`)

요청 1~3을 그대로 구현했다. 새 엔드포인트·에러 코드·env는 없다.

**스키마** — 마이그레이션 `1788800000000-AddContentScriptSections`: `content_scripts.sections jsonb NOT NULL DEFAULT '[]'`. 기존 행은 구간 없음으로 시작한다(소급 없음 — 위 "파이프라인 쪽").

**업로드 검증·적재**(`admin/script-file.ts` · `admin-content.service.ts`)
- `parseScriptFile`이 배열 형식과 `{ segments, sections }` 객체 형식을 모두 받아 `ScriptDocument { segments, sections }`로 돌려준다. 객체 형식에서 `sections` 생략은 `[]`와 같다. 최상위 모르는 키·항목 모르는 키 거부.
- `sections` 검증은 요청대로: 0~30개(`MAX_SCRIPT_SECTIONS`), `start_sec ≥ 0`, 엄격한 오름차순, `title` 비어 있지 않은 ≤60자(`MAX_SCRIPT_SECTION_TITLE_LENGTH`). 구간이 어긋나면 세그먼트까지 거부한다 — 같은 배포본의 시각이라 한쪽만 믿을 근거가 없다.
- **"마지막 `start_sec` < 오디오 길이"는 파일만 보고는 알 수 없어** 길이를 뽑은 뒤 `rejectSectionsPastDuration`이 따로 본다. 업로드(4.6)·오디오를 바꾸는 재발행은 새 파일에서 뽑은 길이, 대본 단독 PATCH(4.10 버전 무변경)는 현재 `contents.duration_sec`이다. 어긋나면 결과를 거부로 바꾸고 사유가 `script_rejected_reason`에 그대로 실린다.
- 적재는 `ContentScriptRepository.upsert(contentId, { segments, sections })` 한 번 — 같은 행·같은 트랜잭션. 대본 삭제 규칙은 행 단위라 구간도 함께 사라진다(변경 없음). 감사 로그 `content.script`와 적용 로그에 `section_count`를 더했다.

**발급 응답**(`playback/audio-url.service.ts` · `issue-audio-url-response.dto.ts`)
- `ContentService.findScriptSummary(contentId)` → `{ hasScript, sections }`. 구간 컬럼만 `select`하고 세그먼트 본문은 읽지 않는다(4.7의 몫). 종전 `findScriptContentIds([id])` 호출을 이것으로 바꿨고, `findScriptContentIds`는 관리자 목록용으로 남겼다.
- 응답 필드 `sections: [{ start_sec, title }]`, 없으면 `[]`. jsonb 그대로 나가는 형상이라 변환 경계를 두지 않는다(`ScriptSegment`와 같은 규칙).

**문서** — `domain.md` 5.3(컬럼·규칙), `admin-api.md` 4.6(두 형식·검증·저장)·4.10(교체·삭제·길이 기준), `player-api.md` 4.1(응답 예시·필드 표·참조 테이블).

**확인** — 단위 테스트: `script-file.spec`(객체 형식·구간 검증 7종·상한·길이 검사), `admin-content.service.spec`(객체 형식 저장, 길이 초과 거부 — 업로드는 진행), `audio-url.service.spec`(구간 전달·없음은 `[]`). content·admin·playback 모듈 35 스위트 301건 통과. 실제 DB(e2e)는 CI에서 돈다.

**완료 조건 대조** — 다섯 항목 모두 위 구현으로 충족. 마지막 항목(오디오 재발행에 `script_file` 없음 → 행 삭제)은 기존 동작 그대로이고 구간이 같은 행이라 자동으로 따라온다.

**다른 파트에 알릴 것**
- **KAN-137(박수헌)**: 이 PR이 **운영에 배포된 뒤** 객체 형식으로 보낸다. 배포 전에 보내면 파일이 거부돼 자막까지 빠진다. 거부 사유는 업로드 응답 `script_rejected_reason`으로 돌아온다.
- **KAN-127(이주호)**: 발급 응답 `sections` 계약 확정 — `player-api.md` 4.1. 현재 구간 = `start_sec ≤ 재생 위치`인 마지막 항목, `[]`면 숨김.
