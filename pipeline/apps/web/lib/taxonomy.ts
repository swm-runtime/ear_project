/**
 * 주제 체계 — 대분류 목록·표시 순서 (2026-09-06 개편).
 * 중분류·AI 생성 배제·해설 페르소나는 `topics` 테이블이 진실 원천이고(PIPELINE 1장), 이 상수는 대분류의
 * **이름과 순서**만 든다 — /topics 의 대분류 선택지, 설정의 대분류별 한 줄, 제품 주제 동기화의 display_order 기준.
 * 제품 `topics.parent_category` 와 같은 이름을 쓴다 (제품 주제 = 중분류 1:1).
 */
export const MAJOR_TOPICS = ["돈·경제", "일", "비즈니스", "과학·기술", "심리·마음", "인문·교양", "자격증·시험"] as const;
export type MajorTopic = (typeof MAJOR_TOPICS)[number];

/** 대분류 순서 인덱스 — 목록에 없는 값은 맨 뒤 */
export const majorOrder = (major: string): number => { const i = (MAJOR_TOPICS as readonly string[]).indexOf(major); return i < 0 ? MAJOR_TOPICS.length : i; };
