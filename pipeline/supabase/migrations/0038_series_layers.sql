-- 0038 (2026-10-29): 계층 쌓기(layers) 시리즈 디자인 — 층 이름:편 범위를 시리즈마다 적는다(예: "연결:1-6, 처리:7-9, 데이터:10-18, 운영:19-26"). publications.style 에 layers 허용
alter table public.series add column if not exists thumb_layers text;
alter table public.publications drop constraint if exists publications_style_check;
alter table public.publications add constraint publications_style_check check (style in ('keyword', 'phrasebook', 'scene', 'tv', 'notes', 'layers'));
