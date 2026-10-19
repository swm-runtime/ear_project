import { EXPLORE_COPY } from './explore.copy';
import type { ExploreSection } from './explore.types';

/**
 * 화면에 그릴 섹션 제목. **아는 종류(interest·new·popular)는 앱 문구**, 그 밖(`topic_group` 의 주제 이름·서버가 새로 더한
 * 종류)은 서버 `title` 그대로다 — global-api.md 2.3 "화면 문구는 클라이언트"(2026-10-19 KAN-194: 서버 제목이 한국어 고정이라
 * 영어 표시에서 한국어가 보였다). 모르는 종류를 서버 값으로 두므로 서버는 여전히 배포 없이 섹션을 더할 수 있다
 */
export const resolveSectionTitle = (
  section: Pick<ExploreSection, 'sectionKey' | 'title'>,
): string => {
  const titles: Readonly<Record<string, string>> = EXPLORE_COPY.sectionTitles;
  return Object.prototype.hasOwnProperty.call(titles, section.sectionKey)
    ? titles[section.sectionKey]
    : section.title;
};
