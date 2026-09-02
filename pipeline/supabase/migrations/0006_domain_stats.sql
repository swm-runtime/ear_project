-- 0006 — 소스 풀 목록에서 도메인별 적재 건수·최근 스윕을 한 번에 보기 위한 뷰 (판정 화면 인라인 확장, 2026-08-31)
create or replace view public.domain_stats as
select d.id as domain_id,
       count(s.id)              as source_count,
       max(s.swept_at)          as last_swept,
       max(s.published)         as last_published
  from public.domains d
  left join public.sources s on s.domain_id = d.id
 group by d.id;

grant select on public.domain_stats to authenticated;
