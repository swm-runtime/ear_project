import type { ExploreSection } from './explore.types';

/**
 * SectionList에 넘길 섹션의 React key — 서버의 sectionKey는 topic_group이 주제마다 반복돼
 * 그대로 쓰면 충돌한다(2026-08-08 통합 테스트 발견). 유일성 재료는 응답 안에 이미 있다:
 * topic_group은 topic.id가 주제마다 다르고, 나머지(interest·new·popular)는 응답에 하나씩만 온다
 * (explore-api.md 4.1). 인덱스를 쓰지 않는 이유 — 서버가 섹션 순서를 바꾸면 전체가 재마운트된다.
 *
 * 화면 분기에는 여전히 쓰지 않는다 — 토글 노출은 period로 가른다(계약 규약 유지).
 */
export const buildSectionListKey = (
  section: Pick<ExploreSection, 'sectionKey' | 'topic'>,
): string =>
  section.topic ? `${section.sectionKey}:${section.topic.id}` : section.sectionKey;
