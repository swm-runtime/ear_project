-- 0014 (2026-09-08): 발행 기록 — 제품 콘텐츠 한 건의 발행·재발행·연결 이력을 파이프라인이 자기 쪽에 남긴다 (spec/07 5장).
-- backlog.published_* 는 "최신 상태" 한 줄뿐이라 언제·무엇이·몇 번 바뀌었는지 볼 수 없었고, 제품의 published_at 은 최초 발행 시각이라
-- 재발행해도 움직이지 않아 "가장 최근 발행 시각"을 어디서도 읽을 수 없었다(2026-09-08 C39·C02·C08 재발행 경위 조사).
-- 제품 audit_logs 가 진실이지만 관리자 API 로 열리지 않으므로, 콘솔을 거친 사건은 여기에 남기고 제품 버전과 어긋나면 화면이 그 간극을 표시한다.

create table if not exists public.publish_log (
  id          bigint generated always as identity primary key,
  content_id  text not null,                        -- 제품 content_id
  backlog_id  text references public.backlog(id),   -- 수동 업로드는 null
  episode_id  text,
  action      text not null check (action in ('publish','republish','link','withdraw','restore','backfill')),
  version     int,                                  -- 사건 후 제품 content_version
  parts       text[] not null default '{}',         -- 바뀐 파트: audio · thumbnail · title · description · source_name · topic_ids
  note        text,
  actor       text default public.current_actor(),  -- 세션 이메일 (0003 규약)
  at          timestamptz not null default now()
);
create index if not exists publish_log_content_idx on public.publish_log (content_id, at desc);
comment on table public.publish_log is '제품 콘텐츠 발행·재발행 이력 (파이프라인 콘솔을 거친 사건만 — 제품 audit_logs 와 별개)';

alter table public.publish_log enable row level security;
drop policy if exists team_select on public.publish_log;
create policy team_select on public.publish_log for select to authenticated using (true);
drop policy if exists team_insert on public.publish_log;
create policy team_insert on public.publish_log for insert to authenticated with check (true);
