-- 0034 (2026-10-26 KAN-247): 간행물 — 시리즈의 발행 이름(서버 series.publisher_name, 앱 시리즈 화면 제목 아래 줄 · "○○의 다른 시리즈" 묶음)과 썸네일 스타일을 한 번에 정한다(PM 2026-10-22).
--   publication : 간행물 키 — 코드 상수 @ear/pipeline publication.ts (keyword · chronicle · phrasebook). null = 없음(발행 이름 없음 · 일반 장면 썸네일)
-- 종전 판정 "큰 단어(thumb_word)를 채운 시리즈 = 키워드 시리즈 디자인"(0031)을 간행물 기준으로 옮긴다 — 이미 채운 시리즈는 keyword 로 채워 동작을 유지한다
-- 되돌리기: alter table public.series drop column if exists publication;
alter table public.series add column if not exists publication text;
update public.series set publication = 'keyword' where publication is null and nullif(trim(coalesce(thumb_word, '')), '') is not null;
