import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { StartPlayRequestDto } from './start-play-request.dto';

describe('StartPlayRequestDto', () => {
  async function validateEntryPoint(value: unknown) {
    const dto = plainToInstance(StartPlayRequestDto, { entry_point: value });
    return validate(dto);
  }

  it('공유 링크 수신 진입의 share를 허용한다 (신설 2026-08-25 — library-api.md 4.4)', async () => {
    const errors = await validateEntryPoint('share');

    expect(errors).toHaveLength(0);
  });

  it.each(['library', 'explore', 'miniplayer', 'push', 'player'])(
    '기존 진입점 %s를 계속 허용한다',
    async (value) => {
      const errors = await validateEntryPoint(value);

      expect(errors).toHaveLength(0);
    },
  );

  it('enum 밖의 값은 거절한다 — 상세 경유 값(content_detail)은 미결이라 아직 없다', async () => {
    const errors = await validateEntryPoint('content_detail');

    expect(errors).toHaveLength(1);
  });
});
