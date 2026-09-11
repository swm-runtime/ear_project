-- 0020 (2026-09-11): 비평 측정 작업 유형 — 루브릭 개정안을 회귀 세트에 돌려 사람 점수와 대조한다.
-- 별도 유형인 이유: 일반 critic 은 critic-report-v2.md 와 episodes.critic_report_key 를 덮어쓴다. 사람 판정(critic_verdicts)은 그 리포트의
-- 플래그 번호를 가리키므로 덮어쓰면 판정이 깨진다. 측정은 critic-measure-<버전>.md 로 따로 쓰고 에피소드 행을 건드리지 않는다.
-- 옛 워커가 이 유형을 집으면 "알 수 없는 작업 유형"으로 실패할 뿐 리포트를 덮어쓰지 않는다.
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure'));
