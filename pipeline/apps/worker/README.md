# @ear/worker — 파이프라인 워커

> 명세: [spec/10](../../../docs/ai/spec/10-webapp.md) · 큐: `jobs` 테이블 · 규칙 자산: DB `prompt_assets`(3.2) · 산출물: 파이프라인 S3(3.3) — `WORK_ROOT` 는 그 로컬 캐시(레포 밖)

UI(또는 CLI)가 `jobs`에 넣은 작업을 집어서 실행한다. **어디서 띄우느냐로 역할이 갈린다.**

| 위치 | .env | 집는 작업 | 비고 |
|---|---|---|---|
| 팀원 Mac (로컬) | `EXECUTOR=claude-cli` · `CAPABILITIES=ai,io` | 전부 (AI: cluster·draft·qa·critic / IO: sweep·domain_check·tts·package) | AI 단계는 `claude -p` 새 프로세스 = **본인 Claude Code 구독**으로 실행. 구독의 5시간 사용량 창을 대화형 사용과 공유 |
| EC2 (서버) | `EXECUTOR=none` · `CAPABILITIES=io` | IO 만 | 구독 토큰을 서버에 두지 않는다. AI 를 서버에서 돌리려면 `EXECUTOR=api` + `ANTHROPIC_API_KEY` (미결 #12 후 — 형태는 spec/10 3.1). `ai-server/`(FastAPI, 임베딩 API)와 **같은 인스턴스**에 올린다 — 대본 생성은 FastAPI가 아니라 이 워커의 실행기 몫 (spec/10 2장 정렬) |

## 준비 (로컬)

1. Node 20+ · Claude Code 설치 + 로그인(`claude`에서 `/login`) — 워커는 이 로그인을 그대로 쓴다
2. `pipeline/` 에서 `npm install`
2-1. **규칙 자산 시딩 (팀에서 최초 1회)** — Supabase SQL 에디터에서 `supabase/migrations/0009_prompt_assets.sql` 적용 → `npm run assets:import` (git `docs/ai/skills/` 7개를 DB 에 active 로). 자산이 없으면 워커는 AI 작업 시작 시 **기동 실패**한다(폴백 없음 — spec/10 3.2). 확인: `npm run assets:status`
3. `apps/worker/.env` 작성 (`.env.example` 참조 — DATABASE_URL 비밀번호는 팀 비밀 채널로). `WORK_ROOT` 는 **레포 밖**, `ASSET_ROOT` 는 비우면 `docs/ai`
4. **산출물 저장소** — 노트북은 `PIPELINE_WEB_URL`(웹 주소) + `PIPELINE_WORKER_TOKEN`(팀 비밀 채널)으로 web 모드. AWS 키를 받지 않는다. 워커는 기동 시 접근을 확인하고 실패하면 멈춘다 — 확인: `npm run storage:status`

## 실행

```bash
npm run worker                    # 계속 폴링 (Ctrl+C 시 진행 중 작업을 큐로 되돌림)
npm run worker -- --once          # 작업 1건만 처리
npm run worker -- --enqueue sweep '{"mid_topic":"심리학"}'   # 작업 넣기 (UI 대신 — 테스트용)
```

## 연쇄 규칙 (워커가 수행)

```
sweep(중분류) ──done──▶ cluster(중분류) ──▶ backlog proposed  ★게이트 1: 사람이 UI/DB에서 approved 로
backlog approved ──워커 감지──▶ claimed + draft(attempt 1) ──▶ qa(1) ──통과──▶ critic ──▶ 사람 판정 대기
                                                                  └─실패──▶ draft(attempt 2, QA 피드백 최소 수정) ──▶ qa(2) ── … 3회 초과 ──▶ review_required
tts · package: 연쇄 없음 — 사람이 UI 에서 명시적으로 요청할 때만. tts = ElevenLabs 다중화자 합성(spec/06, 서버 IO 워커 — ELEVENLABS_API_KEY 필요, ffmpeg 필요) · package = upload-meta.json + packaged 전환(spec/07). 샘플 청취: `--enqueue tts '{"episode_id":"…","backlog_id":"…","sample_turns":6}'`
```

## 실행기 메모

- `claude -p` 를 **`--bare` 없이** 호출한다. bare 는 인증이 `ANTHROPIC_API_KEY` 전용이라 구독(OAuth)이 막힌다 (2026-08-29 실측).
  대신 `--disable-slash-commands --no-session-persistence --allowedTools … --add-dir …` 로 반입을 끊는다.
- 도구 허용은 단계별 최소: draft = `Read` + `WebFetch(domain:<소스 호스트>)` + `Write/Edit(episodes/<id>/**)` + `Bash(python3 *)`,
  qa/critic = `Read` + 리포트 파일만 `Write/Edit`. 풀 밖 도메인은 WebFetch 자체가 거부된다 (불변 원칙 2를 도구 권한으로 집행).
- 결과는 `--json-schema` 로 강제한 `structured_output` 만 신뢰한다. 리포트 본문은 파일로 쓴다.
- 모든 실행은 `runs` 에 `phase·attempt·prompt_version·model·executed_by(worker:<이름>)` + `cost_usd·tokens·worker_rev`(0009) 로 기록된다. `prompt_version` 은 env 가 아니라 **읽은 자산 버전**에서 유도된다(draft = guidelines 버전 · qa = QA 프롬프트 버전 · critic = 루브릭 버전).
- **규칙 자산은 DB 가 진실** — 작업 시작 시 active 묶음(또는 에피소드에 고정된 `episodes.asset_versions`)을 읽어 `WORK_ROOT/assets/<해시>/` 에 파일로 내려놓고 그 디렉토리를 `--add-dir` 로 넘긴다. spec/03·04·05 는 `ASSET_ROOT`(git 체크아웃)에서 함께 복사된다. 규칙 편집은 웹 `/assets`, git 사본 갱신은 `npm run assets:export`.
- **산출물은 S3 가 원본** (spec/10 3.3) — draft·qa·critic 은 시작 시 `episodes/{id}/` 를 `WORK_ROOT` 로 내려받고(웹에서 고친 대본·다른 워커의 산출물 포함) 끝나면 올린다. md5 가 ETag 와 같은 파일은 건너뛴다. 키는 `s3:episodes/{id}/script.md` 형식으로 `episodes.*_key`·`runs.artifacts` 에. 스윕 아카이브는 `sweeps/` 에 바로 올린다.

## 문제 해결

- `Not logged in` — 워커를 띄운 계정에서 `claude` 실행 후 `/login`. (`CLAUDE_CODE_OAUTH_TOKEN` 도 가능하나 개인 기기 외 사용 금지)
- 작업이 `claimed/running` 에서 멈춤 — heartbeat 15분 무응답 시 자동으로 `queued` 로 회수된다. 즉시 회수하려면 DB 에서 status 를 `queued` 로.
- 스윕 403/봇 검증 — 우회하지 않는다. 도메인 `note` 에 실패가 기록되고, 3회 연속 실패 시 사람이 `hold` 강등을 검토 (spec/02 4장).
- `산출물 저장소(…)에 접근할 수 없습니다` — web 모드: 웹이 떠 있는지·`PIPELINE_WEB_URL`·토큰 일치(401 이면 토큰) 확인. direct 모드: `PIPELINE_BUCKET`·자격증명(EC2 롤 / `AWS_PROFILE` + `aws sso login`) 확인.

## 비평 모델·병렬 실행 (2026-09-01)

- **비평은 Opus 고정** — `.env`의 `CRITIC_MODEL`(기본 `claude-opus-5`). 판정자 모델은 사람 판정(κ)의 대상이므로 바꾸면 회귀 세트 재검증(spec/09 7.4). 다른 단계는 `CLAUDE_MODEL`(비우면 CLI 기본 모델).
- **여러 워커 동시 실행 가능** — 큐가 `FOR UPDATE SKIP LOCKED`로 분배한다. 터미널 3개에서 `npm run worker`를 띄우면 비평 9편이 30분 안에 끝난다. 구독 5시간 창을 함께 쓴다는 점만 유의.
- `domain_check`는 AI 없는 IO 작업 — `EXECUTOR=none CAPABILITIES=io npx tsx src/index.ts --once`로 따로 처리해도 된다 (AI 워커와 병행 가능).
