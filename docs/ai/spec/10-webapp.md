# spec/10 — 파이프라인 웹 UI · 워커 (실행 계층 1의 구현)

> 상위: [PIPELINE.md](../PIPELINE.md) · 선행 설계: [spec/08 인프라](08-infra.md) 4장(웹 UI)·3장(실행 계층) · 데이터: [pipeline/supabase/schema.sql](../../../pipeline/supabase/schema.sql)
> 상태: **구현 중 (2026-08-31)** — M1 워커 검증·M2 웹 UI 골격 완료. 실측 반영: `--bare` 는 API 키 전용이라 미사용, npm workspaces 채택
> 결정 사항 (2026-08-29): ① EC2 1대에 web+worker(docker compose) ② 모노레포(npm workspaces — 2026-09-01 팀 레포 `pipeline/` 로 반입, 6장) ③ **AI 실행은 로컬 워커(팀원 각자의 Claude Code 구독, `claude -p` 헤드리스)** — API 키 실행기는 스위치로만 준비, 테스트 단계에는 사용하지 않음
> 정렬 (2026-09-01, `ai-server/`와의 역할 경계): **"AI 서버"는 EC2 배포 단위**다 — 같은 인스턴스에 `ai-server/`(FastAPI: 임베딩처럼 요청-응답형 **단발 추론 API**)와 이 파이프라인(web+worker: 큐·연쇄·산출물을 가진 **장기 실행 파이프라인**)이 함께 산다. 대본 생성·QA·비평은 **이 파이프라인 워커의 실행기**가 담당하며 FastAPI 엔드포인트로 만들지 않는다. **임시인 것은 실행기(`claude-cli`) 하나**다 — 큐·연쇄·sweep·domain_check·S3 IO는 API 전환(3.1) 뒤에도 그대로 남는다.

## 1. 목적과 경계

테이블 에디터를 대체하는 **팀 3인용 관리 화면** + 사람의 클릭을 파이프라인 실행으로 잇는 **워커**.
spec/08의 원칙 "UI와 실행기의 결합은 상태 테이블로만"을 그대로 따른다 — UI는 작업을 **요청**할 뿐이고,
실행은 워커가 상태를 보고 수행하며, 결과는 다시 DB·S3에 적힌다. UI와 워커는 서로 직접 통신하지 않는다.

이번 범위 (박수헌 요청, 2026-08-29):

| 요구 | 구현 |
|---|---|
| 콘텐츠 주제 관리 | `topics` CRUD 화면 |
| 소스 풀 관리 | `domains` 목록·판정 화면 (spec/01 4장의 판정 UI — 증거 note 표시, tier·license_basis 기입, decided_by=본인 자동) + 도메인 추가 |
| 스윕 요청 | 중분류 선택 → `sweep` 작업 생성 → 워커가 RSS 수집 → **자동으로 `cluster` 연쇄** |
| AI 생성 주제 목록 확인 | 백로그 보드 — 군집화 결과가 `proposed` 카드로 즉시 표시 (소스 묶음·축·타깃 정합) |
| 주제 선택 → 대본 생성 | 카드 승인(게이트 1) = `approved` 전환 → **자동으로 `draft` → `qa`(최대 3회) → `critic` 연쇄**. spec/09 v2의 L0 기계 검사·L1 지시 준수·L3 이해도 프로브는 이 연쇄에 추가 예정(L0 코드는 실측 완료, 편입 전) |
| 대본 확인·판정 | 에피소드 화면 — 대본·발췌·claims·QA·비평 리포트 열람 · **대본 턴 인라인 수정**(사람 피드백의 기본 형태, spec/09 3.1) + 수정 로그 + 재QA 요청 · 비평 플래그 판정 입력 |
| TTS 변환 | **수동 전용** — 사람이 에피소드에서 "TTS 변환" 버튼을 눌러야만 `tts` 작업 생성 (자동 연쇄 없음. 대본 고도화 단계이므로 구현만 해둠) |

만들지 않는 것: 제품 DB 연동, 커스텀 인증 서버, 별도 큐 인프라(SQS 등 — `jobs` 테이블이 큐), 모니터링 대시보드 선구축 (spec/08 7장 유지).

## 2. 구조도

```
                    ┌──────────────────────── AWS EC2 (1대, docker compose) ────────────────────────┐
                    │  ┌─ web (Next.js) ─────────────┐   ┌─ worker[server] ───────────────────────┐ │
   팀원 브라우저 ───HTTPS──▶│  화면 · Supabase Auth 로그인   │   │  AI 불필요 작업만: sweep(RSS)·tts·package │ │
                    │  │  S3 서명 URL 발급 (서버 라우트)  │   │  executor=none (API 키 넣으면 =api 로 전환)│ │
                    │  └──────────────┬───────────────┘   └───────────────────┬──────────────────┘ │
                    └─────────────────┼───────────────────────────────────────┼────────────────────┘
                                      │ Supabase 클라이언트 (사용자 세션, RLS)   │ secret key + executed_by
                                      ▼                                       ▼
                    ┌──────────────── Supabase (서울) ──────────────────┐   ┌──────── S3 (비공개) ────────┐
                    │ topics · domains · sources · backlog · runs        │   │ episodes/{id}/ 대본·발췌·     │
                    │ + jobs (작업 큐) · episodes (산출물 인덱스)          │   │   claims·리포트·audio/       │
                    │ Realtime: jobs/backlog 변경 → 화면 즉시 갱신          │   │ sweeps/{날짜}.json           │
                    └────────────────────────▲──────────────────────────┘   └──────────────▲──────────────┘
                                             │ 폴링(5s) + Realtime                          │ 업로드 (IAM 사용자, 버킷 한정)
                    ┌────────────────────────┴───────────────────────────────────────────────┴──────────────┐
                    │  worker[local]  — 팀원 Mac에서 `npm run worker` (.env: EXECUTOR=claude-cli) 로 실행                    │
                    │  AI 작업 전담: cluster · draft · qa · critic                                            │
                    │  각 작업 = `claude -p ... --output-format json --json-schema` 새 프로세스 (본인 구독, 과금 0)│
                    │  → 프로세스마다 새 컨텍스트 = QA 독립성(spec/05)이 구조적으로 보장                          │
                    └────────────────────────────────────────────────────────────────────────────────────────┘
```

- 워커 바이너리는 하나, 실행 위치와 플래그만 다르다: `--executor=none|claude-cli|api`, `--capabilities=ai,io`.
  서버 워커는 `io`만, 로컬 워커는 `ai`(+`io`)를 집는다.
- 로컬 워커가 꺼져 있으면 AI 작업은 `queued`에 머문다 — 화면에 "대기 중(AI 워커 없음)"으로 표시. 테스트 단계의 의도된 제약.
- API 키 실행기(`--executor=api`, Anthropic SDK)는 코드만 준비하고 기본 비활성. 전환은 미결 #12(비용 합의) 후.
- **구독 토큰을 서버에 두지 않는다** (2026-08-29 확인: 헤드리스 `claude -p`는 개인 기기·스크립트 용도로 문서화, 장기 실행 서버·Agent SDK는 API 키 요구).

## 3. 실행기 규약 — `claude -p` 헤드리스

각 AI 단계는 저장소의 프롬프트 자산(skills/)을 **워커가 조립한 프롬프트**로 실행한다 (지금 세션에서 서브에이전트에
넘기던 것과 동일한 조립 — 반입 파일 allowlist 포함). 호출 형태:

```
claude -p --output-format json --json-schema <단계별 결과 스키마> \
  --disable-slash-commands --no-session-persistence --permission-mode acceptEdits \
  --allowedTools "Read,WebFetch(domain:<소스 호스트>),Write(episodes/<id>/**),…" --add-dir <에피소드 디렉토리> \
  [--model <설정값>]            # 프롬프트는 stdin 으로 전달. 타임아웃은 워커가 프로세스 단위로 건다
```

| 단계 | 반입(allowlist) | 도구 | 결과 |
|---|---|---|---|
| cluster | sources 메타데이터(JSON) + spec/03 + 주제 축 규칙 | 없음(단일 호출) | 후보 배열(JSON) → `backlog` proposed 적재 |
| draft | guidelines + 골드 3 + spec/04 + 소스 URL 목록 | WebFetch(**소스 URL만**), Write(작업 디렉토리만) | sources.md · claims.md · script.md → S3 |
| qa | qa/prompt.md + spec/05 + 대본·claims·발췌 | Read | 판정 JSON + 리포트 md. 실패 시 피드백을 draft 재실행에 전달(최대 3회) |
| critic | rubric(-v2) + guidelines + 대본 + 골드 2 · **Opus 고정**(CRITIC_MODEL) | Read | 리포트 md (판정 열 빈 채) — v2: 판단 플래그 20 + 100점 12항목 + 근거 인용. L0 결과 미반입 |
| domain_check | 소스 풀 확인 ①~④ (robots·홈·약관·표본 기사) — **AI 없음**, `requires_ai=false` | HTTP만 | `domains.evidence` (상태·요약·인용·기계 제안). 판정은 사람 |

- `--bare` 는 쓰지 않는다 — bare 는 인증이 `ANTHROPIC_API_KEY` 전용이라 구독(OAuth)이 막힌다 (2026-08-29 실측). 대신 `--disable-slash-commands`·`--no-session-persistence`·allowedTools·add-dir 로 반입을 끊는다. 결과는 `structured_output` 필드(스키마 강제)만 신뢰한다.
- 반입 금지 규칙(생성 맥락·리포트·타 에피소드 금지)은 프롬프트 allowlist + `--add-dir`를 에피소드 디렉토리로 한정해 집행.
- 실행마다 `runs`에 `phase`·`attempt`·`prompt_version`·`model`·`executed_by`(워커 소유자)·`artifacts` 기록 (기존 규약 그대로).
- 사용량: 구독의 5시간 창을 대화형 사용과 공유한다 — 대본 1편 ≈ 20만 토큰급. 워커 실행자가 그 비용을 진다.

### 3.1 API 실행기 — 목표 (형태 미결)

`EXECUTOR=api`는 **API 키를 쓰는 실행기**다. 지금의 `claude-cli`(구독 OAuth, 키 없음)와 인증·과금이 다르며, 켜는 시점은 미결 #12(비용 합의)다. 켜도 바뀌는 것은 `executors/` 한 층뿐 — `ExecRequest`/`ExecResult` 인터페이스, `runs` 기록, 상태 연쇄, 프롬프트 자산(skills/)은 그대로다.

후보 두 가지 (둘 다 API 키 전제 — 구독으로는 어느 쪽도 못 돌린다):

| | A. Claude API + tool use | B. Claude Agent SDK |
|---|---|---|
| 루프 소유 | 워커 (얇은 호출부) | Claude Code 하네스(라이브러리) |
| 원문 읽기 | 서버 도구 `web_fetch` + `allowed_domains`=소스 호스트 — 불변 원칙 2를 API 파라미터로 집행 | 내장 WebFetch + allowedTools (현행과 동일) |
| 산출물 | 구조화 출력(strict 스키마) → 워커가 S3에 씀 | 내장 Write → 워커가 S3 업로드 (현행과 동일) |
| 기계 검사(L0) | 워커 코드 (spec/09 — 실측 완료분) | 모델의 Bash(python) 또는 워커 코드 |
| 현행 대비 이식 | "파일을 읽어라" → 내용 반입(고정 접두 = 프롬프트 캐싱), 파일 쓰기 → 출력 스키마 | 거의 1:1 |
| 로컬 파인튜닝 모델 전환 | 엔드포인트 교체 (spec/08 5장 1항의 "얇은 호출부") | 하네스가 Claude 전용 → 실행기 재작성 (두 번째 이식) |

- 판단 기준: 로컬 모델 전환이 확정이면 A(이식 1회), API 전환 공수 최소가 우선이면 B(이식 2회). **결정은 미결 #12와 함께** 내린다 — 지금 테스트(구독 실행)에는 영향이 없다.
- 비용 추정 원료는 이미 나온다 — `claude -p`가 매 실행 정가 환산 `total_cost_usd`를 돌려주고 실행기가 `ExecResult.listCostUsd`로 받는다. 이를 `runs`에 남겨 단계별로 집계하면 그대로 API 예산 추정치다.
- 실행 위치: EC2 상주 워커. draft 1편 ≈ 30분이라 Lambda(15분 상한)류 서버리스는 맞지 않는다 (spec/08 3장 표 정정).

## 4. 데이터 추가 (schema.sql 개정)

```sql
-- 작업 큐: UI는 여기에 넣기만, 워커는 여기서 집기만
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check')),
  requires_ai boolean not null,
  payload jsonb not null default '{}',           -- 예: {"mid_topic":"인문·교양"} / {"backlog_id":"C23"} / {"episode_id":"T260829-001"}
  status text not null default 'queued' check (status in ('queued','claimed','running','done','failed','cancelled')),
  requested_by uuid references auth.users(id),   -- 버튼 누른 사람
  claimed_by text, claimed_at timestamptz, heartbeat_at timestamptz,
  started_at timestamptz, finished_at timestamptz,
  attempt int not null default 1, parent_job_id uuid references jobs(id),   -- 자동 연쇄 추적
  result jsonb, error text,
  created_at timestamptz not null default now()
);
-- 집기: for update skip locked 로 동시 워커 안전. heartbeat 15분 끊기면 queued 로 회수 (claim_job 함수).

-- 에피소드 산출물 인덱스 (파일은 S3, 행에는 경로만 — spec/08 1장)
create table episodes (
  id text primary key,                            -- T260829-001 (spec/08 2장 규칙)
  backlog_id text not null references backlog(id),
  prompt_version text not null,
  script_key text, claims_key text, sources_key text,
  qa_report_key text, critic_report_key text,
  audio_master_key text, audio_dist_key text,
  critic_verdicts jsonb,                          -- 사람 판정 (플래그별 동의/부분/비동의+사유)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
```

- `backlog.status` 전이 규약(spec/03)은 유지 — 작업 완료 시 워커가 전환. `approved` 전환은 **UI에서 사람만**.
- RLS(0003): `authenticated` 팀 계정 — 전 테이블 select, 사람 몫만 write. 승격 규약은 **트리거 스탬프**로 강제: `approved_by/at`·`decided_by/at`·`jobs.requested_by`·`settings.updated_by` 를 세션(이메일)에서 찍고 클라이언트 값은 덮어쓴다 (spec/08 4장). 워커는 secret key/postgres 로 우회.
- 상태 연쇄 (워커가 수행): `sweep done → cluster 생성` · `approved → draft 생성` · `draft done → qa 생성` ·
  `qa 실패 → draft(attempt+1, 피드백 payload) 생성, 3회 초과 → review_required` · `qa 통과 → critic 생성` · **tts는 연쇄 없음**.

## 5. 화면

| 화면 | 내용 | 대응 |
|---|---|---|
| 로그인 | Supabase Auth (이메일 초대 3인) | spec/08 |
| 대시보드 | 진행 중 작업·최근 완료·**워커 상태**(heartbeat — 누구의 Mac이 AI 워커를 띄웠는지) | — |
| 주제 | `topics` 목록·편집 (중분류 추가, AI 생성 여부, 해설 페르소나) | PIPELINE 1장 |
| 소스 풀 | `domains` 목록(tier 필터) · 행 상세 = 판정 시트(note의 증거 표시 + tier 선택 + license_basis 기입) · 도메인 추가(candidate) | spec/01 4장 |
| 스윕 | 중분류 선택 → 스윕 요청 · 진행 상태 · 결과(적재 건수, 실패 피드) · 이어지는 군집화 결과 링크 | spec/02 |
| 백로그 | 후보 카드(제목·축·소스 묶음·타깃 정합·dedup 노트) → **승인/반려/보류** · 승인 즉시 draft 작업 생성 표시 | spec/03 게이트 1 |
| 에피소드 | 목록(상태 타임라인) · 상세: 대본 뷰어·**턴 인라인 편집**(수정 전/후 → `episodes.human_edits`, 콜드오픈 자구 깨짐 경고, 재QA 요청) / 발췌 / claims / QA 리포트(attempt별) / 비평 리포트(**판정 입력 UI**: 동의·부분·비동의+사유 → `episodes.critic_verdicts`) / runs 로그 · **TTS 변환 버튼**(qa_passed 이상, 확인 모달) · 오디오 플레이어(변환 후) | spec/04·05·09·06 |
| 설정 | TTS 보이스 ID·속도(윤아·이음), 합성 방식, 기본 모델, 실행기 표시, 프롬프트 버전(읽기) | spec/06 미결 #8 |

## 6. 저장소 구조 (팀 레포 `ear_project` — 파트 `pipeline/` + 문서 `docs/ai/`)

> 반입 2026-09-01: 독립 저장소 계획을 접고 팀 레포에 들어왔다. 코드는 파트 `pipeline/`, 명세·프롬프트 자산은 `docs/ai/` **단일 원본** — 워커가 여기서 읽는다(사본 없음).

```
pipeline/                          파트 (npm workspaces: apps/*, packages/*)
  apps/web                         Next.js (App Router, TS) — 화면 + S3 서명 URL 라우트
  apps/worker                      Node/TS CLI — jobs 폴링·집기·실행·연쇄. executors/{claude-cli,api,none}.ts · stages/{sweep,cluster,draft,qa,critic,domain-check}.ts (tts·package 는 M5)
  packages/pipeline                단계별 프롬프트 조립기·결과 스키마 (자산은 경로만 넘긴다 — 컨텍스트 예산)
  supabase/schema.sql · migrations/  0002 jobs·episodes·claim_job · 0003 팀 RLS·스탬프 트리거·settings · 0004~0008 (schema.sql 은 스냅샷)
  deploy/                          EC2 "AI 서버" compose(web + io 워커 + Caddy) — M6 에서 작성. 같은 인스턴스에 ai-server/(FastAPI) 동거 (2장 정렬)
docs/ai/                           ASSET_ROOT — spec/ skills/ templates/ references/ (워커가 --add-dir 로 연다)
ai-server/                         FastAPI 단발 추론 API (임베딩) — 별도 파트
```

- 경로는 둘이다: **`ASSET_ROOT`**(읽기 전용 자산, 기본 `docs/ai`) · **`WORK_ROOT`**(산출물 `episodes/`·`sources/sweeps/`, 레포 밖 — 기본 `pipeline/.work`, gitignore). 실행기 `claude -p` 의 cwd 는 WORK_ROOT 다 — cwd 가 레포 안이면 Claude Code 가 루트 `CLAUDE.md`·`.claude/` 를 자동 반입해 생성 컨텍스트를 오염시킨다(spec/09 컨텍스트 예산). 자산은 `--add-dir ASSET_ROOT` 로만 연다. 전환기에는 기존 로컬 산출물 폴더를 WORK_ROOT 로 지정하면 DB 의 `local:` 키가 그대로 해석된다.
- 레포에 넣지 않는 것: `episodes/`·`sources/sweeps/`(→ S3, M4) · `references/*.txt`(타사 전사본 — 재배포 금지; 분석 문서만 `docs/ai/references/`) · 초기 설계 `archive/`·시드 파일·`backlog/*.md` 로컬 기록(상태 원본은 DB) · `.env` 실값·음원.

## 7. 구축 순서 (마일스톤)

| # | 내용 | 외부 준비물 | 검증 |
|---|---|---|---|
| M1 ✅(연쇄 검증 중) | 스키마 개정(jobs·episodes·RLS) + 모노레포 골격 + 워커 `claude-cli` 실행기로 **draft→qa→critic 1편 로컬 완주** | 없음 (Supabase 기존 + 로컬) | 기존 사이클과 같은 산출물 규격이 나오는가 (spec/08 8장 "스킬 승계 검증") |
| M2 ✅(골격) | 웹 UI: 로그인·백로그·에피소드(리포트 열람·비평 판정)·소스 풀 판정·주제 | 팀원 이메일 3개 (Auth 초대) | 테이블 에디터 없이 게이트 1·판정이 되는가 |
| M3 | 스윕 요청 + 자동 군집화 연쇄 (RSS 수집은 워커 코드, 군집화는 AI) | 없음 | 요청 → 후보 카드까지 사람 개입 0 |
| M4 🔜 (버킷 준비됨 2026-09-01) | S3 버킷 + 산출물 업로드·열람 + 기존 로컬 산출물 이관 (미결 #11 해소). **파일은 전부 S3(버저닝), Supabase에는 키·판정·수정 로그만** — 워커: 단계 전 내려받기·후 올리기 / 웹: `s3:` 키 읽기 + 직접 수정 PutObject | S3 버킷·리전 · 앱용 IAM(접두사 한정 Get/Put/List; EC2는 인스턴스 역할) | 로컬 파일 없이 화면에서 대본·리포트가 열리고 수정이 되돌아가는가 |
| M5 | TTS(ElevenLabs) 수동 변환 + 플레이어 + 설정 화면 | ElevenLabs API 키 | 버튼 → 오디오 재생. 보이스 후보 청취(미결 #8·#9 실측 시작) |
| M6 | EC2 배포 (docker compose: web + 서버 워커) + HTTPS | EC2 1대(t3.small~medium, Ubuntu) · 도메인 1개(또는 IP+Caddy 내부 인증서) · 보안그룹 | 팀원이 외부에서 접속·승인 가능 |

M1~M3은 AWS 없이 진행 가능하다 (Supabase + 로컬). AWS 준비물은 M4·M6에서 필요.

## 8. 완료 조건

- Given 팀원이 백로그에서 승인한다 / When 로컬 AI 워커가 떠 있다 / Then 별도 조작 없이 draft→qa→critic이 순차 실행되고 화면에 진행이 보인다
- Given 로컬 AI 워커가 없다 / When 승인한다 / Then 작업은 queued로 남고 화면이 "AI 워커 대기"를 표시하며, 워커가 뜨는 즉시 집힌다
- Given qa_passed 에피소드 / When 아무 조작도 없다 / Then TTS는 시작되지 않는다 (수동 버튼만)
- Given QA 재실행 / When 실행 주체를 확인한다 / Then 이전 회차와 다른 프로세스(새 컨텍스트)다
- Given 서버 워커 / When 환경을 점검한다 / Then 구독 토큰이 없고, API 키가 없으면 AI 작업을 집지 않는다
- Given 모든 워커 쓰기 / When runs를 조회한다 / Then executed_by(워커 소유자)·model·prompt_version이 기록돼 있다
