-- 0031 (2026-10-20 KAN-136): 시리즈 썸네일 — 시리즈 안 편은 같은 그림에 번호만 다르다(박수헌 2026-10-20, 팀원 레퍼런스 "KEYWORD SERIES · 경제편 · 01")
--   thumb_word      : 그림에 이미지 모델이 그리는 큰 단어(레퍼런스의 필기체 "keyword")
--   thumb_label     : 오른쪽 위 작은 라벨(레퍼런스의 "KEYWORD SERIES") — 코드가 얹는다
--   thumb_box       : 왼쪽 아래 검은 박스 글자(레퍼런스의 "경제편") — 코드가 얹는다
--   thumb_base_key  : 시리즈 바탕 그림 s3 키(datasets/series/<id>/thumb-base.png). 첫 편 썸네일이 만들고 다음 편부터 재사용한다. 비우면 다음 썸네일이 새로 그린다
-- 세 글자 칸은 설계안 작업이 초안을 쓰고 사람이 게이트 S 에서 고친다
-- 되돌리기: alter table public.series drop column if exists thumb_word, drop column if exists thumb_label, drop column if exists thumb_box, drop column if exists thumb_base_key;
alter table public.series add column if not exists thumb_word text;
alter table public.series add column if not exists thumb_label text;
alter table public.series add column if not exists thumb_box text;
alter table public.series add column if not exists thumb_base_key text;
