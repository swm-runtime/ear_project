import { describe, expect, it } from '@jest/globals';

import { isSearchableQuery, toSearchQuery, toTagQuery } from './explore.search-query';

describe('explore.search-query', () => {
  describe('isSearchableQuery', () => {
    it('트림 후 2자 이상인 한국어 질의는 실행할 수 있다', () => {
      expect(isSearchableQuery('커리어')).toBe(true);
      expect(isSearchableQuery(' 이직 ')).toBe(true);
    });

    it('트림 후 1자면 실행하지 않는다(explore.md 4.5-2 — 2자 이상)', () => {
      expect(isSearchableQuery('이')).toBe(false);
      expect(isSearchableQuery(' a ')).toBe(false);
    });

    it('빈 입력·공백만인 입력은 실행하지 않는다', () => {
      expect(isSearchableQuery('')).toBe(false);
      expect(isSearchableQuery('   ')).toBe(false);
    });

    it('특수문자·이모지만인 입력은 실행하지 않는다(explore.md 7장)', () => {
      expect(isSearchableQuery('!!')).toBe(false);
      expect(isSearchableQuery('?!@#')).toBe(false);
      expect(isSearchableQuery('😀😀')).toBe(false);
    });

    it('문자·숫자가 하나라도 섞이면 실행한다', () => {
      expect(isSearchableQuery('a!')).toBe(true);
      expect(isSearchableQuery('12')).toBe(true);
      expect(isSearchableQuery('면접!')).toBe(true);
    });

    it('NFD 분해형 입력도 문자로 판정한다 — 정규화는 서버 몫이라 여기서 거르면 안 된다(explore.md 4.5-5)', () => {
      // '커리'를 NFD로 분해한 형태 — 조합 문자도 \p{L}에 걸린다
      expect(isSearchableQuery('커리'.normalize('NFD'))).toBe(true);
    });
  });

  describe('isSearchableQuery — 태그 전용 검색(`#`, KAN-219)', () => {
    it('`#`만 입력하면 실행하지 않는다', () => {
      expect(isSearchableQuery('#')).toBe(false);
      expect(isSearchableQuery(' # ')).toBe(false);
    });

    it('`#`을 뗀 값이 2자 미만이면 실행하지 않는다(서버도 VALIDATION_FAILED)', () => {
      expect(isSearchableQuery('#a')).toBe(false);
      expect(isSearchableQuery('#이')).toBe(false);
      expect(isSearchableQuery('#  a ')).toBe(false);
    });

    it('`#`을 뗀 값이 2자 이상이면 실행한다', () => {
      expect(isSearchableQuery('#뱅크런')).toBe(true);
      expect(isSearchableQuery(' #금리 ')).toBe(true);
      expect(isSearchableQuery('# 금리')).toBe(true);
    });

    it('`#`을 뗀 값이 특수문자만이면 실행하지 않는다', () => {
      expect(isSearchableQuery('#!!')).toBe(false);
    });

    it('`##태그`는 앞의 `#` 하나만 떼어 재므로 실행한다(매칭 여부는 서버 결과다)', () => {
      expect(isSearchableQuery('##뱅크런')).toBe(true);
      expect(isSearchableQuery('##a')).toBe(true);
    });
  });

  describe('toSearchQuery', () => {
    it('앞뒤 공백만 지우고 그 외에는 가공하지 않는다(explore-api.md 4.5)', () => {
      expect(toSearchQuery('  커리어 성장  ')).toBe('커리어 성장');
      expect(toSearchQuery('Career')).toBe('Career'); // 소문자 통일은 서버가 한다
    });

    it('태그 질의의 `#`을 떼지 않고 그대로 보낸다 — 태그 모드 판정은 서버다', () => {
      expect(toSearchQuery(' #뱅크런 ')).toBe('#뱅크런');
    });
  });

  describe('toTagQuery', () => {
    it('태그 값 앞에 `#`을 붙인다', () => {
      expect(toTagQuery('뱅크런')).toBe('#뱅크런');
    });
  });
});
