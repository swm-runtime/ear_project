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
| 상태 | 진행 중 — 1·1-1·4번 구현(2026-10-07), 2번 스위치 꺼 둠(KAN-151 운영 배포 대기), 3번 소급 준비 |

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

## 처리 기록

- **2026-10-07 진행 — 생성·스위치 구현, pending 유지** (브랜치 `feat(ai)/section-kind-summary`)
  - 1 `kind`: `tts/sections.ts` `sectionKind` — 구간을 연 턴의 구역(인트로 `intro`·도입 `lead`·본문 단락과 옛 "본문" 덩어리 `body`·마무리 `outro`). `buildSections` 가 구간마다 그 구간 대사(`texts`)도 돌려준다
  - 1-1 `summary`: AI 요약(박수헌 2026-10-07 "AI 요약으로"). 구간 제목을 그대로 쓰는 안은 접었다 — 발행 45편 구간 312개 중 141개가 "인트로·도입·마무리", 단락 제목 48%가 20자 초과(중앙값 20·최대 32), 앱이 요약 없으면 제목을 대신 보여 제목 복사 = 안 보내기와 같다. `tts/section-summary.ts`: 한 편에 한 번(gpt-5.6-terra, 규칙 자산 `skills/tts/section-summary.md` summary-v1), 코드 검사(빈 값·줄바꿈·20자 초과) → 어긋난 구간만 한 번 다시 → 그래도 어긋나면 그 구간 요약 없음. 캐시 `section-summaries.json`. TTS 단계·`script_align`·`tts:sections` 세 곳이 같이 쓴다. 시험 X260919-001: 8구간 11~16자, 1.3센트
  - 2 전송: `apps/web/lib/section-details.ts` `SEND_SECTION_DETAILS = false` — KAN-151 이 dev 에만 있고 운영(main)에 없다(운영 서버는 모르는 키를 거부). 켜면 kind·summary 를 싣고 서버가 거부할 값만 뺀다
  - 4 문서: `ai/spec/06-audio.md` 7장 · `07-publish.md`
  - 남은 것: 3 소급(`tts:sections --apply` — 배포 뒤 자산이 활성화되면) → KAN-151 운영 배포 확인 → 스위치 켜기 → 발행분에 대본 단독 PATCH 로 일괄 전송(버전·재생 위치 그대로). 완료 조건 3·4 는 그 뒤에 확인한다
