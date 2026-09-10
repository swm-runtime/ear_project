-- 0017 (2026-09-10): 소스 본문 접근 결과 기록 — 설계 단계가 본문을 가져올 때·군집화 v2 의 robots 사전 검사가 적는다.
-- 군집화는 robots·blocked 소스를 풀에서 제외한다 (v2 후보 11건 중 5건이 본문 3건 미만이던 사고 — 접근 불가 소스가 후보에 계속 섞였다).
alter table public.sources add column if not exists fetch_status text
  check (fetch_status in ('ok','robots','blocked','empty','network'));
alter table public.sources add column if not exists fetch_checked_at timestamptz;
create index if not exists idx_sources_fetch_status on public.sources (fetch_status);

-- domain_stats 에 접근 불가 건수 — 소스 풀 화면에 "본문 불가 N건" 표시 (계층 변경은 사람이 한다)
create or replace view public.domain_stats as
select d.id as domain_id,
       count(s.id)                                                     as source_count,
       max(s.swept_at)                                                 as last_swept,
       max(s.published)                                                as last_published,
       count(s.id) filter (where s.fetch_status in ('robots','blocked')) as blocked_count,
       count(s.id) filter (where s.fetch_status = 'ok')                as ok_count
  from public.domains d
  left join public.sources s on s.domain_id = d.id
 group by d.id;
grant select on public.domain_stats to authenticated;

-- 도메인 단위 자동 제외 (사이트 정책으로 본문이 안 열리는 곳): ok 0건·차단 3건 이상이면 코드가 찍고, 하나라도 열리면 지운다.
-- 계층(tier)은 건드리지 않는다 — 계층 판정은 사람만 (spec/01 4장). 군집화 풀에서만 도메인째 뺀다
alter table public.domains add column if not exists fetch_blocked_at timestamptz;

