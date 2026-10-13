import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateSettingsRequestDto } from './update-settings-request.dto';

async function errorsOf(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateSettingsRequestDto, {
    client_seq: 1,
    ...body,
  });
  return (await validate(dto)).map((error) => error.property);
}

describe('UpdateSettingsRequestDto', () => {
  it.each([
    'default_playback_rate',
    'is_auto_expand_enabled',
    'is_drip_notification_enabled',
  ])(
    '%s 에 null 을 보내면 거절한다 — NOT NULL 컬럼이라 저장 단계의 500 이 아니라 400 이어야 한다',
    async (field) => {
      await expect(errorsOf({ [field]: null })).resolves.toContain(field);
    },
  );

  it('보내지 않은 필드는 검증하지 않는다(부분 갱신)', async () => {
    await expect(errorsOf({ is_auto_expand_enabled: false })).resolves.toEqual(
      [],
    );
  });

  it('음질은 null 이 정당한 값이다 — "고른 적 없음"으로 되돌린다', async () => {
    await expect(errorsOf({ preferred_audio_quality: null })).resolves.toEqual(
      [],
    );
  });
});
