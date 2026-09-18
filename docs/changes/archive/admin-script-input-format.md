# [문서] 스크립트 입력 방식 미결을 닫는다 — 파이프라인 세그먼트 JSON(`script_file`)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/admin.md` 3.1(`script_segments` 행) · 8장 미결("스크립트 입력 방식") · `features/player.md` 4.6 |
| 요청 파트 | 문서(구현은 백엔드 `feat(be)/content-script-api`, 계약은 `spec/api/admin-api.md` 4.6·4.10 · `spec/api/player-api.md` 4.1·4.7에 반영) |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | KAN-71 구현 — `admin.md` 8장이 "수동 입력인지 SRT/VTT 업로드인지 미정"으로 남아 있고, 3.1의 세그먼트 형상에 `speaker`가 없다 |
| 심각도 | 하 — 계약·스키마는 반영됐고 동작 규칙 문장만 어긋난다 |

## 바꿀 것

1. `admin.md` 3.1 — `script_segments` 행을 `script_file`(multipart 파트) · `[{ start_sec, end_sec, speaker, text }]`로. "선택 (FR-25, P1)" → "선택 (FR-25 — 2026-09-19 구현)".
2. `admin.md` 8장 미결 — "스크립트 입력 방식"을 **파이프라인이 만드는 세그먼트 JSON을 그대로 첨부**로 닫는다(SRT/VTT·수동 입력은 하지 않는다). 검증 실패는 파일만 거부하고 발행은 진행한다.
3. `player.md` 4.6 — "스크립트가 있는 콘텐츠만 버튼을 노출한다(발급 응답 `has_script`), 없으면 빈 배열, 접근 통제는 오디오와 같다" 한 줄.

## 완료 조건

- Given `admin.md` 3.1·8장 / When 읽는다 / Then 입력 형식이 파이프라인 JSON으로 확정돼 있고 `speaker`가 형상에 있다
- Given `player.md` 4.6 / When 읽는다 / Then 버튼 노출 조건과 접근 통제 문장이 있고 `player-api.md` 4.7을 가리킨다

## 처리 기록

- **반영 날짜: 2026-09-19** — `features/admin.md` 3.1 `script_file` 행·미결 해소, `features/player.md` 4.6에 버튼 노출·접근 통제·speaker 규칙 추가. 같은 PR(`feat(be)/content-script-api`)에서 archive로 옮김.
