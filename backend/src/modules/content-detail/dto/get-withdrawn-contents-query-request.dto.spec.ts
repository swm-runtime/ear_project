import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetWithdrawnContentsQueryRequestDto } from './get-withdrawn-contents-query-request.dto';

async function validateSince(since: string): Promise<boolean> {
  const errors = await validate(
    plainToInstance(GetWithdrawnContentsQueryRequestDto, { since }),
  );
  return errors.length === 0;
}

describe('GetWithdrawnContentsQueryRequestDto', () => {
  it('클라이언트가 보내는 toISOString 형태는 통과한다', async () => {
    // given / when / then
    expect(await validateSince('2026-09-15T01:23:45.678Z')).toBe(true);
    expect(await validateSince('2026-09-15T10:23:45+09:00')).toBe(true);
  });

  it('ISO 8601이지만 Date가 읽지 못하는 표기는 400으로 거절한다 — SQL까지 가면 500이 된다', async () => {
    // given — 주 표기·기본형은 @IsISO8601을 통과하지만 new Date()가 Invalid Date다
    // when / then
    expect(await validateSince('2026-W01')).toBe(false);
    expect(await validateSince('20260915')).toBe(false);
    expect(await validateSince('2026-09-15T10:23')).toBe(false);
  });
});
