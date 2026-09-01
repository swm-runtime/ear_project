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
                    ┌──────────────────────── AWS EC2 "AI 서버" 1대 · compose ────────────────────────┐
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

- **호스트 (2026-09-01 판단)**: 제품 서버(`ear-prod`)와 같은 ISB 계정·같은 기본 VPC·같은 퍼블릭 서브넷에 **EC2 1대**를 추가한다. 컨테이너 4개 — `caddy`(TLS, 도메인은 `pipeline.<도메인>` 하나) · `ai-server`(FastAPI :8000 — 제품 서버가 VPC 사설 IP로 호출) · `pipeline-web` · `pipeline-worker-io`. 새 SG(22 팀 IP · 80/443 · 8000은 source = 제품 SG) · 새 인스턴스 역할 `ear-ai-ec2`(파이프라인 버킷 정책만 — 제품 롤 재사용 금지). **NAT·ALB·Fargate·RDS는 두지 않는다**(spec/08 7장 — 퍼블릭 서브넷이라 NAT 불필요, 1대라 ALB 불필요, compose가 기존 운영 패턴, DB는 Supabase). **기존 리소스는 무변경**(새 SG가 기존 SG ID를 참조만). 크기 t4g.small(프리티어는 기존 인스턴스가 소진 → 월 약 2.8만) — 서버 `next build`가 OOM이면 스왑 → 로컬 arm64 빌드(`docker save|load`) → t4g.medium 순. ai-server를 노트북(메타 부여 스킬)에서 부를 땐 SSH 터널 — 공개 도메인을 만들지 않는다.
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

### 3.1 API 실행기 — 목표 (형태 확정 2026-09-01: A안)

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

- **A로 확정** (2026-09-01): 파인튜닝 로컬 모델 전환이 확정이므로 이식 1회인 A. B는 기록용. 남는 것은 켜는 **시점** = 미결 #12(G1) — 지금 테스트(구독 실행)에는 영향이 없다. 단계별 설계·게이트는 spec/08 3.1.
- **모델에게 도구를 주지 않는다** — 원문 fetch·본문 추출·파일 쓰기·L0 검사는 워커 코드. `packages/pipeline`은 `PromptBundle {system 블록(캐싱 단위), user, 출력 스키마}`를 내고 실행기가 렌더링한다(claude-cli = 파일 경로+텍스트 · api = messages · local = 같은 messages + guided JSON).
- 비용 추정 원료는 이미 나온다 — `claude -p`가 매 실행 정가 환산 `total_cost_usd`를 돌려주고 실행기가 `ExecResult.listCostUsd`로 받는다. 이를 `runs`에 남겨 단계별로 집계하면 그대로 API 예산 추정치다.
- 실행 위치: EC2 상주 워커. draft 1편 ≈ 30분이라 Lambda(15분 상한)류 서버리스는 맞지 않는다 (spec/08 3장 표 정정).

### 3.2 규칙 자산 로더 — 워커가 읽는 규칙은 DB가 진실 (2026-09-01 확정)

문제: 워커가 읽는 규칙 파일이 각자의 git 체크아웃이라, A가 피드백을 반영해도 B의 워커는 pull 전까지 옛 규칙으로 대본을 쓴다. 같은 큐의 작업이 누가 집느냐에 따라 다른 규칙으로 실행되고, `PROMPT_VERSION` env 라벨과 실제 규칙이 어긋날 수 있다.

**하이브리드로 나눈다**:

| 층 | 어디에 | 대상 |
|---|---|---|
| 자주 바뀌는 규칙·참조 | **DB `prompt_assets`**(4장 0009) — 웹 `/assets`에서 편집·새 버전·활성화 | `skills/draft/guidelines.md` · 골드 3종 · `skills/qa/prompt.md` · `skills/critic/rubric.md`·`rubric-v2.md` (7개) |
| 명세 본문 | git `docs/ai/`(체크아웃) | spec/03·04·05 — 사실상 고정. 바뀌면 의식적 릴리스(pull 규율). spec 안에서 자주 바뀌는 표·참조가 생기면 자산으로 승격(spec/09 4.1) |

**로더 동작** (AI 작업 시작 시):

1. **번들 결정** — 작업의 `episode_id`에 `episodes.asset_versions`가 있으면 그 버전들, 없으면(새 에피소드 draft attempt 1 · cluster) 현재 active 묶음을 읽고 에피소드에 박는다 → 한 에피소드의 draft→qa→critic→재QA는 **같은 규칙**, 개정은 다음 에피소드부터.
2. **파일화** — DB 자산 7개와 **git 체크아웃의 spec/03·04·05 를 함께** `WORK_ROOT/assets/<번들 해시>/` 에 같은 경로 레이아웃으로 내려놓고(같은 해시면 재사용) 그 디렉토리를 그 실행의 `assetRoot`(`--add-dir`)로 쓴다. spec 을 스냅샷에 넣는 이유: `assetPaths` 가 spec 경로도 같은 루트에서 만들고, 자산 안의 상대 링크(`qa/prompt.md` → `../../spec/05-qa.md`)가 살아 있어야 한다. 번들 해시에는 spec 본문 해시가 포함되므로 git 의 spec 이 바뀌면 스냅샷도 새로 만들어진다.
3. **기록** — `runs.prompt_version`은 env가 아니라 번들에서 유도(`full-v5.1+qa-v1.2+critic-v1.3`), 체크아웃 커밋 SHA(+dirty)도 `runs.worker_rev`에.

- DB에 자산이 없으면 **기동 실패**(폴백 없음). 순서: `assets:import`로 시딩 → 워커 배포.
- git 사본: `assets:export`가 active를 `docs/ai/skills/`로 덤프(PR에서 규칙 diff가 보이게, CHANGELOG는 note에서 생성). 방향은 웹 → DB → git 한쪽. active 행은 수정 불가 — 고치려면 새 버전을 만들어 활성화한다(`runs`에 남은 버전 = 그때 실제 내용).
- 프롬프트 빌더 안의 문자열 규칙(`COMMON_RULES`·`GOLD_USAGE` 등)은 2차에서 자산(`prompts/draft.md`)으로 뺀다.

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

**0009 — 규칙 동기화·계측 (예정)**

```sql
create table prompt_assets (
  key          text not null,          -- 'skills/draft/guidelines.md' — assetPaths 가 쓰는 경로 그대로
  version      text not null,          -- 'full-v5.1' · 'qa-v1.2' · 'critic-v1.3' · 'gold@2026-08-28'
  content      text not null,
  status       text not null default 'draft' check (status in ('draft','active','retired')),
  note         text,                   -- 왜 바꿨나 = CHANGELOG 한 줄 (spec/09 4.3) — 활성화 시 필수
  created_by   text, created_at timestamptz not null default now(), activated_at timestamptz, activated_by text,
  primary key (key, version)
);
create unique index prompt_assets_active_idx on prompt_assets (key) where status = 'active';
alter table episodes add column asset_versions jsonb;   -- { key: version } — 그 에피소드의 규칙 묶음 고정 (3.2)
alter table runs add column cost_usd numeric, add column tokens jsonb, add column worker_rev text;   -- spec/08 3.1 G1 비용 원료 · spec 체크아웃 SHA
```

- RLS: 팀 계정 select 전부 · insert(draft)·update(활성화)는 사람만, `created_by`는 0003 방식 트리거 스탬프. 워커는 secret key로 읽기만.
- 규약은 트리거 `guard_prompt_asset`가 강제한다: active 본문 불변(고치려면 새 버전) · retired 부활 금지 · 활성화 시 note 필수 · 활성화하면 같은 key 의 기존 active 자동 retired. 원문 `pipeline/supabase/migrations/0009_prompt_assets.sql`.

## 5. 화면

| 화면 | 내용 | 대응 |
|---|---|---|
| 로그인 | Supabase Auth — 이메일+비밀번호 또는 매직링크. **초대 전용**(Authentication → Users → Invite, `Enable email signups` OFF — 0003 RLS는 `authenticated`면 팀원으로 취급하므로 가입이 열려 있으면 안 된다). 서버 배포 시 Auth URL Configuration의 Site URL·Redirect URLs에 `https://pipeline.<도메인>/**` 등록(매직링크 복귀 주소) | spec/08 |
| 대시보드 | 진행 중 작업·최근 완료·**워커 상태**(heartbeat — 누구의 Mac이 AI 워커를 띄웠는지) | — |
| 주제 | `topics` 목록·편집 (중분류 추가, AI 생성 여부, 해설 페르소나) | PIPELINE 1장 |
| 소스 풀 | `domains` 목록(tier 필터) · 행 상세 = 판정 시트(note의 증거 표시 + tier 선택 + license_basis 기입) · 도메인 추가(candidate) | spec/01 4장 |
| 스윕 | 중분류 선택 → 스윕 요청 · 진행 상태 · 결과(적재 건수, 실패 피드) · 이어지는 군집화 결과 링크 | spec/02 |
| 백로그 | 후보 카드(제목·축·소스 묶음·타깃 정합·dedup 노트) → **승인/반려/보류** · 승인 즉시 draft 작업 생성 표시 | spec/03 게이트 1 |
| 에피소드 | 목록(상태 타임라인) · 상세: 대본 뷰어·**턴 인라인 편집**(수정 전/후 → `episodes.human_edits`, 콜드오픈 자구 깨짐 경고, 재QA 요청) / 발췌 / claims / QA 리포트(attempt별) / 비평 리포트(**판정 입력 UI**: 동의·부분·비동의+사유 → `episodes.critic_verdicts`) / runs 로그 · **TTS 변환 버튼**(qa_passed 이상, 확인 모달) · 오디오 플레이어(변환 후) | spec/04·05·09·06 |
| 설정 | TTS 보이스 ID·속도(윤아·이음), 합성 방식, 기본 모델, 실행기 표시, 프롬프트 버전(읽기) | spec/06 미결 #8 |
| 규칙 자산 `/assets` | `prompt_assets` 목록(키·active 버전·활성화자·대기 draft) · 상세: 본문 · 편집 → 새 버전(draft) 저장 · active와 diff · **활성화**(note 필수) · 이력. 비평 판정 화면의 플래그에서 "규칙으로 승격" 링크 → guidelines 편집기 · 활성화 시 spec/09 4.3 연동 체크 상기 | 3.2 · spec/09 4장 |

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
| M-R (규칙 동기화) 🛠 구현 PR (2026-09-01) | `prompt_assets`(0009) + 워커 로더(3.2) + `/assets` 화면 + `assets:import/export` + `pickupApproved` 선점 수정(워커 다중 실행 시 draft 중복 방지) | 없음 | 두 워커가 같은 active 번들을 읽고 `runs.prompt_version`이 번들에서 유도되는가 |
| M4 🔜 (버킷 스크립트 준비 2026-09-01) | 파이프라인 S3(`pipeline/deploy/aws/setup-pipeline-bucket.sh`) + 산출물 업로드·열람 + 기존 로컬 9편 이관(미결 #11). **파일은 전부 S3(버저닝), Supabase에는 키·판정·수정 로그만** — 워커: 단계 전 내려받기·후 올리기 / 웹: `s3:` 키 읽기 + 직접 수정 PutObject + **로컬 워커용 서명 URL 라우트**(노트북에 AWS 키를 두지 않는다) · `datasets/` 접두사 | 버킷 1(스크립트) · EC2 전에는 임대 보유자 SSO 프로필로 개발 | 로컬 파일 없이 화면에서 대본·리포트가 열리고 수정이 되돌아가는가 · 노트북 워커가 키 없이 업로드하는가 |
| M6 (M4 다음) | **AI 서버 EC2** — 2장 "호스트": 기존 기본 VPC 퍼블릭 서브넷에 t4g.small 1대 + compose(caddy·ai-server·web·worker-io) + 인스턴스 역할 `ear-ai-ec2` + 새 SG · `pipeline.<도메인>` A 레코드(가비아) · Supabase Auth URL 설정. NAT·ALB·Fargate 없음. 산출물: `pipeline/deploy/aws/setup-ai-server.sh` · `docker-compose.prod.yml` · `caddy/Caddyfile` · README(runbook 형식) · `docs/infra/inventory.md` 등재 | EC2 1대 · 도메인 1개 | 팀원이 외부에서 접속·승인 가능 · 제품 서버가 사설 IP로 `/embeddings` 호출 · 기존 리소스 무변경 |
| M5 (M6 다음 — 키 확보 시) | TTS(ElevenLabs) 수동 변환(spec/06 변환·후처리·`audio_*_key`) + package(spec/07 `upload-meta.json`) + 플레이어 + 설정 화면 — **EC2 IO 워커가 실행** | ElevenLabs API 키 | 버튼 → S3 `audio/` → 재생. 보이스 후보 청취(미결 #8·#9 실측 시작) |

M1~M3·M-R은 AWS 없이 진행 가능하다(Supabase + 로컬). AWS는 M4·M6에서. 순서는 **M-R → M4 → M6 → M5**: "대본 → TTS → 최종 → S3" 체계까지가 AI 서버 구축의 범위이며, 대본 텍스트 생성만 API 실행기 전환(spec/08 3.1 G1)까지 노트북 워커에 남는다.

## 8. 완료 조건

- Given 팀원이 백로그에서 승인한다 / When 로컬 AI 워커가 떠 있다 / Then 별도 조작 없이 draft→qa→critic이 순차 실행되고 화면에 진행이 보인다
- Given 로컬 AI 워커가 없다 / When 승인한다 / Then 작업은 queued로 남고 화면이 "AI 워커 대기"를 표시하며, 워커가 뜨는 즉시 집힌다
- Given qa_passed 에피소드 / When 아무 조작도 없다 / Then TTS는 시작되지 않는다 (수동 버튼만)
- Given QA 재실행 / When 실행 주체를 확인한다 / Then 이전 회차와 다른 프로세스(새 컨텍스트)다
- Given 서버 워커 / When 환경을 점검한다 / Then 구독 토큰이 없고, API 키가 없으면 AI 작업을 집지 않는다
- Given 모든 워커 쓰기 / When runs를 조회한다 / Then executed_by(워커 소유자)·model·prompt_version이 기록돼 있다
- Given 규칙 자산이 웹에서 활성화된다 / When 어느 워커가 다음 새 에피소드를 집는다 / Then 그 번들을 읽고 `episodes.asset_versions`·`runs.prompt_version`에 기록된다 — 진행 중이던 에피소드는 기존 번들을 유지한다
- Given AI 서버 EC2 / When 제품 서버(NestJS)가 `/embeddings`를 호출한다 / Then VPC 사설 IP로 응답하고, 인터넷에 열린 것은 `pipeline.<도메인>`의 로그인 화면뿐이다
