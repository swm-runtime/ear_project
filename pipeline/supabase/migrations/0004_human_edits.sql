-- 0004 — 사람의 대본 직접 수정 (spec/09 판정 규약 개정, 2026-08-31 박수헌 제안)
-- 비평 리포트에 서술로 남기던 "사람 추가 지적"을 **대본 직접 수정**으로 대체한다.
-- 리포트 파일은 AI 스냅샷 그대로 보존하고, 사람 손은 ① 대본 수정 ② 플래그 판정 두 곳으로만 간다.
alter table public.episodes add column if not exists human_edits jsonb not null default '[]'::jsonb;
comment on column public.episodes.human_edits is
  '사람 수정 로그 [{turn,before,after,reason?,by,at}] — 수정 전/후 쌍이 골드·파인튜닝 원료이자 규칙 승격의 근거';
