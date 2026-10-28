-- 0037 (2026-10-28): 간행물 썸네일 디자인 2종 추가 — tv(TV 정지 화면, 광고로 읽는 마케팅) · notes(포스트잇 벽, 사례로 알아보는 창업). 워커 thumbnail-code.ts
alter table public.publications drop constraint if exists publications_style_check;
alter table public.publications add constraint publications_style_check check (style in ('keyword', 'phrasebook', 'scene', 'tv', 'notes'));
