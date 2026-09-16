-- 0021 (2026-09-11, KAN-53): 추천 메타 부여 작업 — 발행된 콘텐츠의 대본으로 enrichment.json(schema_version 2)을 다시 뽑는다.
-- 산출물은 datasets/enrichment/<content_id>.json 에 두고, 제품 반영은 콘솔이 브라우저 세션으로 PATCH(enrichment_file 단독)한다.
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure','enrich'));
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail','enrich'));
