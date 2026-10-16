import {
  escapeLikePattern,
  hasSearchableCharacter,
  normalizeSearchText,
  parseSearchQuery,
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
