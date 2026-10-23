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

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;

/* 겹모음·겹받침은 **치는 순서대로** 푼다 — "과"는 "고" 다음에, "닭"은 "달" 다음에 나온다 */
const CHOSEONG = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];
const JUNGSEONG = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅗㅏ',
  'ㅗㅐ',
  'ㅗㅣ',
  'ㅛ',
  'ㅜ',
  'ㅜㅓ',
  'ㅜㅔ',
  'ㅜㅣ',
  'ㅠ',
  'ㅡ',
  'ㅡㅣ',
  'ㅣ',
];
const JONGSEONG = [
  '',
  'ㄱ',
  'ㄲ',
  'ㄱㅅ',
  'ㄴ',
  'ㄴㅈ',
  'ㄴㅎ',
  'ㄷ',
  'ㄹ',
  'ㄹㄱ',
  'ㄹㅁ',
  'ㄹㅂ',
  'ㄹㅅ',
  'ㄹㅌ',
  'ㄹㅍ',
  'ㄹㅎ',
  'ㅁ',
  'ㅂ',
  'ㅂㅅ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];
/** 음절로 묶이지 않고 홀로 온 겹자모(조합 중인 "ㅘ"·"ㄳ")도 같은 방식으로 푼다 */
const COMPOUND_JAMO: Record<string, string> = {
  ㅘ: 'ㅗㅏ',
  ㅙ: 'ㅗㅐ',
  ㅚ: 'ㅗㅣ',
  ㅝ: 'ㅜㅓ',
  ㅞ: 'ㅜㅔ',
  ㅟ: 'ㅜㅣ',
  ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ',
};

/**
 * 한글 음절을 호환 자모 열로 푼다. 한글이 아닌 글자는 그대로 둔다 — 질의는 이미 NFC다(`explore.md` 4.5-5).
 *
 * 검색 질의 로그의 타이핑 묶음 판정(`isSameTyping` — domain.md 5.7)과 교정어 재채점(`jamoEditSimilarity`)이 쓴다.
 * **교정어 후보를 거르는 자모 트라이그램은 이 함수가 아니라 SQL 함수 `hangul_to_jamo`(domain.md 5.1)가 푼다** — 질의·어휘
 * 양쪽을 DB 한 곳에서 풀어 매칭이 갈라지지 않게 한다.
 * 두 구현의 규칙(겹모음·겹받침을 치는 순서대로, 홀로 온 겹자모도 풂)은 같아야 하고, 그 동치는
 * `test/search-similar-fallback.e2e-spec.ts`가 실제 DB 위에서 대조한다.
 */
export function toJamo(text: string): string {
  let jamo = '';

  for (const char of text) {
    const code = char.codePointAt(0)!;

    if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) {
      jamo += COMPOUND_JAMO[char] ?? char;
      continue;
    }

    const offset = code - HANGUL_SYLLABLE_START;
    jamo +=
      CHOSEONG[Math.floor(offset / (JUNGSEONG_COUNT * JONGSEONG_COUNT))] +
      JUNGSEONG[Math.floor(offset / JONGSEONG_COUNT) % JUNGSEONG_COUNT] +
      JONGSEONG[offset % JONGSEONG_COUNT];
  }

  return jamo;
}

/**
 * 두 문자열의 편집 거리(Levenshtein — 한 글자 넣기·빼기·바꾸기를 1로 센다). 코드포인트 단위다.
 *
 * 검색 교정어 재채점(`jamoEditSimilarity`)이 자모열에 쓴다. DB에 `fuzzystrmatch`가 없어(확장을 늘리지 않는다)
 * 애플리케이션에서 잰다 — 교정어 후보는 SQL이 수십 개로 줄여 넘기고 말은 몇 글자라 비용이 없다.
 */
export function editDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[right.length];
}

/**
 * 자모 편집 유사도 — `1 − 자모 편집 거리 / 긴 쪽 자모 수`(0~1, 대칭). 검색 교정어 선택의 점수다(`explore.md` 4.5-5).
 *
 * 트라이그램 유사도는 다섯 자 안팎의 자모열에서 **틀린 자모 수를 구분하지 못한다** — "겅제"(ㄱㅓㅇㅈㅔ)에 대해
 * "경제"(자모 하나 차이)·"거의"·"정제"(둘 차이)가 `similarity` 0.333으로 같다. 편집 거리는 0.8 대 0.6으로 가른다.
 * 자모 분해는 `toJamo`다 — SQL `hangul_to_jamo`와 같은 규칙이고 동치는 e2e가 실제 DB에서 대조한다.
 */
export function jamoEditSimilarity(a: string, b: string): number {
  const left = toJamo(a);
  const right = toJamo(b);
  const longest = Math.max(Array.from(left).length, Array.from(right).length);

  if (longest === 0) {
    return 1;
  }

  return 1 - editDistance(left, right) / longest;
}
