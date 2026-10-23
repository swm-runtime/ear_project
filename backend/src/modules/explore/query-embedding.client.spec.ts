import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

import { EnvironmentVariables } from '@/config/env.validation';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from '@/modules/content/content.constant';

import {
  QUERY_EMBEDDING_CACHE_MAX_ENTRIES,
  QUERY_EMBEDDING_CACHE_TTL_MS,
  QUERY_EMBEDDING_FAILURE_COOLDOWN_MS,
  QUERY_EMBEDDING_TIMEOUT_STREAK,
} from './explore.constant';
import { QueryEmbeddingClient } from './query-embedding.client';

type Reply = (req: IncomingMessage, res: ServerResponse) => void;

const TOKEN = 'unit-internal-token';
const VECTOR = Array.from({ length: EMBEDDING_DIM }, (_, i) =>
  i === 0 ? 1 : 0,
);

function configWith(
  values: Partial<Record<'AI_SERVER_URL' | 'AI_SERVER_INTERNAL_TOKEN', string>>,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key as keyof typeof values],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function ok(body: unknown): Reply {
  return (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
}

function status(code: number): Reply {
  return (_req, res) => {
    res.writeHead(code).end();
  };
}

const notJson: Reply = (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('not json');
};

/**
 * 질의 임베딩 클라이언트(KAN-238) — 로컬 HTTP 스텁으로 실제 `fetch`·`AbortController`를 밟는다.
 * 결손(타임아웃·오류·모델·차원)은 전부 `null`이고 던지지 않으며, 캐시는 같은 질의를 다시 부르지 않는다.
 */
describe('QueryEmbeddingClient', () => {
  let server: Server;
  let baseUrl: string;
  let reply: Reply;
  const calls: { body: string; token: string | undefined; url?: string }[] = [];
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        calls.push({
          body: Buffer.concat(chunks).toString('utf8'),
          token: req.headers['x-internal-token'] as string | undefined,
          url: req.url,
        });
        reply(req, res);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    calls.length = 0;
    reply = ok({
      model: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
      vector: VECTOR,
    });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const client = () =>
    new QueryEmbeddingClient(
      configWith({
        AI_SERVER_URL: `${baseUrl}/`,
        AI_SERVER_INTERNAL_TOKEN: TOKEN,
      }),
    );

  it.each([
    ['주소가 없으면', { AI_SERVER_INTERNAL_TOKEN: TOKEN }],
    ['토큰이 없으면', { AI_SERVER_URL: 'http://127.0.0.1:1' }],
    ['둘 다 공백이면', { AI_SERVER_URL: ' ', AI_SERVER_INTERNAL_TOKEN: ' ' }],
  ])('%s 꺼져 있고 부르지 않고 null이다', async (_label, values) => {
    // given
    const disabled = new QueryEmbeddingClient(configWith(values));

    // when
    const vector = await disabled.embed('이직');

    // then
    expect(disabled.enabled).toBe(false);
    expect(vector).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('POST /embeddings에 X-Internal-Token과 정규화 질의를 보내고 벡터를 돌려준다', async () => {
    // when
    const vector = await client().embed('이직');

    // then
    expect(vector).toEqual(VECTOR);
    expect(calls).toEqual([
      {
        body: JSON.stringify({ text: '이직' }),
        token: TOKEN,
        url: '/embeddings',
      },
    ]);
  });

  it('같은 질의는 캐시에서 준다 — 디바운스 연타·커서 다음 페이지가 다시 부르지 않는다', async () => {
    // given
    const embedder = client();

    // when
    await embedder.embed('이직');
    await embedder.embed('이직');
    await embedder.embed('이직');

    // then
    expect(calls).toHaveLength(1);
  });

  it('TTL이 지나면 다시 부른다', async () => {
    // given
    const embedder = client();
    const now = Date.now();
    await embedder.embed('이직', now);

    // when
    await embedder.embed('이직', now + QUERY_EMBEDDING_CACHE_TTL_MS + 1);

    // then
    expect(calls).toHaveLength(2);
  });

  it('크기 상한을 넘기면 가장 오래 안 쓴 질의부터 버린다(LRU)', async () => {
    // given — 상한만큼 채우고 첫 질의를 한 번 더 읽어 최근으로 올린다
    const embedder = client();
    for (let i = 0; i < QUERY_EMBEDDING_CACHE_MAX_ENTRIES; i += 1) {
      await embedder.embed(`q${i}`);
    }
    await embedder.embed('q0');
    calls.length = 0;

    // when — 하나 더 넣으면 q1이 밀려난다
    await embedder.embed('new');
    await embedder.embed('q0');
    await embedder.embed('q1');

    // then
    expect(
      calls.map((call) => JSON.parse(call.body) as { text: string }),
    ).toEqual([{ text: 'new' }, { text: 'q1' }]);
  }, 30_000);

  it.each([
    ['2xx가 아니면', status(503), 'http_503'],
    [
      '모델이 다르면(dev-stub)',
      ok({ model: 'dev-stub', dim: EMBEDDING_DIM, vector: VECTOR }),
      'model_mismatch',
    ],
    [
      '차원이 다르면',
      ok({ model: EMBEDDING_MODEL_ID, dim: 3, vector: [1, 0, 0] }),
      'dim_mismatch',
    ],
    [
      'dim과 벡터 길이가 어긋나면',
      ok({ model: EMBEDDING_MODEL_ID, dim: EMBEDDING_DIM, vector: [1, 0] }),
      'dim_mismatch',
    ],
    ['본문이 JSON이 아니면', notJson, 'invalid_body'],
  ])(
    '%s 결손(null)이고 사유만 WARN으로 남긴다 — 캐시하지 않는다',
    async (_label, failure, reason) => {
      // given
      reply = failure;
      const embedder = client();

      // when
      const first = await embedder.embed('이직');
      const second = await embedder.embed('이직');

      // then
      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(calls).toHaveLength(2);
      expect(warn).toHaveBeenCalledWith('query embedding unavailable', {
        reason,
      });
      // 질의 본문·토큰은 로그에 없다
      expect(JSON.stringify(warn.mock.calls)).not.toContain('이직');
      expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
    },
  );

  const slowReply = (): Reply => (_req, res) => {
    const timer = setTimeout(() => {
      if (!res.destroyed)
        ok({ model: EMBEDDING_MODEL_ID, dim: EMBEDDING_DIM, vector: VECTOR })(
          _req,
          res,
        );
    }, 2_000);
    res.on('close', () => clearTimeout(timer));
  };

  it('예산(800ms)을 넘기면 끊고 null이다 — 한 번 늦은 것으로는 쉬지 않고 다음 검색은 다시 부른다', async () => {
    // given — 응답을 2초 늦춘다
    reply = slowReply();
    const embedder = client();
    const startedAt = Date.now();

    // when
    const vector = await embedder.embed('이직', startedAt);
    const elapsed = Date.now() - startedAt;
    reply = ok({
      model: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
      vector: VECTOR,
    });
    const next = await embedder.embed('면접', startedAt + 1_000);

    // then
    expect(vector).toBeNull();
    expect(elapsed).toBeLessThan(1_500);
    expect(warn).toHaveBeenCalledWith('query embedding unavailable', {
      reason: 'timeout',
    });
    expect(next).toEqual(VECTOR);
    expect(calls).toHaveLength(2);
  }, 10_000);

  it(`타임아웃이 ${QUERY_EMBEDDING_TIMEOUT_STREAK}번 연달아 나면 쉬는 동안 부르지 않고, 쉬는 시간이 지나면 다시 부른다`, async () => {
    // given
    reply = slowReply();
    const embedder = client();
    const startedAt = Date.now();

    // when — 연달아 늦는다
    for (let i = 0; i < QUERY_EMBEDDING_TIMEOUT_STREAK; i++) {
      await embedder.embed(`질의${i}`, startedAt + i);
    }
    const duringCooldown = await embedder.embed('면접', startedAt + 1_000);

    // then
    expect(duringCooldown).toBeNull();
    expect(calls).toHaveLength(QUERY_EMBEDDING_TIMEOUT_STREAK);

    // when — 쉬는 시간이 지나면 다시 부른다
    reply = ok({
      model: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
      vector: VECTOR,
    });
    const after = await embedder.embed(
      '면접',
      startedAt +
        QUERY_EMBEDDING_TIMEOUT_STREAK +
        QUERY_EMBEDDING_FAILURE_COOLDOWN_MS,
    );

    // then
    expect(after).toEqual(VECTOR);
  }, 15_000);

  it('중간에 한 번 응답이 오면 연속 횟수가 처음부터 다시 센다', async () => {
    // given
    const embedder = client();
    const startedAt = Date.now();

    // when — 늦음 → 정상 → 늦음 × (연속 기준 - 1)
    reply = slowReply();
    await embedder.embed('a', startedAt);
    reply = ok({
      model: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
      vector: VECTOR,
    });
    await embedder.embed('b', startedAt + 1);
    reply = slowReply();
    for (let i = 0; i < QUERY_EMBEDDING_TIMEOUT_STREAK - 1; i++) {
      await embedder.embed(`c${i}`, startedAt + 2 + i);
    }
    reply = ok({
      model: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
      vector: VECTOR,
    });
    const after = await embedder.embed('d', startedAt + 100);

    // then — 쉬지 않았다
    expect(after).toEqual(VECTOR);
  }, 15_000);

  it('연결 오류는 한 번으로 쉰다(서버 다운·보안 그룹)', async () => {
    // given — 아무도 듣지 않는 포트
    const down = new QueryEmbeddingClient(
      configWith({
        AI_SERVER_URL: 'http://127.0.0.1:1',
        AI_SERVER_INTERNAL_TOKEN: TOKEN,
      }),
    );
    const startedAt = Date.now();
    await down.embed('이직', startedAt);
    warn.mockClear();

    // when
    const during = await down.embed('면접', startedAt + 1_000);

    // then — 부르지 않았으니 경고도 없다
    expect(during).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('연결이 거부되면(서버 다운) null이다', async () => {
    // given — 아무도 듣지 않는 포트
    const down = new QueryEmbeddingClient(
      configWith({
        AI_SERVER_URL: 'http://127.0.0.1:1',
        AI_SERVER_INTERNAL_TOKEN: TOKEN,
      }),
    );

    // when
    const vector = await down.embed('이직');

    // then
    expect(vector).toBeNull();
    expect(warn).toHaveBeenCalledWith('query embedding unavailable', {
      reason: 'network',
    });
  });
});
