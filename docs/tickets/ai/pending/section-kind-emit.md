# [AI] 구간에 구역(`kind`)·한 줄 요약(`summary`) 싣기 + 기존 발행분 소급

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/worker/src/tts/sections*`(구간 생성) · `stages/script-align.ts` · `cli/sections.ts`(소급) · `apps/web/lib/script-file.ts`·`/publish`(전송) · `ai/spec/06-audio.md` 7장 · `07-publish.md` |
| 요청 파트 | AI(파이프라인) |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-152](https://runtime364.atlassian.net/browse/KAN-152) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | `tickets/backend/pending/section-kind-field.md`(KAN-151) — 서버 검증이 지금 **모르는 키를 거부**한다. 서버가 `kind`를 받기 전에 실어 보내면 대본 적재가 거부된다. 생성·소급 준비는 먼저 해도 된다 |
| 근거 문서 | PM 결정(2026-10-07) · `player.md` 4.6-1 · KAN-137(`tickets/ai/archive/section-summary-generation.md`) |
| 중요도 | Low — PM 발행(2026-10-07). 중요도 미지정이라 이번 주 마감으로 잡았다 |
| 상태 | 대기 |

## 배경

플레이어 구간 카드가 **"개요 · 본론 · 결론"** 라벨을 띄운다(PM 2026-10-07 — 인트로·도입 = 개요, 본문 단락 = 본론, 마무리 = 결론). 구간을 만들 때 파이프라인은 각 구간이 대본의 어느 구역(`## [인트로]` `## [도입]` `## [본문]`+`### #n` `## [마무리]`)인지 이미 안다 — 그 값을 구간마다 싣는다.

## 할 일

1. **생성** — `script-sections.json` 항목에 `kind`: `## [인트로]` → `intro`, `## [도입]` → `lead`, `## [본문]`의 `### #n` 단락(단락 제목이 없는 옛 편의 "본문" 한 덩어리 포함) → `body`, `## [마무리]` → `outro`
1-1. **`summary`**(PM 2026-10-07 "제목 + 요약 두 줄"): 그 구간 내용을 요약한 **한 줄, 공백 포함 20자 이내**(카드 안쪽 폭 약 310pt · 13pt 기준 한 줄 23자 안팎). 인트로·도입·마무리 포함 **모든 구간 필수**. 대본의 그 구간 턴에서만 뽑는다(새 사실 금지). 앱은 위에 "개요·본론·결론"(제목), 아래에 이 요약 한 줄 — 합쳐 두 줄
2. **전송** — 발행·재발행의 `script_file` 객체(`sections`)에 그대로 싣는다. **서버 KAN 선행이 운영(main)에 나간 뒤** 켠다(종전 `SEND_SCRIPT_SECTIONS` 처럼 스위치로 두면 안전)
3. **소급** — 구간이 있는 기존 40편(운영 실측 2026-10-07)에 `kind`를 붙여 다시 올린다(`tts:sections --apply` — TTS 없이, 시각은 그대로)
4. `ai/spec/06-audio.md` 7장 · `07-publish.md`에 형식 `{ start_sec, title, kind }` 기록

## 완료 조건

- Given 새로 렌더한 에피소드 / When `script-sections.json`을 본다 / Then 모든 항목에 `kind`가 있고 인트로 `intro` · 도입 `lead` · 단락 `body` · 마무리 `outro`다
- Given 같은 파일 / When `summary`를 본다 / Then 모든 항목에 있고 공백 포함 20자 이내 한 줄이며 대본에 없는 사실이 없다
- Given 서버 선행 배포 후 / When 발행한다 / Then 대본이 적재되고 재생 발급 응답 `sections[].kind`가 내려간다
- Given 소급 후 운영 DB / When `content_scripts.sections`를 본다 / Then 구간이 있는 행의 모든 항목에 `kind`·`summary`가 있다
