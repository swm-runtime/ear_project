-- 0033 (2026-10-22 KAN-202): 글로벌 판정·재작성 루프 — jobs.type 에 judge_loop, runs.phase 에 judge 를 더한다 (글로벌 명세 6.10 · judge/README.md 6장).
--   judge_loop : 비평 뒤 워커가 서버 API(GPT)만으로 편집자 3회·한국어·사실 검토·재작성(최대 3회)을 돌려 최고판을 대본에 쓰고 critic_verdicts 를 저장한다.
-- 되돌리기: 아래 두 제약을 0029 의 목록으로 다시 만든다.

alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure','enrich','script_align','series_plan','judge_loop'));
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail','enrich','script_align','approve','series_plan','judge'));
