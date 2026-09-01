-- 0005 — 작업 진행 상황 (2026-08-31): AI 단계가 30~60분 걸리는데 단계 전환만 보여 내부가 깜깜했다.
-- 실행기가 stream-json 이벤트를 읽어 여기에 최신 상태를 쓴다 (웹 UI 가 폴링해 표시).
alter table public.jobs add column if not exists progress jsonb;
comment on column public.jobs.progress is
  '{phase, detail, tool_counts, last_tool, last_text, turns, elapsed_ms, rate_limit:{five_hour,seven_day}, updated_at}';
