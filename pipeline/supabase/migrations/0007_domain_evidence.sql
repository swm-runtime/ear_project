-- 0007 — 소스 풀 확인 항목 ①~④ 자동 수집 결과 (domain_check 작업, 2026-09-01)
-- 판정은 사람만 한다 (spec/01 4장). evidence 는 보조 증거이며 suggestion 은 참고용 — 절대 자동 적용하지 않는다.
alter table public.domains add column if not exists evidence jsonb;
comment on column public.domains.evidence is
  '확인 항목 자동 수집 결과 {checked_at, checked_by, http, pages, items:{license,publisher,terms,access:{status ok|warn|bad|unknown, summary, snippets[{url,text}]}}, suggestion, suggestion_reason}';

-- jobs.type 에 domain_check 추가 (IO 작업 — requires_ai=false, 서버 워커도 처리 가능)
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check'));
