-- 0042 (2026-11-01): 자라는 새싹(sprout) 시리즈 디자인 — 간행물 "습관"(코드 상수, 미래를 바꾸는 습관). publications.style 에 sprout 허용
alter table public.publications drop constraint if exists publications_style_check;
alter table public.publications add constraint publications_style_check check (style in ('keyword', 'phrasebook', 'scene', 'tv', 'notes', 'layers', 'wave', 'sprout'));
