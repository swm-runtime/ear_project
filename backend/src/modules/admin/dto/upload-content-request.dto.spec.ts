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
    market: 'kr',
    language: 'ko',
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

describe('시장·언어 필수 — global-api.md 4.9 2단계 (KAN-190)', () => {
  const errorsOf = async (payload: Record<string, unknown>) =>
    (
      await validate(plainToInstance(UploadContentRequestDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((error) => error.property);

  it('market·language 를 함께 보내면 통과한다', async () => {
    expect(await errorsOf(buildUploadPayload('출처'))).toEqual([]);
  });

  it('둘 중 하나라도 빠지면 거부한다 — 기본값으로 kr·ko 를 채우지 않는다', async () => {
    const withoutMarket = buildUploadPayload('출처');
    delete withoutMarket.market;
    const withoutLanguage = buildUploadPayload('출처');
    delete withoutLanguage.language;

    expect(await errorsOf(withoutMarket)).toEqual(['market']);
    expect(await errorsOf(withoutLanguage)).toEqual(['language']);
  });
});

describe('intro_version — experiments-api.md 4.3-4 (KAN-298 범위 추가, 지표 전용)', () => {
  async function introVersionErrors(
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    const errors = await validate(
      plainToInstance(UploadContentRequestDto, payload),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    return errors
      .filter((error) => error.property === 'intro_version')
      .flatMap((error) => Object.keys(error.constraints ?? {}));
  }

  it.each(['hook-v2', 'v1', 'a', 'hook_v2.1', 'a'.repeat(32)])(
    '형식에 맞는 값(%s)은 통과한다',
    async (value) => {
      // when
      const errors = await introVersionErrors({
        ...buildUploadPayload('참고한 자료: A'),
        intro_version: value,
      });

      // then
      expect(errors).toEqual([]);
    },
  );

  it('33자는 거부한다', async () => {
    // when
    const errors = await introVersionErrors({
      ...buildUploadPayload('참고한 자료: A'),
      intro_version: 'a'.repeat(33),
    });

    // then
    expect(errors).toContain('maxLength');
  });

  it.each(['Hook-v2', '-hook', '.v2', 'hook v2', 'hook/v2', '훅', ''])(
    '허용하지 않는 문자·시작 문자(%p)는 거부한다',
    async (value) => {
      // when
      const errors = await introVersionErrors({
        ...buildUploadPayload('참고한 자료: A'),
        intro_version: value,
      });

      // then
      expect(errors).toContain('matches');
    },
  );

  it('문자열이 아니면 거부한다', async () => {
    // when
    const errors = await introVersionErrors({
      ...buildUploadPayload('참고한 자료: A'),
      intro_version: 2,
    });

    // then
    expect(errors).toContain('isString');
  });

  it('생략하면 통과하고 값이 없다 — 컨트롤러가 null(기존 도입부)로 넘긴다', async () => {
    // given
    const payload = buildUploadPayload('참고한 자료: A');

    // when
    const errors = await introVersionErrors(payload);
    const dto = plainToInstance(UploadContentRequestDto, payload);

    // then
    expect(errors).toEqual([]);
    expect(dto.intro_version ?? null).toBeNull();
  });

  it('재발행은 intro_version을 받지 않는다 — 기존 값을 그대로 둔다', async () => {
    // when
    const errors = await validate(
      plainToInstance(RepublishContentRequestDto, { intro_version: 'hook-v2' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    // then
    expect(errors.map((error) => error.property)).toContain('intro_version');
  });
});
