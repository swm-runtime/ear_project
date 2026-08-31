-- ear 콘텐츠 파이프라인 스키마 v1 (04-ops-infra.md 기반)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run

-- ── 1. domains: 출처 사이트 풀 (02 문서) ─────────────────────────
create table if not exists domains (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null unique,            -- 예: techblog.woowahan.com
  publisher   text,                            -- 예: 우아한형제들 기술블로그
  tier        text not null default 'candidate'
              check (tier in ('allow_open','allow_support','blocked','hold','candidate')),
  category    text,                            -- 국내 기업 기술블로그 / 글로벌 / 오픈소스 / 학술
  feed_url    text,                            -- RSS/Atom 주소
  topic_coverage text[] default '{}',          -- 커버 중분류
  license_basis  text,                         -- 판정 근거 (라이선스·약관 확인 내용)
  decided_by  text,                            -- 판정자 (게이트: 사람만 기입)
  decided_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── 2. sources: 스윕으로 수집한 소스 링크+메타데이터 ─────────────
-- 원문 본문은 저장하지 않는다. 중복 대조("이 URL 쓴 적 있나")의 원천.
create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  domain_id   uuid references domains(id),
  url         text not null unique,
  title       text not null,
  summary     text,                            -- 발행처가 피드에 담아 배포한 요약
  author      text,
  published   date,
  swept_at    date not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sources_published on sources (published desc);

-- ── 3. backlog: 에피소드 주제 후보 (03 문서 3장) ─────────────────
create table if not exists backlog (
  id          text primary key,                -- 'C04' 형식 유지
  mid_topic   text not null,                   -- 중분류 (예: 데이터·AI)
  title       text not null,
  summary     text,
  target_fit  text,
  angle       text,                            -- 구성 각도(안)
  sources     jsonb not null default '[]',     -- [{url, publisher, published, title, tier, backbone}]
  status      text not null default 'proposed'
              check (status in ('proposed','approved','claimed','drafted',
                                'qa_passed','packaged','published',
                                'rejected','review_required','expired','held')),
  dedup_note  text,
  approved_by text,                            -- 게이트 1: 사람만 기입
  approved_at timestamptz,
  claimed_by  text,                            -- 동시 작업 충돌 방지
  claimed_at  timestamptz,
  published_content_ref text,                  -- 발행 후 제품 콘텐츠 식별 (수기)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 4. runs: 실행 기록 — 계측의 원천 (04 문서) ───────────────────
create table if not exists runs (
  id          uuid primary key default gen_random_uuid(),
  backlog_id  text references backlog(id),
  phase       text not null
              check (phase in ('sweep','cluster','draft','critic','qa','package','tts')),
              -- critic: 품질 사이클의 선행 비평 실행 (spec/09 7장) — QA(사실)와 별개의 스타일 검수
  attempt     int not null default 1,          -- QA 재생성 차수 (1~3)
  result      text,                            -- 통과/실패 + 사유 요약
  prompt_version text,                         -- 스킬(프롬프트) 버전
  artifacts   text[] default '{}',             -- 스토리지/S3 경로 (script.md, claims.md 등)
  model       text,                            -- 실행 모델 (로컬 전환 판단 데이터 — spec/08 5장)
  executed_by text not null,
  executed_at timestamptz not null default now()
);

-- ── 5. topics: 주제 체계 — 대분류/중분류의 단일 진실 원천 ────────
-- 주제 추가·변경은 이 테이블의 행 편집으로 한다 (PIPELINE.md 1장의 표는 이 테이블의 반영).
create table if not exists topics (
  id          uuid primary key default gen_random_uuid(),
  major       text not null,                   -- 대분류: 돈 / 배움 / 일
  mid         text not null unique,            -- 중분류 (backlog.mid_topic·domains.topic_coverage가 이 이름을 참조)
  ai_generation boolean not null default true, -- AI 생성 대상 여부 (배제 합의의 데이터화)
  explainer   text check (explainer in ('윤아','이음')),  -- 해설 담당 페르소나 (spec/04)
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── RLS: 켜두되 정책 없음 → publishable(anon) 키로는 접근 불가 ──
-- secret 키(에이전트)는 RLS를 우회하므로 영향 없음.
-- 웹 UI를 붙일 때 팀원 계정용 정책을 추가한다.
alter table topics  enable row level security;
alter table domains enable row level security;
alter table sources enable row level security;
alter table backlog enable row level security;
alter table runs    enable row level security;
