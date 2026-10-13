import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UnsaveContentQueryRequestDto } from './unsave-content-query-request.dto';

async function validateSeq(value: unknown) {
  const dto = plainToInstance(UnsaveContentQueryRequestDto, {
    client_seq: value,
  });
  return { dto, errors: await validate(dto) };
}

describe('UnsaveContentQueryRequestDto', () => {
  it('쿼리 문자열 숫자를 정수로 받는다', async () => {
    const { dto, errors } = await validateSeq('7');

    expect(errors).toHaveLength(0);
    expect(dto.client_seq).toBe(7);
  });

  it.each(['', ' '])(
    '빈 값(%j)은 0으로 바뀌어 통과하지 않고 거절된다 — 필수값이다',
    async (value) => {
      const { errors } = await validateSeq(value);

      expect(errors).toHaveLength(1);
    },
  );

  it('없으면 거절한다', async () => {
    const { errors } = await validateSeq(undefined);

    expect(errors).toHaveLength(1);
  });
});
