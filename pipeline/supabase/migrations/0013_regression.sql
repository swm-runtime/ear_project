-- 0013 (2026-09-07): 회귀 세트 표시 — spec/09 7.1 "세트는 episodes.regression = true 로 표시".
-- 판정 완료 대본(타당도) · 심은 오류본(누검출) · 저품질 앵커(압축 검출)를 같은 플래그로 묶고 kind 로 구분한다.
-- 심은 오류·앵커 에피소드는 발행 대상이 아니다 — backlog 는 status 'held' 로 두어 워커가 집지 않게 한다.

alter table episodes add column if not exists regression boolean not null default false;
alter table episodes add column if not exists regression_kind text
  check (regression_kind in ('judged', 'planted', 'anchor_low'));

comment on column episodes.regression is '회귀 세트 포함 여부 (spec/09 7.1) — 판정 라벨은 critic_verdicts 에 평가자 버전과 함께';
comment on column episodes.regression_kind is 'judged=판정 완료 대본 · planted=심은 오류본(정답은 backlog.angle) · anchor_low=저품질 앵커';

-- 첫 회귀 세트: critic-v2 로 판정한 대본
update episodes set regression = true, regression_kind = 'judged'
  where id in ('T260828-001', 'T260828-002', 'T260829-001', 'T260829-002', 'T260829-003', 'T260829-004', 'T260831-001', 'T260831-002');
