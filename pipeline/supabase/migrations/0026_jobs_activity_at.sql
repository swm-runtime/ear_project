-- 0026 (2026-09-27): jobs.activity_at — 마지막 활동 시각(종료 > 시작 > 생성). 콘솔 작업 기록·대시보드 최근 작업의 정렬 기준.
-- 종전 created_at 정렬은 자동 승인으로 한꺼번에 생성된 초안 21건이 5시간 뒤 실행돼도 4쪽째에 묻혀 "초안 1회차가 안 보인다"로 보였다 (박수헌 2026-09-27).
alter table public.jobs add column if not exists activity_at timestamptz
  generated always as (coalesce(finished_at, started_at, created_at)) stored;
create index if not exists jobs_activity_idx on public.jobs (activity_at desc);
