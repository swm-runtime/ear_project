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
insert into public.episodes (id, backlog_id, prompt_version, script_key, claims_key, sources_key, qa_report_key, critic_report_key) values
('T260820-001','C04','short-v1','local:episodes/T260820-001/script.md','local:episodes/T260820-001/claims.md','local:episodes/T260820-001/sources.md',null,null),
('T260820-002','C05','full-v3.1','local:episodes/T260820-002/script-full-v3.1.md','local:episodes/T260820-002/claims-full-v3.1.md','local:episodes/T260820-002/sources.md','local:episodes/T260820-002/qa-report-v3.md','local:episodes/T260820-002/critic-report-v3.md'),
('T260828-001','C15','full-v5.1','local:episodes/T260828-001/script-full-v5.md','local:episodes/T260828-001/claims.md','local:episodes/T260828-001/sources.md','local:episodes/T260828-001/qa-report.md','local:episodes/T260828-001/critic-report.md'),
('T260828-002','C18','full-v5.1','local:episodes/T260828-002/script-full-v5.md','local:episodes/T260828-002/claims.md','local:episodes/T260828-002/sources.md','local:episodes/T260828-002/qa-report.md','local:episodes/T260828-002/critic-report.md'),
('T260829-001','C23','full-v5','local:episodes/T260829-001/script-full-v5.md','local:episodes/T260829-001/claims.md','local:episodes/T260829-001/sources.md','local:episodes/T260829-001/qa-report.md','local:episodes/T260829-001/critic-report.md'),
('T260829-002','C24','full-v5','local:episodes/T260829-002/script-full-v5.md','local:episodes/T260829-002/claims.md','local:episodes/T260829-002/sources.md','local:episodes/T260829-002/qa-report.md','local:episodes/T260829-002/critic-report.md'),
('T260829-003','C25','full-v5','local:episodes/T260829-003/script-full-v5.md','local:episodes/T260829-003/claims.md','local:episodes/T260829-003/sources.md','local:episodes/T260829-003/qa-report.md','local:episodes/T260829-003/critic-report.md'),
('T260829-004','C26','full-v5','local:episodes/T260829-004/script-full-v5.md','local:episodes/T260829-004/claims.md','local:episodes/T260829-004/sources.md','local:episodes/T260829-004/qa-report.md','local:episodes/T260829-004/critic-report.md')
on conflict (id) do nothing;
