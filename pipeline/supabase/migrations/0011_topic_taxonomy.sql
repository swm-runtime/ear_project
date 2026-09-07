-- 0011 (2026-09-06): 주제 체계 개편 — 대분류 3(돈/배움/일) → 7(돈·경제/일/비즈니스/과학·기술/심리·마음/인문·교양/자격증·시험), 중분류 10 → 28.
-- "배움"이 기술·심리·교양·스킬이 뒤섞인 잡동사니 칸이 되어 축을 "주제 영역" 하나로 통일했다(박수헌 확정 2026-09-06).
-- 제품 topics(parent_category·name)와 1:1 로 맞춘다 — 제품 쪽 반영은 웹 /publish/topics [파이프라인 체계와 맞추기].
-- 대분류 이름·순서는 apps/web/lib/taxonomy.ts(MAJOR_TOPICS), 중분류·AI 배제·해설은 이 테이블이 진실 원천.
-- 기존 텍스트 참조(backlog.mid_topic · domains.topic_coverage · settings.templates.major_lines)도 함께 옮긴다.

begin;

-- 1. topics: 있는 중분류는 대분류만 옮기고(id·note 보존), 새 중분류는 추가. AI 배제는 "일" 대분류 전체(합의 2026-08-09 유지).
insert into topics (major, mid, ai_generation, explainer, note) values
  ('돈·경제',   '재테크',      true,  '이음', null),
  ('돈·경제',   '투자',        true,  '이음', null),
  ('돈·경제',   '경제 상식',   true,  '이음', null),
  ('돈·경제',   '부동산',      true,  '이음', null),
  ('일',        '커리어',      false, null,   'AI 생성 배제 (합의 2026-08-09)'),
  ('일',        '생산성',      false, null,   'AI 생성 배제 (합의 2026-08-09)'),
  ('일',        '리더십',      false, null,   'AI 생성 배제 (합의 2026-08-09)'),
  ('일',        '커뮤니케이션', false, null,   'AI 생성 배제 (합의 2026-08-09)'),
  ('일',        '조직',        false, null,   'AI 생성 배제 (일 대분류 규칙 승계)'),
  ('비즈니스',  '경영',        true,  '이음', null),
  ('비즈니스',  '마케팅',      true,  '이음', null),
  ('비즈니스',  '스타트업',    true,  '이음', null),
  ('비즈니스',  '트렌드',      true,  '이음', null),
  ('과학·기술', '데이터·AI',   true,  '이음', null),
  ('과학·기술', 'IT·개발',     true,  '이음', null),
  ('과학·기술', '자연과학',    true,  '이음', null),
  ('심리·마음', '심리학',      true,  '윤아', null),
  ('심리·마음', '뇌과학·인지', true,  '윤아', null),
  ('심리·마음', '습관·동기',   true,  '윤아', null),
  ('심리·마음', '인간관계',    true,  '윤아', null),
  ('인문·교양', '철학',        true,  '윤아', null),
  ('인문·교양', '역사',        true,  '윤아', null),
  ('인문·교양', '사회·문화',   true,  '윤아', null),
  ('인문·교양', '예술',        true,  '윤아', null),
  ('자격증·시험', 'TOPCIT',       true, '이음', '시험 단위 중분류'),
  ('자격증·시험', '한능검',       true, '윤아', '시험 단위 중분류 (한국사능력검정)'),
  ('자격증·시험', '공인중개사',   true, '이음', '시험 단위 중분류'),
  ('자격증·시험', '산업안전기사', true, '이음', '시험 단위 중분류')
on conflict (mid) do update
  set major = excluded.major, ai_generation = excluded.ai_generation, explainer = excluded.explainer, active = true;

-- 체계에서 빠진 중분류: 글쓰기(일·교양 어디에도 두지 않기로), 인문·교양(대분류로 승격 — 중분류 4개로 분해).
-- 행을 지우지 않고 비활성으로 남겨 이력을 보존한다.
update topics set active = false, note = coalesce(note || ' · ', '') || '0011 체계 개편으로 폐지' where mid in ('글쓰기', '인문·교양');

-- 2. backlog.mid_topic — 제목 기준으로 새 중분류에 배정 (2026-09-06 판단)
update backlog set mid_topic = '철학'      where id in ('C17', 'C38');                          -- 불확실성과 함께 사는 법 · 정의(定義)의 힘
update backlog set mid_topic = '역사'      where id in ('C18', 'C22', 'C24', 'C25', 'C26');     -- 배움의 지름길 · 문명 몰락 · 사물로 역사 · 기록되지 않은 사람들 · 호메로스의 로봇
update backlog set mid_topic = '사회·문화' where id in ('C23', 'C19');                          -- 편리한 도시 · 편지 쓰기(구 글쓰기)
update backlog set mid_topic = '자연과학'  where id = 'C41';                                    -- 몸은 부하에 적응한다(운동 생리)

-- 3. domains.topic_coverage
--  3a. 자격증 4종 → 시험명
update domains set topic_coverage = array_replace(topic_coverage, '자격증·TOPCIT',   'TOPCIT');
update domains set topic_coverage = array_replace(topic_coverage, '자격증·부동산',   '공인중개사');
update domains set topic_coverage = array_replace(topic_coverage, '자격증·한국사',   '한능검');
update domains set topic_coverage = array_replace(topic_coverage, '자격증·산업안전', '산업안전기사');
--  3b. 글쓰기 → 어문 기관은 커뮤니케이션, 서평·문예 웹진은 사회·문화
update domains set topic_coverage = array_replace(topic_coverage, '글쓰기', '커뮤니케이션') where domain in ('www.korean.go.kr', 'lithub.com');
update domains set topic_coverage = array_replace(topic_coverage, '글쓰기', '사회·문화');
--  3c. 인문·교양 — 역사 소스(역사 태그 동반)는 인문·교양만 제거, 나머지는 성격별 분해
update domains set topic_coverage = array_remove(topic_coverage, '인문·교양') where '역사' = any(topic_coverage);
update domains set topic_coverage = array_replace(topic_coverage, '인문·교양', '예술') || '{역사}'     where domain = 'www.museum.go.kr';
update domains set topic_coverage = array_replace(topic_coverage, '인문·교양', '자연과학') || '{철학}' where domain = 'nautil.us';
update domains set topic_coverage = array_replace(topic_coverage, '인문·교양', '철학')                 where domain in ('aeon.co', 'psyche.co', 'inmun360.culture.go.kr');
update domains set topic_coverage = array_replace(topic_coverage, '인문·교양', '철학') || '{예술}'     where domain = 'publicdomainreview.org';
update domains set topic_coverage = array_replace(topic_coverage, '인문·교양', '사회·문화');           -- 나머지(웹진·The Conversation·OWID 등)
--  3d. 중복 제거 (같은 값이 두 번 들어간 경우)
update domains d set topic_coverage = (select array_agg(distinct v order by v) from unnest(d.topic_coverage) v)
  where topic_coverage is not null and array_length(topic_coverage, 1) > 1;

-- 4. settings.templates.major_lines — 키를 새 대분류로 (값은 전부 빈 상태였음)
update settings set value = jsonb_set(value, '{major_lines}',
  '{"돈·경제":"","일":"","비즈니스":"","과학·기술":"","심리·마음":"","인문·교양":"","자격증·시험":""}'::jsonb)
  where key = 'templates';

commit;
