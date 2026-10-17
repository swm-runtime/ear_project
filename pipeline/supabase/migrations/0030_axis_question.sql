-- 0030 (2026-10-17): 축 유형 "질문" 추가 — 글로벌판 소개형 전환(박수헌: 글로벌판은 한국 문화를 소개한다). 처음 보는 사람이 그 관행에 대해 물을 질문 하나가 축이다
-- 한국판은 이 값을 쓰지 않는다(한국판 프롬프트·스키마 enum 에 없음) — 제약만 넓힌다
-- 되돌리기: alter table public.backlog drop constraint backlog_axis_type_check; alter table public.backlog add constraint backlog_axis_type_check check (axis_type in ('대립','역설','재정의','사건'));
alter table public.backlog drop constraint if exists backlog_axis_type_check;
alter table public.backlog add constraint backlog_axis_type_check check (axis_type in ('대립','역설','재정의','사건','질문'));
