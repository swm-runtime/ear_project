import { pickSearchCorrection } from './content.search-correction';
import { SearchCorrectionCandidate } from './content.types';

/** 개발계 카탈로그에서 문제가 된 말들을 닮게 만든 어휘 — 우선순위 0 = 태그·주제명, 1 = 제목 토큰 */
const VOCABULARY: SearchCorrectionCandidate[] = [
  { term: '경제', priority: 1, frequency: 1 },
  { term: '거의', priority: 0, frequency: 3 },
  { term: '경영', priority: 0, frequency: 2 },
  { term: '운영체제', priority: 0, frequency: 1 },
  { term: '운영', priority: 0, frequency: 4 },
  { term: '네트워크', priority: 0, frequency: 1 },
  { term: '네트', priority: 1, frequency: 1 },
  { term: '커리어', priority: 0, frequency: 5 },
  { term: '커리어 전환', priority: 0, frequency: 1 },
  { term: '커피', priority: 1, frequency: 1 },
  { term: '면접', priority: 0, frequency: 1 },
  { term: '면허', priority: 0, frequency: 1 },
  { term: '없는', priority: 1, frequency: 2 },
];

describe('pickSearchCorrection', () => {
  it.each([
    [
      '겅제',
      '경제',
      '태그 "거의"(자모 둘 차이)보다 제목 토큰 "경제"(하나 차이)가 점수로 이긴다',
    ],
    ['운영체재', '운영체제', '짧은 "운영"은 길이 가드에 걸린다'],
    ['네트웍', '네트워크', '글자 수 ±1 안'],
    ['커리오', '커리어', '자모 하나 차이'],
    ['면졉', '면접', '"면허"(자모 둘 차이)가 아니다'],
  ])('"%s" → "%s" (%s)', (query, expected) => {
    // when
    const term = pickSearchCorrection(query, VOCABULARY);

    // then
    expect(term).toBe(expected);
  });

  it.each([
    [
      '커리어 없는말',
      '여러 단어 질의 — 통째로 닮은 어휘가 없다(커리어 전환 0.588)',
    ],
    ['zqxj쀍뷁', '아무 말도 아닌 문자열'],
    ['겅졔', '자모 둘 차이(경제 0.6) — 하한 0.7 아래'],
  ])('"%s"는 고치지 않는다 (%s)', (query) => {
    // when
    const term = pickSearchCorrection(query, VOCABULARY);

    // then
    expect(term).toBeNull();
  });

  it('원문과 같은 말은 교정어가 아니다', () => {
    // when
    const term = pickSearchCorrection('커리어', VOCABULARY);

    // then
    expect(term).not.toBe('커리어');
  });

  it('길이 가드 — 글자 수 차이가 2 이상인 후보는 점수가 높아도 고르지 않는다', () => {
    // given — SQL 가드를 거치지 않은 후보가 들어와도 이 함수만으로 규칙이 닫힌다
    const candidates = [{ term: '커리어어어', priority: 0, frequency: 1 }];

    // when
    const term = pickSearchCorrection('커리어', candidates);

    // then
    expect(term).toBeNull();
  });

  describe('동점 해소', () => {
    // "가나도"에 대해 "가나다"·"가나더"·"가나두"는 모두 자모 하나 차이(0.833)
    it('태그·주제명이 제목 토큰보다 앞선다', () => {
      // when
      const term = pickSearchCorrection('가나도', [
        { term: '가나다', priority: 1, frequency: 9 },
        { term: '가나더', priority: 0, frequency: 1 },
      ]);

      // then
      expect(term).toBe('가나더');
    });

    it('같은 우선순위면 더 자주 나온 말이 앞선다', () => {
      // when
      const term = pickSearchCorrection('가나도', [
        { term: '가나다', priority: 1, frequency: 1 },
        { term: '가나더', priority: 1, frequency: 2 },
      ]);

      // then
      expect(term).toBe('가나더');
    });

    it('빈도도 같으면 코드포인트순 앞선 말 — 순서와 무관하게 결정적이다', () => {
      // given
      const candidates = [
        { term: '가나두', priority: 1, frequency: 1 },
        { term: '가나다', priority: 1, frequency: 1 },
      ];

      // when
      const forward = pickSearchCorrection('가나도', candidates);
      const backward = pickSearchCorrection(
        '가나도',
        [...candidates].reverse(),
      );

      // then
      expect(forward).toBe('가나다');
      expect(backward).toBe('가나다');
    });
  });
});
