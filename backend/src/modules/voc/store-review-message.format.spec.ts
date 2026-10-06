import {
  formatReviewDigest,
  formatReviewNotice,
  truncateBody,
} from './store-review-message.format';
import { REVIEW_BODY_MAX_LENGTH } from './voc.constant';
import { ReviewStore } from './voc.enum';
import { StoreReviewItem } from './voc.types';

const APP_STORE_REVIEW: StoreReviewItem = {
  store: ReviewStore.APP_STORE,
  reviewId: 'a1',
  rating: 4,
  title: '출근길 친구',
  body: '매일 아침 듣습니다.\n두 번째 줄',
  // KST 10/06 09:00
  lastModifiedAt: new Date('2026-10-06T00:00:00Z'),
  appVersion: null,
  territoryOrLanguage: 'KOR',
};

const PLAY_REVIEW: StoreReviewItem = {
  store: ReviewStore.PLAY_STORE,
  reviewId: 'gp:1',
  rating: 2,
  title: null,
  body: '재생이 끊겨요',
  // KST 10/05 23:30 — UTC 날짜(10/05 14:30)와 같지만 경계를 넘는 경우를 아래에서 따로 본다
  lastModifiedAt: new Date('2026-10-05T14:30:00Z'),
  appVersion: '1.2.0',
  territoryOrLanguage: 'ko',
};

describe('formatReviewNotice', () => {
  it('첫 줄에 별점·스토어·국가·날짜를 적고 제목과 본문을 인용한다', () => {
    // when
    const text = formatReviewNotice({
      review: APP_STORE_REVIEW,
      previousRating: null,
    });

    // then
    expect(text).toBe(
      ':star: 4/5 · App Store · KOR · 10/06\n> 출근길 친구\n> 매일 아침 듣습니다.\n> 두 번째 줄',
    );
  });

  it('앱 버전이 있으면 v 접두사로 적고, 제목이 없으면 본문만 인용한다', () => {
    // when
    const text = formatReviewNotice({
      review: PLAY_REVIEW,
      previousRating: null,
    });

    // then
    expect(text).toBe(
      ':star: 2/5 · Google Play · v1.2.0 · ko · 10/05\n> 재생이 끊겨요',
    );
  });

  it('날짜는 KST 기준이다 — UTC 날짜와 다른 경우', () => {
    // given: UTC 10/05 20:00 = KST 10/06 05:00
    const review = {
      ...PLAY_REVIEW,
      lastModifiedAt: new Date('2026-10-05T20:00:00Z'),
    };

    // when
    const text = formatReviewNotice({ review, previousRating: null });

    // then
    expect(text.split('\n')[0]).toContain('10/06');
  });

  it('수정된 리뷰는 (수정됨)을 붙이고 별점이 바뀌었으면 변화를 적는다', () => {
    expect(
      formatReviewNotice({ review: PLAY_REVIEW, previousRating: 2 }).split(
        '\n',
      )[0],
    ).toMatch(/ \(수정됨\)$/);
    expect(
      formatReviewNotice({ review: PLAY_REVIEW, previousRating: 5 }).split(
        '\n',
      )[0],
    ).toMatch(/ \(수정됨 5→2\)$/);
  });

  it('본문이 비어 있으면 인용 줄이 없다', () => {
    // when
    const text = formatReviewNotice({
      review: { ...PLAY_REVIEW, body: '' },
      previousRating: null,
    });

    // then
    expect(text.split('\n')).toHaveLength(1);
  });

  it('본문은 500자에서 잘라 말줄임표를 붙인다', () => {
    // given
    const longBody = '가'.repeat(REVIEW_BODY_MAX_LENGTH + 50);

    // when
    const text = formatReviewNotice({
      review: { ...PLAY_REVIEW, body: longBody },
      previousRating: null,
    });

    // then
    const quoted = text.split('\n')[1];
    expect(quoted).toBe(`> ${'가'.repeat(REVIEW_BODY_MAX_LENGTH)}…`);
  });
});

describe('truncateBody', () => {
  it('상한 이하면 그대로 둔다', () => {
    expect(truncateBody('짧은 글', 10)).toBe('짧은 글');
    expect(truncateBody('가'.repeat(10), 10)).toBe('가'.repeat(10));
  });

  it('서로게이트 쌍(이모지)을 반으로 자르지 않는다', () => {
    expect(truncateBody('😀😀😀', 2)).toBe('😀😀…');
  });
});

describe('formatReviewDigest', () => {
  it('여러 건을 건수 머리말과 함께 한 메시지로 묶는다', () => {
    // when
    const text = formatReviewDigest([
      { review: APP_STORE_REVIEW, previousRating: null },
      { review: PLAY_REVIEW, previousRating: 3 },
    ]);

    // then
    expect(text.startsWith(':speech_balloon: 스토어 리뷰 2건\n\n')).toBe(true);
    expect(text).toContain(':star: 4/5 · App Store');
    expect(text).toContain(':star: 2/5 · Google Play');
    expect(text).toContain('(수정됨 3→2)');
  });
});
