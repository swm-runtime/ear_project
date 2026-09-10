-- 0019 (2026-09-10): 보강 스윕(모드 B-①, spec/02 6장) — held 후보의 빈 역할을 웹 검색으로 채우고 그 후보만 재판정한다.
-- 검색으로 들어온 소스는 origin='search' 로 표시해 RSS 소스와 QA 통과율·비평 점수를 갈라 볼 수 있게 한다.
alter table public.sources add column if not exists origin text not null default 'feed'
  check (origin in ('feed','search'));
-- 후보당 보강은 1회 — 비용 예측을 위해 상한을 둔다. 시각과 요약이 남으면 화면이 [보강] 버튼을 숨기고 결과를 보여 준다
alter table public.backlog add column if not exists reinforced_at timestamptz;
alter table public.backlog add column if not exists reinforce_note text;
