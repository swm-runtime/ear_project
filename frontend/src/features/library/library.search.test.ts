import { describe, expect, it } from '@jest/globals';

import { filterLibraryRows, matchesLibraryQuery, normalizeLibraryQuery } from './library.search';
import type { LibraryContent, LibraryListRow } from './library.types';

const content = (overrides: Partial<LibraryContent>): LibraryContent => ({
  id: 'c1',
  title: '번아웃 없이 오래 일하는 법',
  authorName: '김서연',
  sourceName: '폴인',
  sourceUrl: null,
  durationSec: 600,
  thumbnailUrl: 'https://example.com/t.jpg',
  contentVersion: 1,
  topicIds: [],
  ...overrides,
});

const itemRow = (c: LibraryContent): LibraryListRow => ({
  kind: 'item',
  item: {
    id: `li-${c.id}`,
    source: 'drip',
    status: 'unplayed',
    addedAt: '2026-09-16T04:00:00Z',
    lastPlayedAt: null,
    completedAt: null,
    isCountedToday: false,
    content: c,
    progress: null,
  },
});

describe('matchesLibraryQuery — 라이브러리 로컬 검색 매칭', () => {
  it('제목·저자·출처 중 하나라도 부분 일치하면 맞는다', () => {
    const c = content({});
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('오래'))).toBe(true);
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('서연'))).toBe(true);
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('폴인'))).toBe(true);
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('없는말'))).toBe(false);
  });

  it('저자가 null인 AI 생성 콘텐츠에서도 죽지 않고 나머지 필드로 판정한다(2026-09-16 크래시)', () => {
    const c = content({ id: 'ai', authorName: null, sourceName: '참고한 자료: 롱블랙' });
    expect(() => matchesLibraryQuery(c, 'ㅂ')).not.toThrow();
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('롱블랙'))).toBe(true);
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('김서연'))).toBe(false);
  });

  it('대소문자와 앞뒤 공백을 무시한다', () => {
    const c = content({ title: 'Deep Work' });
    expect(matchesLibraryQuery(c, normalizeLibraryQuery('  deep '))).toBe(true);
  });
});

describe('filterLibraryRows — 검색 중 행 필터', () => {
  const rows: LibraryListRow[] = [
    itemRow(content({ id: 'a', title: '첫 번째' })),
    { kind: 'discoveryHeader' },
    itemRow(content({ id: 'b', title: '두 번째', authorName: null })),
  ];

  it('검색어가 비면 원본 행을 그대로 돌려준다', () => {
    expect(filterLibraryRows(rows, '')).toBe(rows);
  });

  it('검색 중에는 구획 헤더를 빼고 맞는 항목만 남긴다', () => {
    const result = filterLibraryRows(rows, normalizeLibraryQuery('두'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'item', item: { id: 'li-b' } });
  });
});
