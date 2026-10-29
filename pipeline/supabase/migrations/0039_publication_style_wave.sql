-- 0039 (2026-10-29): 파형 그래프(wave) 시리즈 디자인 — 간행물 "네트워크"(코드 상수). publications.style 에 wave 허용
alter table public.publications drop constraint if exists publications_style_check;
alter table public.publications add constraint publications_style_check check (style in ('keyword', 'phrasebook', 'scene', 'tv', 'notes', 'layers', 'wave'));
