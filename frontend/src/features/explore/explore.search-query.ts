/**
 * 검색 질의 판정(explore.md 4.5-2) — 트림 후 2자 미만이거나 특수문자·이모지만인 입력은
 * 검색을 실행하지 않는다("검색어를 입력해주세요" 유지). 이 필터는 UX이고 최종 판정은
 * 서버 방어선이다(explore-api.md 4.5 — 같은 기준으로 VALIDATION_FAILED 400).
 *
 * `#`으로 시작하면 태그 전용 검색이다(2026-10-16 KAN-218·KAN-219) — 앞의 `#` 하나를 떼고 다시 트림한
 * 값으로 같은 규칙을 잰다. `#`만이나 `#a`는 실행하지 않는다(서버도 VALIDATION_FAILED).
 */

/** 태그 전용 검색의 접두 — 태그 값에는 `#`이 없고 화면이 붙인다(explore-api.md 4.1 `content.tags`) */
export const TAG_QUERY_PREFIX = '#';

/**
 * 서버로 보낼 질의 — 앞뒤 공백만 무시한다(explore.md 4.5-2). `#`도 떼지 않고 그대로 보낸다 —
 * 태그 전용 모드 판정은 서버가 한다. NFC 정규화·소문자 통일도 서버가 한다(explore-api.md 4.5) —
 * 가공 규칙이 양쪽에 생기면 버전마다 매칭 결과가 갈라진다.
 */
export const toSearchQuery = (raw: string): string => raw.trim();

/**
 * 검색을 실행할 수 있는 질의인가 — 트림 후(태그 질의는 앞의 `#` 하나를 떼고 다시 트림한 뒤) 2자 이상이고
 * 문자(\p{L})·숫자(\p{N})가 하나라도 있어야 한다. 특수문자·이모지만인 입력이 여기서 걸러진다.
 * `##태그`는 앞의 `#` 하나만 떼므로 `#태그`로 재고 실행한다 — 매칭되지 않는 것은 서버 결과다(4.5-2).
 */
export const isSearchableQuery = (raw: string): boolean => {
  const trimmed = raw.trim();
  const target = trimmed.startsWith(TAG_QUERY_PREFIX)
    ? trimmed.slice(TAG_QUERY_PREFIX.length).trim()
    : trimmed;
  return target.length >= 2 && /[\p{L}\p{N}]/u.test(target);
};

/** 태그 탭이 여는 검색어 — `#` + 태그 값(KAN-219). 태그 값은 서버가 준 그대로 쓴다 */
export const toTagQuery = (tag: string): string => `${TAG_QUERY_PREFIX}${tag}`;
