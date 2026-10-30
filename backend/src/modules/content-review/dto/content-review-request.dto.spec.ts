import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { AdminContentReviewListQueryRequestDto } from './admin-content-review-list-query-request.dto';
import { SaveContentReviewRequestDto } from './save-content-review-request.dto';

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

describe('SaveContentReviewRequestDto', () => {
  it.each([1, 5])('별 %d 개는 통과한다', (stars) => {
    expect(violations(SaveContentReviewRequestDto, { stars })).toEqual([]);
  });

  it.each([0, 6, 3.5, '4', null])('별 %j 는 거절한다', (stars) => {
    expect(
      violations(SaveContentReviewRequestDto, { stars }).length,
    ).toBeGreaterThan(0);
  });

  it('글은 생략 · null · 빈 값 모두 통과한다(글 없음)', () => {
    for (const text of [undefined, null, '', '   ']) {
      expect(
        violations(SaveContentReviewRequestDto, { stars: 3, text }),
      ).toEqual([]);
    }
  });

  it('앞뒤 공백을 뺀 뒤 500자(코드 포인트)까지 통과한다 — 이모지 500개도 500자다', () => {
    expect(
      violations(SaveContentReviewRequestDto, {
        stars: 3,
        text: `   ${'가'.repeat(500)}   `,
      }),
    ).toEqual([]);
    expect(
      violations(SaveContentReviewRequestDto, {
        stars: 3,
        text: '👍'.repeat(500),
      }),
    ).toEqual([]);
  });

  it('뺀 뒤 501자는 거절한다 — 잘라 저장하지 않는다', () => {
    expect(
      violations(SaveContentReviewRequestDto, {
        stars: 3,
        text: '가'.repeat(501),
      }),
    ).toContain('maxCodePoints');
  });

  it('문자열이 아닌 글 · 모르는 필드는 거절한다', () => {
    expect(
      violations(SaveContentReviewRequestDto, { stars: 3, text: 123 }),
    ).toContain('isString');
    expect(
      violations(SaveContentReviewRequestDto, { stars: 3, user_id: 'x' }),
    ).toContain('whitelistValidation');
  });
});

describe('AdminContentReviewListQueryRequestDto', () => {
  it('has_text 는 true · false 문자열만 받는다', () => {
    expect(
      violations(AdminContentReviewListQueryRequestDto, { has_text: 'true' }),
    ).toEqual([]);
    expect(
      violations(AdminContentReviewListQueryRequestDto, { has_text: 'yes' }),
    ).toContain('isBoolean');
  });

  it.each(['0', '101', '1.5'])('limit %s 는 거절한다(1~100)', (limit) => {
    expect(
      violations(AdminContentReviewListQueryRequestDto, { limit }).length,
    ).toBeGreaterThan(0);
  });

  it('모르는 시장 · uuid 아닌 content_id 는 거절한다', () => {
    expect(
      violations(AdminContentReviewListQueryRequestDto, { market: 'jp' }),
    ).toContain('isEnum');
    expect(
      violations(AdminContentReviewListQueryRequestDto, { content_id: 'x' }),
    ).toContain('isUuid');
  });
});
