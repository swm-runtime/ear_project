-- 0027 (2026-10-01): 축 유형 "사건" 추가 — 역사 중분류 전용 (박수헌: 역사 편은 역사적 사실과 그 해석이 내용이다. 사건은 개념의 사례가 아니라 축이다)
-- 되돌리기: alter table public.backlog drop constraint backlog_axis_type_check; alter table public.backlog add constraint backlog_axis_type_check check (axis_type in ('대립','역설','재정의'));
alter table public.backlog drop constraint if exists backlog_axis_type_check;
alter table public.backlog add constraint backlog_axis_type_check check (axis_type in ('대립','역설','재정의','사건'));
