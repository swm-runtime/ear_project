-- ear 콘텐츠 파이프라인 스키마 v1 (04-ops-infra.md 기반)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run

-- ── 1. domains: 출처 사이트 풀 (02 문서) ─────────────────────────
create table if not exists domains (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null unique,            -- 예: techblog.woowahan.com
  publisher   text,                            -- 예: 우아한형제들 기술블로그
  tier        text not null default 'candidate'
              check (tier in ('allow_open','allow_support','blocked','hold','candidate')),
  category    text,                            -- 국내 기업 기술블로그 / 글로벌 / 오픈소스 / 학술
  feed_url    text,                            -- RSS/Atom 주소
  topic_coverage text[] default '{}',          -- 커버 중분류
  license_basis  text,                         -- 판정 근거 (라이선스·약관 확인 내용)
  decided_by  text,                            -- 판정자 (게이트: 사람만 기입)
  decided_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── 2. sources: 스윕으로 수집한 소스 링크+메타데이터 ─────────────
-- 원문 본문은 저장하지 않는다. 중복 대조("이 URL 쓴 적 있나")의 원천.
create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  domain_id   uuid references domains(id),
  url         text not null unique,
  title       text not null,
  summary     text,                            -- 발행처가 피드에 담아 배포한 요약
  author      text,
  published   date,
  swept_at    date not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sources_published on sources (published desc);

-- ── 3. backlog: 에피소드 주제 후보 (03 문서 3장) ─────────────────
create table if not exists backlog (
  id          text primary key,                -- 'C04' 형식 유지
  mid_topic   text not null,                   -- 중분류 (예: 데이터·AI)
  title       text not null,
  summary     text,
  target_fit  text,
  angle       text,                            -- 구성 각도(안)
  sources     jsonb not null default '[]',     -- [{url, publisher, published, title, tier, backbone}]
  status      text not null default 'proposed'
              check (status in ('proposed','approved','claimed','drafted',
                                'qa_passed','packaged','published',
                                'rejected','review_required','expired','held')),
  dedup_note  text,
  approved_by text,                            -- 게이트 1: 사람만 기입
  approved_at timestamptz,
  claimed_by  text,                            -- 동시 작업 충돌 방지
  claimed_at  timestamptz,
  published_content_ref text,                  -- 발행 후 제품 콘텐츠 식별 (수기)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 4. runs: 실행 기록 — 계측의 원천 (04 문서) ───────────────────
create table if not exists runs (
  id          uuid primary key default gen_random_uuid(),
  backlog_id  text references backlog(id),
  phase       text not null
              check (phase in ('sweep','cluster','draft','critic','qa','package','tts')),
              -- critic: 품질 사이클의 선행 비평 실행 (spec/09 7장) — QA(사실)와 별개의 스타일 검수
  attempt     int not null default 1,          -- QA 재생성 차수 (1~3)
  result      text,                            -- 통과/실패 + 사유 요약
  prompt_version text,                         -- 스킬(프롬프트) 버전
  artifacts   text[] default '{}',             -- 스토리지/S3 경로 (script.md, claims.md 등)
  model       text,                            -- 실행 모델 (로컬 전환 판단 데이터 — spec/08 5장)
  executed_by text not null,
  executed_at timestamptz not null default now()
);

-- ── 5. topics: 주제 체계 — 대분류/중분류의 단일 진실 원천 ────────
-- 주제 추가·변경은 이 테이블의 행 편집으로 한다 (PIPELINE.md 1장의 표는 이 테이블의 반영).
create table if not exists topics (
  id          uuid primary key default gen_random_uuid(),
  major       text not null,                   -- 대분류: 돈 / 배움 / 일
  mid         text not null unique,            -- 중분류 (backlog.mid_topic·domains.topic_coverage가 이 이름을 참조)
  ai_generation boolean not null default true, -- AI 생성 대상 여부 (배제 합의의 데이터화)
  explainer   text check (explainer in ('윤아','이음')),  -- 해설 담당 페르소나 (spec/04)
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── RLS: 켜두되 정책 없음 → publishable(anon) 키로는 접근 불가 ──
-- secret 키(에이전트)는 RLS를 우회하므로 영향 없음.
-- 웹 UI를 붙일 때 팀원 계정용 정책을 추가한다.
alter table topics  enable row level security;
alter table domains enable row level security;
alter table sources enable row level security;
alter table backlog enable row level security;
alter table runs    enable row level security;


-- ===== 0002 (2026-08-29): jobs · episodes · claim_job — 원문은 supabase/migrations/0002_jobs_episodes.sql =====
-- 0002 — 작업 큐(jobs) · 에피소드 산출물 인덱스(episodes) · 집기 함수 (spec/10 4장)
-- 적용: 2026-08-29. schema.sql(원본 스냅샷)에도 동일 내용 반영.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('sweep','cluster','draft','qa','critic','tts','package')),
  requires_ai boolean not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','claimed','running','done','failed','cancelled')),
  requested_by uuid,                      -- auth.users(id) — 웹 UI 도입(M2) 시 FK 추가
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempt int not null default 1,
  parent_job_id uuid references public.jobs(id),
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists jobs_queue_idx on public.jobs (status, requires_ai, created_at);
create index if not exists jobs_payload_backlog_idx on public.jobs ((payload->>'backlog_id'));
alter table public.jobs enable row level security;

create table if not exists public.episodes (
  id text primary key,                    -- T260829-001 (spec/08 2장)
  backlog_id text not null references public.backlog(id),
  prompt_version text not null,
  script_key text,
  claims_key text,
  sources_key text,
  qa_report_key text,
  critic_report_key text,
  audio_master_key text,
  audio_dist_key text,
  critic_verdicts jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.episodes enable row level security;

-- 집기: 워커 1건 원자적 집기 + 끊긴 작업(heartbeat 15분 무응답) 회수
create or replace function public.claim_job(p_worker text, p_can_ai boolean)
returns setof public.jobs
language plpgsql
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'queued', claimed_by = null, claimed_at = null, heartbeat_at = null,
         error = coalesce(error, '') || ' | heartbeat 끊김으로 회수 ' || now()::text
   where status in ('claimed','running')
     and heartbeat_at < now() - interval '15 minutes';

  select * into j
    from public.jobs
   where status = 'queued'
     and (p_can_ai or requires_ai = false)
   order by created_at
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.jobs
     set status = 'claimed', claimed_by = p_worker, claimed_at = now(), heartbeat_at = now()
   where id = j.id
  returning * into j;

  return next j;
end;
$$;

-- 기존 로컬 에피소드 7편 인덱스 백필 (S3 이관 전 — local: 경로)


-- ===== 0003 (2026-08-29): 팀 RLS 정책 · 신원 스탬프 트리거 · settings — 원문은 supabase/migrations/0003_rls_team.sql =====


-- ===== 0004 (2026-08-31): episodes.human_edits (사람 대본 수정 로그) =====
alter table public.episodes add column if not exists human_edits jsonb not null default '[]'::jsonb;

-- ===== 0005 (2026-08-31): jobs.progress (실시간 진행 상황) =====
alter table public.jobs add column if not exists progress jsonb;

-- ===== 0006 (2026-08-31): domain_stats 뷰 =====
-- 0006 — 소스 풀 목록에서 도메인별 적재 건수·최근 스윕을 한 번에 보기 위한 뷰 (판정 화면 인라인 확장, 2026-08-31)
create or replace view public.domain_stats as
select d.id as domain_id,
       count(s.id)              as source_count,
       max(s.swept_at)          as last_swept,
       max(s.published)         as last_published
  from public.domains d
  left join public.sources s on s.domain_id = d.id
 group by d.id;

grant select on public.domain_stats to authenticated;
