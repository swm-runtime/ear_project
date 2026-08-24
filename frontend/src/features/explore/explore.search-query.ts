/**
 * 검색 질의 판정(explore.md 4.5-2) — 트림 후 2자 미만이거나 특수문자·이모지만인 입력은
 * 검색을 실행하지 않는다("검색어를 입력해주세요" 유지). 이 필터는 UX이고 최종 판정은
 * 서버 방어선이다(explore-api.md 4.5 — 같은 기준으로 VALIDATION_FAILED 400).
 */

/**
 * 서버로 보낼 질의 — 앞뒤 공백만 무시한다(explore.md 4.5-2).
 * NFC 정규화·소문자 통일은 서버가 한다(explore-api.md 4.5) — 가공 규칙이 양쪽에 생기면
 * 버전마다 매칭 결과가 갈라진다.
 */
export const toSearchQuery = (raw: string): string => raw.trim();

/**
 * 검색을 실행할 수 있는 질의인가 — 트림 후 2자 이상이고 문자(\p{L})·숫자(\p{N})가
 * 하나라도 있어야 한다. 특수문자·이모지만인 입력이 여기서 걸러진다.
 */
export const isSearchableQuery = (raw: string): boolean => {
  const trimmed = raw.trim();
  return trimmed.length >= 2 && /[\p{L}\p{N}]/u.test(trimmed);
};
