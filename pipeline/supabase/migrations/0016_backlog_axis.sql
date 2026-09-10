-- 0016 (2026-09-09): 군집화 v2 — "축이 이끄는 파이프라인" ①. 후보에 축·축 유형·빈 역할을 기록한다 (spec/03 2장 v2).
-- 소스 역할(근거 앵커·사례·반론·한계·수치·조사·역사·맥락)은 backlog.sources[].role 에 둔다(jsonb — 컬럼 추가 없음).
-- 판정: 다양성 기준을 다 만족하면 proposed, 축은 좋은데 역할이 비면 held + gaps (탐색 보강 ②의 입력).

alter table public.backlog add column if not exists axis text;                          -- 축 한 문장
alter table public.backlog add column if not exists axis_type text check (axis_type in ('대립','역설','재정의'));
alter table public.backlog add column if not exists gaps text[] not null default '{}';   -- 비어 있는 역할
alter table public.backlog add column if not exists cluster_version text;               -- 어느 군집화가 만들었나 (v1 / v2)

comment on column public.backlog.axis is '군집화 v2: 대립("A인데 B") · 역설("A하려다 B가 된다") · 재정의("A는 사실 B다") 중 하나. v1 후보는 null';
comment on column public.backlog.gaps is '비어 있는 소스 역할 — 근거 앵커·사례·반론·한계·수치·조사·역사·맥락 중';
