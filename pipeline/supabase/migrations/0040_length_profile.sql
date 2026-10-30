-- 0040 (2026-10-29, KAN-296 단기 실험 ④): 길이 프로필 + 재제작 원본. standard = 지금 규격(기본값), short = 5~12분 짧은 판.
-- 재제작 후보(remake_of)는 발행된 편의 주제·소스를 물려받아 짧은 판을 만든다 — 새 앱 배포 뒤 가입한 사용자에게만 나간다(BE 코호트 분리).
alter table public.backlog add column if not exists length_profile text not null default 'standard' check (length_profile in ('standard', 'short'));
alter table public.backlog add column if not exists remake_of text references public.backlog(id);
create index if not exists backlog_remake_of_idx on public.backlog (remake_of) where remake_of is not null;

-- 작업 유형 remake: 콘솔 실험 탭 [짧게 다시 만들기] → 워커가 재제작 후보(approved·short·remake_of)를 만들고 초안을 건다 (콘솔 역할은 backlog INSERT 권한이 없다)
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure','enrich','script_align','series_plan','judge_loop','remake'));
