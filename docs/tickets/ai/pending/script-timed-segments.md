# [AI] 발행 패키지에 타임스탬프 붙은 대본 세그먼트를 싣는다 — 앱의 자막(대본) 기능용

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/worker/src/tts/`(`elevenlabs.ts` `synthDialogueWithTimestamps`·`locateTurnStarts`, `audio.ts` `retimePieces`) · 패키지 산출 단계 · `docs/ai/spec/06-audio.md` · `docs/ai/spec/08-infra.md` 2장 |
| 요청 파트 | 프론트엔드 → AI(파이프라인) |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | PM 결정 — 자막(대본) 기능을 실서버에서 연다 |
| 근거 문서 | PRD FR-25(P1) · `features/player.md` 4.6 · `ai/spec/06-audio.md` 6장(턴 타임스탬프 부산물 — "스크립트 싱크 대비") · `features/admin.md` 3.1 `script_segments` |
| 중요도 | **Medium**(3일 안) — 데이터가 없으면 API·화면이 있어도 보여줄 것이 없다 |
| 상태 | 대기 |
| Jira | KAN-72 |
| 짝 티켓 | `tickets/backend/pending/script-api.md`(조회·적재) · `tickets/frontend/pending/script-real-api.md`(연동) |

## 배경

앱 플레이어의 대본 패널은 **재생 위치에 맞춰 현재 문단을 강조하고 따라 스크롤**하며, 문단을 탭하면 그 구간으로 이동한다. 그러려면 대본이 **문단(턴)마다 시작·끝 시각**을 가져야 한다.

파이프라인은 이미 `/text-to-dialogue/with-timestamps`로 **턴 경계 시각**을 잡고 있다(`spec/06-audio.md` 6장 — 화자별 배속을 위해). 문서에도 이 부산물이 "스크립트 싱크 대비"라고 적혀 있다. 지금은 `timestamps.json`이 "턴별 합성 시"에만 S3 에 남고, 발행 패키지(`upload-meta.json`)에는 실리지 않는다.

## 요청

발행 패키지에 **앱이 그대로 쓸 수 있는 세그먼트 JSON**을 싣는다.

```json
[
  { "start_sec": 0, "end_sec": 12.4, "speaker": "윤아", "text": "…" },
  { "start_sec": 12.4, "end_sec": 27.9, "speaker": "이음", "text": "…" }
]
```

- 단위는 **턴(한 화자의 한 번의 발화)**. 턴이 아주 길면(예: 25초 초과) 문장 경계에서 나눠도 된다 — 화면에서 한 문단이 너무 길면 현재 위치를 가늠하기 어렵다. 나눌지·기준은 AI 파트 판단.
- **시각은 최종 배포본(`dist.mp3`) 기준이어야 한다.** 화자별 배속(`atempo` — 윤아 1.2 등)과 이어 붙이기를 **적용한 뒤**의 시각이다. 배속 전 원본 기준 시각을 그대로 쓰면 뒤로 갈수록 자막이 밀린다. `retimePieces` 가 구간 길이를 바꾸므로 그 결과에서 다시 셈해야 한다.
- 인트로·아웃트로·효과음처럼 대본에 없는 구간이 앞뒤에 붙으면 그 오프셋도 반영한다.
- `text` 는 **읽을 글**이다 — TTS 용 표기(발음 교정, 말줄임 태그, 감정 태그 등)가 아니라 사람이 읽는 원문. 둘이 다르면 원문 쪽을 싣는다.
- `speaker` 는 화면에 그대로 찍힌다("윤아"·"이음"). 1인 낭독이면 null.
- 정렬이 실패해 **원속 폴백**된 요청이 섞인 에피소드도 시각이 맞아야 한다(폴백 구간은 배속이 안 걸렸으므로 그대로 셈). 턴 경계를 아예 못 잡은 에피소드는 세그먼트를 **싣지 않는다** — 틀린 자막보다 없는 편이 낫다(앱은 없으면 버튼을 숨긴다).
- 실을 자리: `upload-meta.json` 의 `script_segments` 필드(관리자 업로드가 받는 이름 — `features/admin.md` 3.1) 또는 패키지 안 별도 `script-segments.json`. BE 티켓과 맞춘다.

## 기존 발행분

이미 발행된 에피소드는 S3 에 `timestamps.json`(있는 경우)·`script.md`·`dist.mp3`가 남아 있다. 소급 생성이 가능한지(타임스탬프가 남은 에피소드 수, 없는 것은 강제 정렬로 복원할지)를 **조사만** 해서 이 티켓에 적는다 — 소급 자체는 범위 밖이다.

## 범위 밖

- 글자·단어 단위 하이라이트(노래방식) — 요구 없음. 턴 단위면 된다.
- 번역·요약.
- BE 적재·조회 — BE 티켓.

## 완료 조건

- Given 새로 제작한 에피소드 / When 발행 패키지를 연다 / Then 턴마다 `start_sec`·`end_sec`·`speaker`·`text` 를 가진 세그먼트 목록이 들어 있고 `start_sec` 오름차순이며 겹치지 않는다
- Given 화자별 배속이 걸린 에피소드 / When `dist.mp3` 의 임의 턴 시작 시각으로 이동해 듣는다 / Then 그 턴의 첫 마디가 0.5초 안에 들린다(앞·중간·끝 세 지점 확인)
- Given 턴 경계를 못 잡은 에피소드 / When 패키지를 만든다 / Then 세그먼트를 싣지 않고 실행 기록에 사유가 남는다
- Given `ai/spec/06-audio.md`·`08-infra.md` / When 읽는다 / Then 세그먼트 산출물의 형식·시각 기준(배포본)·실패 시 동작이 적혀 있다
- Given 기존 발행분 / When 이 티켓의 조사 결과를 읽는다 / Then 소급 가능한 편수와 방법이 적혀 있다

## 처리 기록

- 2026-09-19 — **BE 적재 계약 확정(KAN-71)**: 발행·재발행 multipart 파트 **`script_file`**(세그먼트 JSON 배열 파일, ≤2MB, `enrichment_file`과 같은 방식). 패키지 안 `script-segments.json`으로 두고 웹 `/api/publish` 라우트가 첨부하면 된다. 서버 검증: 1~2000개, `start_sec ≥ 0`, `end_sec > start_sec`, 오름차순·겹침 없음(50ms 오차), text ≤2000자, speaker ≤50자 또는 null, 모르는 키 거부 — 어긋나면 파일만 거부(`script_applied: false` + 사유). 대본 파일만 보내는 재발행은 버전을 올리지 않으므로 **기존 발행분 소급은 `PATCH /admin/contents/:id` + `script_file`** 로 가능하다. 계약: `admin-api.md` 4.6·4.10.
