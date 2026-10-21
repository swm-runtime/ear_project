/**
 * 검색 질의 정규화 — **NFC 정규화 + 소문자 통일 + 앞뒤 공백 제거** (`explore.md` 4.5-5).
 *
 * NFD 분해형 입력(ㅋ+ㅓ — macOS 계열 입력기)이 NFC로 저장된 텍스트와 매칭되지 않는 것을
 * 막는다. 정규화는 애플리케이션 계층이 하고 정규화 사본 컬럼은 두지 않는다(domain.md 5.1).
 */
export function normalizeSearchText(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase();
}

/**
 * **적재하는 텍스트의 유니코드 정규화**(domain.md 5.1 — "NFC 정규화는 적재·질의 양쪽에서
 * 애플리케이션 계층이 한다").
 *
 * 질의 쪽만 정규화하면 **NFD로 조합된 제목이 검색에서 통째로 사라진다** — macOS에서 복사한
 * 한글이 대표적이다. 눈에는 같은 글자인데 코드포인트가 달라 `ILIKE`도, trigram도 맞지 않고,
 * 오류가 아니라 "결과 없음"으로 조용히 나타난다.
 *
 * **소문자로 바꾸지 않는다.** 표시되는 값이라 대소문자를 보존해야 한다 — 검색 비교의
 * 소문자 통일은 `normalizeSearchText`와 `ILIKE`가 담당한다.
 */
export function normalizeStoredText(raw: string): string {
  return raw.normalize('NFC');
}

/**
 * LIKE/ILIKE 패턴 안에 질의를 넣기 전에 와일드카드를 이스케이프한다.
 * 이스케이프하지 않으면 `%`·`_` 입력이 "전체 일치" 패턴이 되어 검색 결과가 오염된다.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** 해시태그 전용 검색의 접두 — `#뱅크런`은 태그가 정확히 `뱅크런`인 콘텐츠만 찾는다(`explore.md` 4.5-2, KAN-218) */
export const TAG_SEARCH_PREFIX = '#';

/** 검색 질의를 해석한 결과 */
export interface ParsedSearchQuery {
  /**
   * 정규화한 질의 — **`#`을 남긴다.** 커서 지문과 검색 로그가 이 값을 쓴다(태그 검색 비율을 셀 수 있게). 태그 전용이면
   * `#` + 검색어로 맞춰 `#  뱅크런`과 `#뱅크런`이 같은 값이 된다
   */
  normalizedQuery: string;
  /** 매칭에 쓰는 검색어 — 앞의 `#` 하나를 떼고 다시 트림한 값. 2자 규칙도 이 값에 적용한다 */
  term: string;
  /** `#`으로 시작했으면 태그 정확 일치만 찾는다 */
  tagOnly: boolean;
}

/**
 * 검색 질의 해석 — 정규화(`normalizeSearchText`) 뒤 **앞의 `#` 하나**를 뗀다. `##태그`는 `#태그`를 찾는 것이 아니라
 * 남은 `#`이 검색어에 들어가 매칭되지 않는다(태그에는 `#`이 없다 — `CONTENT_TAG_PATTERN`).
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const normalized = normalizeSearchText(raw);
  if (!normalized.startsWith(TAG_SEARCH_PREFIX)) {
    return { normalizedQuery: normalized, term: normalized, tagOnly: false };
  }

  const term = normalized.slice(TAG_SEARCH_PREFIX.length).trim();
  return {
    normalizedQuery: `${TAG_SEARCH_PREFIX}${term}`,
    term,
    tagOnly: true,
  };
}

/** 트림 후 특수문자·이모지만 남는 질의 판정 — 문자·숫자가 하나도 없으면 검색하지 않는다 */
export function hasSearchableCharacter(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}
