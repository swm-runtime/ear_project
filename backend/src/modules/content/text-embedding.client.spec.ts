import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from './content.constant';
import { TextEmbeddingClient } from './text-embedding.client';

function buildClient(
  env: Partial<Record<'AI_SERVER_URL' | 'AI_SERVER_INTERNAL_TOKEN', string>>,
): TextEmbeddingClient {
  const config = {
    get: (key: string) => env[key as keyof typeof env],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new TextEmbeddingClient(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TextEmbeddingClient', () => {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0.01);
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const client = () =>
    buildClient({
      AI_SERVER_URL: 'http://ai.internal/',
      AI_SERVER_INTERNAL_TOKEN: 'secret',
    });

  it('AI 서버 /embeddings에 내부 토큰을 실어 부르고 벡터를 돌려준다', async () => {
    // given
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ model: EMBEDDING_MODEL_ID, dim: EMBEDDING_DIM, vector }),
    );

    // when
    const result = await client().embed('금리가 이야기하는 것');

    // then
    expect(result).toEqual(vector);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ai.internal/embeddings');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe(
      'secret',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      text: '금리가 이야기하는 것',
    });
  });

  it('설정이 하나라도 비면 꺼져 있고 부르지 않는다', async () => {
    // given
    const disabled = buildClient({ AI_SERVER_URL: 'http://ai.internal' });

    // when
    const result = await disabled.embed('제목');

    // then
    expect(disabled.enabled).toBe(false);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['2xx 아님', () => Promise.resolve(new Response('', { status: 500 }))],
    ['네트워크 오류', () => Promise.reject(new TypeError('fetch failed'))],
    [
      '다른 모델(dev-stub)',
      () =>
        Promise.resolve(
          jsonResponse({ model: 'dev-stub', dim: EMBEDDING_DIM, vector }),
        ),
    ],
    [
      '차원 불일치',
      () =>
        Promise.resolve(
          jsonResponse({
            model: EMBEDDING_MODEL_ID,
            dim: 3,
            vector: [1, 0, 0],
          }),
        ),
    ],
    [
      'JSON 아님',
      () => Promise.resolve(new Response('not json', { status: 200 })),
    ],
  ])('%s이면 null — 던지지 않는다', async (_label, respond) => {
    // given
    fetchMock.mockImplementationOnce(respond);

    // when
    const result = await client().embed('제목');

    // then
    expect(result).toBeNull();
  });
});
