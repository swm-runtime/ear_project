-- 0009 — 규칙 자산의 진실을 DB 로 + 실행 계측 (spec/10 3.2 · spec/08 1장 저장 배치 기준 · 3.1 G1). 적용: 미적용 — 팀 Supabase SQL 에디터에서
-- 문제: 워커가 모델에게 건네는 규칙 파일(guidelines·골드·QA 프롬프트·루브릭)이 각자의 git 체크아웃이라, 누가 작업을 집느냐에 따라
--       다른 규칙으로 실행됐고 PROMPT_VERSION env 라벨과 실제 규칙이 어긋날 수 있었다.
-- 해법: 자주 바뀌는 자산 7개는 이 테이블이 진실. 웹(/assets)에서 새 버전(draft) → 활성화. 워커는 작업 시작 시 active 묶음을 읽어
--       WORK_ROOT/assets/<해시>/ 에 파일로 내려놓고 claude -p 에 넘긴다. spec/03·04·05 본문은 git 에 남긴다(하이브리드).
--       에피소드는 만들어질 때의 묶음을 asset_versions 에 고정한다 — 한 편 안에서 규칙이 섞이지 않는다.

create table if not exists public.prompt_assets (
  key          text not null,            -- 'skills/draft/guidelines.md' — 워커 assetPaths 가 쓰는 경로 그대로
  version      text not null,            -- 'full-v5.1' · 'qa-v1.2' · 'critic-v1.3' · 'gold@2026-08-28'
  content      text not null,
  status       text not null default 'draft' check (status in ('draft','active','retired')),
  note         text,                     -- 왜 바꿨나 — 활성화 시 필수. CHANGELOG 의 원료 (spec/09 4.3)
  created_by   text,                     -- 세션 이메일(트리거) 또는 시딩/워커 명시값
  created_at   timestamptz not null default now(),
  activated_at timestamptz,
  activated_by text,
  primary key (key, version)
);
create unique index if not exists prompt_assets_active_idx on public.prompt_assets (key) where status = 'active';
comment on table public.prompt_assets is '워커가 모델에게 건네는 규칙 자산의 진실 (spec/10 3.2). key 당 active 1개. active 본문은 불변 — 고치려면 새 버전을 활성화한다';

alter table public.prompt_assets enable row level security;
drop policy if exists team_select on public.prompt_assets;
create policy team_select on public.prompt_assets for select to authenticated using (true);
drop policy if exists team_insert on public.prompt_assets;
create policy team_insert on public.prompt_assets for insert to authenticated with check (status = 'draft');
drop policy if exists team_update on public.prompt_assets;
create policy team_update on public.prompt_assets for update to authenticated using (true) with check (true);

-- 규약을 DB 가 강제한다: 스탬프 · active 본문 불변 · retired 부활 금지 · 활성화 시 note 필수 + 기존 active 자동 retired
create or replace function public.guard_prompt_asset() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_actor(), new.created_by);
    new.created_at := now();
    if new.status = 'active' then
      new.activated_at := now();
      new.activated_by := coalesce(public.current_actor(), new.activated_by, new.created_by);
      update public.prompt_assets set status = 'retired' where key = new.key and status = 'active' and version <> new.version;
    end if;
    return new;
  end if;
  if old.status = 'active' and new.content is distinct from old.content then
    raise exception 'active 자산의 본문은 수정할 수 없다 — 새 버전을 만들어 활성화하라 (% / %)', old.key, old.version;
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'retired 자산은 되살릴 수 없다 — 새 버전으로 (% / %)', old.key, old.version;
  end if;
  if new.status = 'active' and old.status <> 'active' then
    if coalesce(new.note, '') = '' then raise exception '활성화에는 note(변경 사유)가 필요하다 (% / %)', new.key, new.version; end if;
    new.activated_at := now();
    new.activated_by := coalesce(public.current_actor(), new.activated_by);
    update public.prompt_assets set status = 'retired' where key = new.key and status = 'active' and version <> new.version;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_prompt_asset on public.prompt_assets;
create trigger trg_guard_prompt_asset before insert or update on public.prompt_assets for each row execute function public.guard_prompt_asset();

-- 에피소드 단위 규칙 고정
alter table public.episodes add column if not exists asset_versions jsonb;
comment on column public.episodes.asset_versions is '{ key: version } — 이 에피소드가 만들어질 때의 규칙 묶음. draft→qa→critic→재QA 가 같은 규칙을 쓴다 (spec/10 3.2)';

-- 실행 계측 — API 전환(G1) 비용 원료 · spec 체크아웃 추적 (spec/08 3.1)
alter table public.runs
  add column if not exists cost_usd   numeric,   -- claude -p 정가 환산(구독 실행 시 참고값) / API 실행 시 실비
  add column if not exists tokens     jsonb,     -- 실행기가 돌려준 usage 원본
  add column if not exists worker_rev text;      -- 워커 체크아웃 커밋 SHA(+dirty) — git 에 남는 spec 이 어느 판이었는지
