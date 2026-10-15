/**
 * 주제 체계 — 대분류 목록·표시 순서 (2026-09-06 개편).
 * 중분류·AI 생성 배제·해설 페르소나는 `topics` 테이블이 진실 원천이고(PIPELINE 1장), 이 상수는 대분류의
 * **이름과 순서**만 든다 — /topics 의 대분류 선택지, 설정의 대분류별 한 줄, 제품 주제 동기화의 display_order 기준.
 * 제품 `topics.parent_category` 와 같은 이름을 쓴다 (제품 주제 = 중분류 1:1).
 */
export const MAJOR_TOPICS = ["돈·경제", "일", "비즈니스", "과학·기술", "심리·마음", "인문·교양", "자격증·시험"] as const;
export type MajorTopic = (typeof MAJOR_TOPICS)[number];

/**
 * 글로벌판 주제 8개 (docs/ai/global/PIPELINE.md 2장, 2026-10-14 확정) — **1단계**라 topics 행의 major·mid 를 같은 이름으로 둔다.
 * 그래서 대분류 단위로 붙는 것(설정의 한 줄 · 썸네일 띠 색)이 주제마다 하나씩이 된다(명세 2장·6.8). slug 는 제품 주제의 안정 키(명세 2장 표).
 */
export const GLOBAL_TOPICS = [
  { name: "Korean Language", slug: "korean-language" },
  { name: "K-Food", slug: "k-food" },
  { name: "K-Pop", slug: "k-pop" },
  { name: "K-Drama & Film", slug: "k-drama-film" },
  { name: "Korean Culture", slug: "korean-culture" },
  { name: "K-Beauty & Fashion", slug: "k-beauty-fashion" },
  { name: "Korean History & Society", slug: "korean-history-society" },
  { name: "Travel in Korea", slug: "travel-in-korea" },
] as const;

/** 인스턴스의 대분류 목록·순서 — 한국판 7개, 글로벌판은 주제 8개 그대로. locale 은 서버가 lib/locale.ts 로 읽어 넘긴다 */
export const majorTopicsFor = (locale: "ko" | "en"): readonly string[] => (locale === "en" ? GLOBAL_TOPICS.map((t) => t.name) : MAJOR_TOPICS);

/** 대분류 순서 인덱스 — 목록에 없는 값은 맨 뒤. majors 를 안 주면 한국판 순서 */
export const majorOrder = (major: string, majors: readonly string[] = MAJOR_TOPICS): number => { const i = majors.indexOf(major); return i < 0 ? majors.length : i; };
