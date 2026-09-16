import type { LibraryContent, LibraryListRow } from './library.types';

/** 검색어 정규화 — 앞뒤 공백을 버리고 대소문자를 무시한다. 빈 문자열이면 검색 중이 아니다 */
export const normalizeLibraryQuery = (query: string): string => query.trim().toLowerCase();

/**
 * 받아 둔 목록을 그 자리에서 좁히는 로컬 매칭 — 제목·저자·출처 부분 일치.
 * `authorName`은 AI 생성 콘텐츠에서 null이다(domain.md 5.1) — null 필드는 건너뛴다.
 * 예전엔 `field.toLowerCase()`를 그대로 불러 첫 글자 입력에 앱이 죽었다(2026-09-16).
 */
export const matchesLibraryQuery = (content: LibraryContent, normalizedQuery: string): boolean => {
  if (normalizedQuery.length === 0) return true;
  const fields: (string | null | undefined)[] = [
    content.title,
    content.authorName,
    content.sourceName,
  ];
  return fields.some(
    (field) => typeof field === 'string' && field.toLowerCase().includes(normalizedQuery),
  );
};

/**
 * 검색 중에는 구획 헤더를 빼고 하나의 결과 목록으로 돌려준다 —
 * 헤더만 남고 아래가 비는 구획이 생기지 않게. 검색어가 비면 원본 행을 그대로 돌려준다
 */
export const filterLibraryRows = (
  rows: LibraryListRow[],
  normalizedQuery: string,
): LibraryListRow[] => {
  if (normalizedQuery.length === 0) return rows;
  return rows.filter(
    (row) => row.kind === 'item' && matchesLibraryQuery(row.item.content, normalizedQuery),
  );
};
