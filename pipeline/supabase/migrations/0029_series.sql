-- 0029 (2026-10-17 KAN-136): 기획 시리즈 — series 테이블 · backlog 시리즈 칸 · series_plan 작업 유형 (spec/11 8장)
-- 한국판·글로벌 DB 모두 적용한다(글로벌판도 시리즈를 쓴다, 박수헌 2026-10-17). 일반 편은 backlog 두 칸이 NULL 이고 동작이 바뀌지 않는다.
--   series            : 시리즈 하나 — 설계안(plan)·승인(게이트 S)·시리즈 단위 발행·회수. 편의 진행 상태는 편(backlog)이 갖는다
--   backlog.series_id : 이 후보가 속한 시리즈. series_no 는 화 번호(1부터). 둘은 함께 있거나 함께 없다
--   series_plan       : 관리자가 준 주제·범위로 편 목록 초안을 만드는 워커 작업(단발, 도구 없음)
-- 되돌리기: alter table public.backlog drop column if exists series_no, drop column if exists series_id; drop table if exists public.series;
--           jobs_type_check · runs_phase_check 는 0022·0023 의 목록으로 되돌린다.

create table if not exists public.series (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,                       -- 시리즈 이름 (콘텐츠 제목 머리 "{name} N - {편 제목}")
  mid_topic           text not null,                       -- 중분류 (대표 주제)
  intro_line          text,                                -- 한 줄 소개 — 인트로 시리즈 줄의 재료, 제품 series.description
  scope_note          text,                                -- 관리자가 준 범위 설명·메모 (설계안 입력)
  plan                jsonb not null default '[]'::jsonb,  -- 편 목록 [{no, title, scope, carries, only_here, minutes}]
  total_episodes      int check (total_episodes is null or total_episodes >= 1), -- 승인 때 확정. 상한 없음(2026-10-17)
  status              text not null default 'planning'
                      check (status in ('planning','approved','published','withdrawn','cancelled')),
  approved_by         text,                                -- 게이트 S: 사람(이메일). 트리거가 찍는다
  approved_at         timestamptz,
  published_series_id uuid,                                -- 제품 series_id — POST /admin/series 가 준 값 (BE KAN-134)
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.backlog add column if not exists series_id uuid references public.series(id);
alter table public.backlog add column if not exists series_no int;
alter table public.backlog drop constraint if exists backlog_series_pair_check;
alter table public.backlog add constraint backlog_series_pair_check
  check ((series_id is null) = (series_no is null) and (series_no is null or series_no >= 1));
create unique index if not exists backlog_series_no_uq on public.backlog (series_id, series_no) where series_id is not null;

alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure','enrich','script_align','series_plan'));
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail','enrich','script_align','approve','series_plan'));

-- RLS: 팀 계정은 읽고, 설계안 편집·승인·중단(시리즈 화면)을 쓴다. 워커는 service role 이라 RLS 밖이다
alter table public.series enable row level security;
drop policy if exists team_select on public.series;
create policy team_select on public.series for select to authenticated using (true);
drop policy if exists team_insert on public.series;
create policy team_insert on public.series for insert to authenticated with check (status = 'planning');
drop policy if exists team_update on public.series;
create policy team_update on public.series for update to authenticated using (true) with check (true);

-- 게이트 S 기록: 사람이 approved 로 바꾸면 승인자·시각을 찍는다(backlog 게이트 1 과 같은 방식). updated_at 은 늘 갱신
create or replace function public.stamp_series_gate() returns trigger language plpgsql security definer as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and new.status is distinct from old.status and new.status = 'approved' then
    new.approved_by := public.current_actor(); new.approved_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_series_gate on public.series;
create trigger trg_stamp_series_gate before update on public.series for each row execute function public.stamp_series_gate();
