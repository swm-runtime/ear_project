-- 0012 (2026-09-07): 발행 연결 고리 — backlog 에 제품 content_version·발행 시각 기록.
-- 파이프라인 DB 와 제품 DB 는 분리 유지(박수헌 확정 2026-09-07). 경계를 건너는 통로는 발행·재발행 API 뿐이고,
-- "어느 에피소드가 제품의 무엇인지"는 이 세 컬럼이 유일한 기록이다. published_content_ref 는 기존 컬럼(수기) — 발행 화면이 자동 기록하도록 바뀜.
-- published_at 은 TTS 재합성 시각(runs.executed_at)과 비교해 에피소드 상세에 "재발행 — 오디오 교체" 버튼을 띄우는 기준 (spec/07 5장).

alter table backlog add column if not exists published_version int;
alter table backlog add column if not exists published_at timestamptz;

comment on column backlog.published_content_ref is '발행 후 제품 content_id (0012 부터 발행 화면이 자동 기록, 이전은 수기)';
comment on column backlog.published_version is '제품 content_version (재발행마다 +1)';
comment on column backlog.published_at is '최근 발행·재발행 시각 — TTS 재합성 시각과 비교해 재발행 버튼 표시';

-- 기존 published 행: 발행 시각을 모르므로 updated_at 으로 근사 (재발행 버튼 판정용 — 이후 재발행하면 정확한 값으로 덮인다)
update backlog set published_at = coalesce(published_at, updated_at) where status = 'published';
