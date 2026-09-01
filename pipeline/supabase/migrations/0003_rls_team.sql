-- 0003 — 팀 계정(Supabase Auth) RLS 정책 + 사람 몫 기록의 DB 강제 (spec/08 4장 · spec/10 4장). 적용: 2026-08-29
-- 원칙: 사람은 각자 계정으로 로그인해 읽고, 사람 몫 컬럼만 쓴다. 승인자·판정자·요청자는 클라이언트 값이 아니라 세션에서 찍는다.
-- 워커·마이그레이션은 postgres/secret key 로 RLS 를 우회한다.

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

alter table public.jobs drop constraint if exists jobs_requested_by_fkey;
alter table public.jobs add constraint jobs_requested_by_fkey foreign key (requested_by) references auth.users(id);

-- 로그인 사용자 식별자 (runs.executed_by / approved_by 와 같은 텍스트 규약: 이메일)
create or replace function public.current_actor() returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text)
$$;

-- ── 읽기: 팀 계정 전부 ─────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['topics','domains','sources','backlog','runs','jobs','episodes','settings'] loop
    execute format('drop policy if exists team_select on public.%I', t);
    execute format('create policy team_select on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ── 쓰기: 사람 몫만 ────────────────────────────────────────────────
-- topics: 주제 체계는 사람이 관리
drop policy if exists team_write on public.topics;
create policy team_write on public.topics for all to authenticated using (true) with check (true);

-- domains: 편입 후보 추가(candidate) + 판정. decided_by/at 는 트리거가 찍는다
drop policy if exists team_insert on public.domains;
create policy team_insert on public.domains for insert to authenticated with check (tier = 'candidate');
drop policy if exists team_update on public.domains;
create policy team_update on public.domains for update to authenticated using (true) with check (true);

-- backlog: 게이트 1 전환만 (proposed → approved/rejected/held, held → approved/rejected, review_required → qa_passed/rejected)
drop policy if exists team_update on public.backlog;
create policy team_update on public.backlog for update to authenticated using (true)
  with check (status in ('proposed','approved','rejected','held','qa_passed','packaged','published'));

-- jobs: 요청만 (사람 트리거: sweep·tts·package·cluster 재실행). requested_by 는 트리거가 찍는다
drop policy if exists team_insert on public.jobs;
create policy team_insert on public.jobs for insert to authenticated with check (status = 'queued');
drop policy if exists team_cancel on public.jobs;
create policy team_cancel on public.jobs for update to authenticated using (status = 'queued') with check (status in ('queued','cancelled'));

-- episodes: 비평 판정(사람) 기입만
drop policy if exists team_update on public.episodes;
create policy team_update on public.episodes for update to authenticated using (true) with check (true);

-- settings: 팀이 관리 (TTS 보이스 등)
drop policy if exists team_write on public.settings;
create policy team_write on public.settings for all to authenticated using (true) with check (true);

-- ── 신원 스탬프 트리거 (클라이언트가 보낸 값은 덮어쓴다) ───────────────
create or replace function public.stamp_backlog_gate() returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is null then return new; end if;          -- 워커/관리자 경로는 그대로
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      new.approved_by := public.current_actor(); new.approved_at := now();
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_backlog_gate on public.backlog;
create trigger trg_stamp_backlog_gate before update on public.backlog for each row execute function public.stamp_backlog_gate();

create or replace function public.stamp_domain_decision() returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is null then return new; end if;
  if new.tier is distinct from old.tier or new.license_basis is distinct from old.license_basis then
    new.decided_by := public.current_actor(); new.decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_domain_decision on public.domains;
create trigger trg_stamp_domain_decision before update on public.domains for each row execute function public.stamp_domain_decision();

create or replace function public.stamp_job_requester() returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then new.requested_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_stamp_job_requester on public.jobs;
create trigger trg_stamp_job_requester before insert on public.jobs for each row execute function public.stamp_job_requester();

create or replace function public.stamp_settings() returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then new.updated_by := public.current_actor(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_stamp_settings on public.settings;
create trigger trg_stamp_settings before insert or update on public.settings for each row execute function public.stamp_settings();

-- 기본 설정값
insert into public.settings (key, value) values
('tts', '{"engine":"elevenlabs","model":"eleven_v3","voices":{"윤아":"","이음":""},"speed":{"윤아":1.0,"이음":1.0},"mode":"per-turn"}'),
('worker', '{"default_model":"","prompt_version":"full-v5"}')
on conflict (key) do nothing;
