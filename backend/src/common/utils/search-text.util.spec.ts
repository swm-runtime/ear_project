import {
  editDistance,
  escapeLikePattern,
  hasSearchableCharacter,
  jamoEditSimilarity,
  normalizeSearchText,
  parseSearchQuery,
  toJamo,
} from './search-text.util';

describe('normalizeSearchText', () => {
  it('NFD 분해형 입력을 NFC 입력과 같은 문자열로 정규화한다', () => {
    // given — "커리"의 NFD 분해형 (ㅋ+ㅓ+ㄹ+ㅣ)
    const nfd = '커리'.normalize('NFD');

    // when
    const normalized = normalizeSearchText(nfd);

    // then
    expect(normalized).toBe('커리');
    expect(normalized).toHaveLength(2);
  });

  it('대문자를 소문자로 통일한다', () => {
    // given
    // when
    const normalized = normalizeSearchText('AI 습관');

    // then
    expect(normalized).toBe('ai 습관');
  });

  it('앞뒤 공백을 제거한다', () => {
    // given
    // when
    const normalized = normalizeSearchText('  커리어  ');

    // then
    expect(normalized).toBe('커리어');
  });
});

describe('escapeLikePattern', () => {
  it('LIKE 와일드카드(%·_·역슬래시)를 이스케이프한다', () => {
    // given
    // when
    const escaped = escapeLikePattern('100%_\\달성');

    // then
    expect(escaped).toBe('100\\%\\_\\\\달성');
  });
});

describe('hasSearchableCharacter', () => {
  it('특수문자·이모지만인 입력이면 false다', () => {
    // given
    // when / then
    expect(hasSearchableCharacter('!!😀??')).toBe(false);
  });

  it('한글·숫자가 섞여 있으면 true다', () => {
    // given
    // when / then
    expect(hasSearchableCharacter('이직 2년차!')).toBe(true);
  });
});

describe('parseSearchQuery', () => {
  it('#으로 시작하면 태그 전용이고, 앞의 # 하나를 떼고 다시 트림한다 — 정규화 질의는 # + 검색어다', () => {
    // given
    // when
    const parsed = parseSearchQuery('  #  뱅크런 ');

    // then
    expect(parsed).toEqual({
      normalizedQuery: '#뱅크런',
      term: '뱅크런',
      tagOnly: true,
    });
  });

  it('#이 없으면 정규화한 질의가 곧 검색어다', () => {
    // given
    // when
    const parsed = parseSearchQuery('Bank Run');

    // then
    expect(parsed).toEqual({
      normalizedQuery: 'bank run',
      term: 'bank run',
      tagOnly: false,
    });
  });

  it('앞의 # 하나만 뗀다 — ##태그의 남은 #은 검색어에 남는다', () => {
    // given
    // when
    const parsed = parseSearchQuery('##태그');

    // then
    expect(parsed.term).toBe('#태그');
  });
});

describe('toJamo', () => {
  it.each([
    ['커리어', 'ㅋㅓㄹㅣㅇㅓ', '받침 없는 음절'],
    ['면접', 'ㅁㅕㄴㅈㅓㅂ', '홑받침'],
    ['과자', 'ㄱㅗㅏㅈㅏ', '겹모음은 치는 순서대로(ㅘ=ㅗ+ㅏ)'],
    ['닭', 'ㄷㅏㄹㄱ', '겹받침은 치는 순서대로(ㄺ=ㄹ+ㄱ)'],
    ['ㅘㄳ', 'ㅗㅏㄱㅅ', '음절이 아닌 홀겹자모도 푼다'],
    ['AI 2편!', 'AI 2편!'.replace('편', 'ㅍㅕㄴ'), '한글이 아닌 글자는 그대로'],
  ])('%s → %s (%s)', (input, expected) => {
    // given
    // when
    const jamo = toJamo(input);

    // then
    expect(jamo).toBe(expected);
  });
});

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['ㄱㅓㅇㅈㅔ', 'ㄱㅕㅇㅈㅔ', 1],
    ['ㄱㅓㅇㅈㅔ', 'ㄱㅓㅇㅡㅣ', 2],
  ])('"%s" ↔ "%s" = %d', (a, b, expected) => {
    // when
    // then
    expect(editDistance(a, b)).toBe(expected);
    expect(editDistance(b, a)).toBe(expected);
  });
});

describe('jamoEditSimilarity', () => {
  it.each([
    ['겅제', '경제', 0.8],
    ['겅제', '거의', 0.6],
    ['네트웍', '네트워크', 1 - 2 / 9],
    ['커리오', '커리어', 1 - 1 / 6],
    ['운영체재', '운영체제', 0.9],
  ])('%s ↔ %s = %d (대칭)', (a, b, expected) => {
    // when
    // then
    expect(jamoEditSimilarity(a, b)).toBeCloseTo(expected);
    expect(jamoEditSimilarity(b, a)).toBeCloseTo(expected);
  });

  it('같은 말은 1, 빈 문자열끼리도 1이다', () => {
    expect(jamoEditSimilarity('경제', '경제')).toBe(1);
    expect(jamoEditSimilarity('', '')).toBe(1);
  });
});
