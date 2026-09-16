import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ContentOrigin } from '@/modules/content/content.enum';

import { RepublishContentRequestDto } from './republish-content-request.dto';
import { UploadContentRequestDto } from './upload-content-request.dto';

const TOPIC_ID = '22222222-2222-4222-8222-222222222222';

function buildUploadPayload(sourceName: string): Record<string, unknown> {
  return {
    title: '제목',
    description: '설명',
    origin: ContentOrigin.AI_GENERATED,
    source_name: sourceName,
    topic_ids: [TOPIC_ID],
    sources: [{ title: '참고 자료' }],
    review_confirmed: true,
  };
}

async function sourceNameErrors(
  type: new () => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors
    .filter((error) => error.property === 'source_name')
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('source_name 상한 — admin-api.md 4.6 · domain.md 5.1 (500자, KAN-52)', () => {
  it('업로드: 500자는 통과한다 — 소스 발행처를 전부 적은 고지 문구가 들어가야 한다', async () => {
    // given
    const prefix = '참고한 자료: ';
    const payload = buildUploadPayload(
      `${prefix}${'A'.repeat(500 - prefix.length)}`,
    );

    // when
    const errors = await sourceNameErrors(UploadContentRequestDto, payload);

    // then
    expect(payload.source_name).toHaveLength(500);
    expect(errors).toEqual([]);
  });

  it('업로드: 501자는 거부한다', async () => {
    // when
    const errors = await sourceNameErrors(
      UploadContentRequestDto,
      buildUploadPayload('A'.repeat(501)),
    );

    // then
    expect(errors).toEqual([
      'source_name must be shorter than or equal to 500 characters',
    ]);
  });

  it('재발행: 500자는 통과하고 501자는 거부한다', async () => {
    // when
    const ok = await sourceNameErrors(RepublishContentRequestDto, {
      source_name: 'B'.repeat(500),
    });
    const tooLong = await sourceNameErrors(RepublishContentRequestDto, {
      source_name: 'B'.repeat(501),
    });

    // then
    expect(ok).toEqual([]);
    expect(tooLong).toHaveLength(1);
  });
});
