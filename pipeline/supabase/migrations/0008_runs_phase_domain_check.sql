-- 0008 — runs.phase 에 domain_check 추가 (첫 domain_check 실행이 runs 기록 단계에서 제약 위반 — 2026-09-01)
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check'));
