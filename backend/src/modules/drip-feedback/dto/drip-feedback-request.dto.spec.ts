import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DismissDripFeedbackRequestDto } from './dismiss-drip-feedback-request.dto';
import { RateDripFeedbackRequestDto } from './rate-drip-feedback-request.dto';

const C1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const C2 = 'bbbbbbbb-1111-4111-8111-111111111111';

/** 전역 ValidationPipe 와 같은 옵션으로 검증해 위반한 규칙 이름을 모은다 */
function violations(
  dto: new () => object,
  body: Record<string, unknown>,
): string[] {
  return validateSync(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('RateDripFeedbackRequestDto', () => {
  it('서로 다른 콘텐츠의 별점은 통과한다', () => {
    expect(
      violations(RateDripFeedbackRequestDto, {
        ratings: [
          { content_id: C1, stars: 5 },
          { content_id: C2, stars: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it('같은 콘텐츠가 두 번 들면 거절한다 — 그대로 저장하면 upsert 가 DB 오류(500)로 끝난다', () => {
    expect(
      violations(RateDripFeedbackRequestDto, {
        ratings: [
          { content_id: C1, stars: 5 },
          { content_id: C1, stars: 1 },
        ],
      }),
    ).toContain('arrayUnique');
  });
});

describe('DismissDripFeedbackRequestDto', () => {
  it('서비스 날짜 라벨(YYYY-MM-DD)은 통과한다', () => {
    expect(
      violations(DismissDripFeedbackRequestDto, { placed_date: '2026-09-29' }),
    ).toEqual([]);
  });

  it.each([
    ['2026-13-45', '없는 달'],
    ['2026-02-30', '없는 날'],
  ])(
    '형식은 맞지만 달력에 없는 날짜 %s 는 거절한다 (%s) — date 컬럼 저장에서 500 이 된다',
    (placedDate) => {
      expect(
        violations(DismissDripFeedbackRequestDto, { placed_date: placedDate }),
      ).toContain('isIso8601');
    },
  );

  it('날짜가 아닌 형식(시각 포함)은 거절한다', () => {
    expect(
      violations(DismissDripFeedbackRequestDto, {
        placed_date: '2026-09-29T00:00:00Z',
      }),
    ).toContain('matches');
  });
});
