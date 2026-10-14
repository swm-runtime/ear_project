-- 0028 (2026-10-15 KAN-209): 글로벌판 기획 입구 — 보조 주제 칸 · 게이트 1 확인 기록 (글로벌 명세 2장·6.3)
-- 두 칸 모두 NULL 허용이고 한국판 코드는 읽지도 쓰지도 않는다 — 한국판 행·동작은 바뀌지 않는다.
--   sub_topic    : 한 편에 붙는 두 번째 주제(대표 주제는 mid_topic). 글로벌 주제 기획 입력·백로그 화면에서만 쓴다
--   gate1_checks : {"screen": 배제 주제 판정 결과, "warnings_confirmed": {"at", "by"}} — en 인스턴스의 게이트 1 승인 조건 3·4
-- 되돌리기: alter table public.backlog drop column if exists sub_topic, drop column if exists gate1_checks;
alter table public.backlog add column if not exists sub_topic text;
alter table public.backlog add column if not exists gate1_checks jsonb;
