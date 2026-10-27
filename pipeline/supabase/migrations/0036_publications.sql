-- 0036 (2026-10-27): 간행물을 콘솔에서 만든다 — 기본 셋(키워드·연대기·Phrasebook)은 코드 상수(@ear/pipeline publication.ts)에 두고,
-- 그 뒤의 간행물은 이 표에 넣는다(시리즈 화면 "새 간행물": 이름 + 워커에 있는 디자인 셋 중 하나). 워커·콘솔은 상수 + 이 표를 합쳐 읽는다(mergePublications).
-- series.publication 은 그대로 키를 저장한다(상수 키 또는 이 표의 key). 되돌리기: drop table if exists public.publications;
create table if not exists public.publications (
  key        text primary key,                                   -- 저장 키 — 바꾸지 않는다 (콘솔 자동 생성 p-<시각36진수>)
  locale     text not null check (locale in ('ko', 'en')),       -- 이 판에서만 고른다
  name       text not null,                                      -- 서버 publisher_name 으로 나가는 글자 — 앱에 그대로
  style      text not null check (style in ('keyword', 'phrasebook', 'scene')), -- 썸네일 디자인(워커에 있는 것만)
  hint       text,                                               -- 콘솔 선택지 설명
  created_at timestamptz not null default now(),
  unique (locale, name)
);
alter table public.publications enable row level security;
drop policy if exists publications_all on public.publications;
create policy publications_all on public.publications for all to authenticated using (true) with check (true);
