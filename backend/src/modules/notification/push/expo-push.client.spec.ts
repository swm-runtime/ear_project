import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { ExpoPushClient } from './expo-push.client';

const MESSAGE = {
  to: 'ExponentPushToken[aaaa]',
  title: '오늘의 콘텐츠 3편이 도착했어요',
  body: '연봉 협상의 기술',
  data: { type: 'drip_arrival' },
};

function buildConfig(
  accessToken?: string,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn().mockReturnValue(accessToken),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ExpoPushClient', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('접수 결과를 메시지 순서대로 돌려주고 오류 사유를 꺼낸다', async () => {
    // given
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          { status: 'ok', id: 'ticket-1' },
          {
            status: 'error',
            message: 'not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      }),
    );
    const client = new ExpoPushClient(buildConfig());

    // when
    const tickets = await client.send([MESSAGE, MESSAGE]);

    // then
    expect(tickets).toEqual([
      { status: 'ok', id: 'ticket-1' },
      {
        status: 'error',
        error: 'DeviceNotRegistered',
        message: 'not registered',
      },
    ]);
  });

  it('보안 발송 토큰이 있으면 Authorization 헤더에 싣는다', async () => {
    // given
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [{ status: 'ok', id: 'ticket-1' }] }),
    );
    const client = new ExpoPushClient(buildConfig('expo-secret'));

    // when
    await client.send([MESSAGE]);

    // then
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer expo-secret',
    );
    expect(JSON.parse(init.body as string)).toEqual([
      { ...MESSAGE, sound: 'default', priority: 'high' },
    ]);
  });

  it('재시도 대상이 아닌 실패 응답이면 던진다', async () => {
    // given
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    const client = new ExpoPushClient(buildConfig());

    // when
    const act = client.send([MESSAGE]);

    // then
    await expect(act).rejects.toThrow('401');
  });

  it('접수 결과 수가 메시지 수와 다르면 던진다', async () => {
    // given
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));
    const client = new ExpoPushClient(buildConfig());

    // when
    const act = client.send([MESSAGE]);

    // then
    await expect(act).rejects.toThrow('mismatch');
  });

  it('receipt 를 id 별로 돌려준다', async () => {
    // given
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: {
          'ticket-1': { status: 'ok' },
          'ticket-2': {
            status: 'error',
            message: 'gone',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    );
    const client = new ExpoPushClient(buildConfig());

    // when
    const receipts = await client.getReceipts(['ticket-1', 'ticket-2']);

    // then
    expect(receipts.get('ticket-1')).toEqual({ status: 'ok' });
    expect(receipts.get('ticket-2')).toEqual({
      status: 'error',
      error: 'DeviceNotRegistered',
      message: 'gone',
    });
  });

  it('보낼 것이 없으면 요청하지 않는다', async () => {
    // given
    const client = new ExpoPushClient(buildConfig());

    // when
    await client.send([]);
    await client.getReceipts([]);

    // then
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429 는 기다렸다가 다시 보낸다', async () => {
    // given
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ status: 'ok', id: 'ticket-1' }] }),
      );
    const client = new ExpoPushClient(buildConfig());

    try {
      // when
      const sending = client.send([MESSAGE]);
      await jest.advanceTimersByTimeAsync(1_000);
      const tickets = await sending;

      // then
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(tickets).toEqual([{ status: 'ok', id: 'ticket-1' }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('5xx 가 계속되면 두 번 다시 보낸 뒤 던진다', async () => {
    // given
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(502, {})));
    const client = new ExpoPushClient(buildConfig());

    try {
      // when
      const sending = client.send([MESSAGE]);
      const assertion = expect(sending).rejects.toThrow('502');
      await jest.advanceTimersByTimeAsync(4_000);

      // then
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('400 은 다시 보내지 않는다 — 요청 자체가 잘못됐다', async () => {
    // given
    fetchMock.mockResolvedValue(jsonResponse(400, {}));
    const client = new ExpoPushClient(buildConfig());

    // when
    const act = client.send([MESSAGE]);

    // then
    await expect(act).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4xx 본문의 오류 코드를 사유로 싣는다 — 자격 증명·형식 문제는 사람이 봐야 한다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: '...' }],
      }),
    );
    const client = new ExpoPushClient(buildConfig());

    await expect(client.send([MESSAGE])).rejects.toThrow(
      'expo push request failed: 400 (PUSH_TOO_MANY_EXPERIENCE_IDS)',
    );
  });

  it('연결 전 네트워크 오류(ECONNREFUSED)는 기다렸다가 다시 보낸다 — 요청이 나가지 않았으니 중복이 없다', async () => {
    jest.useFakeTimers();
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    });
    fetchMock
      .mockRejectedValueOnce(refused)
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ status: 'ok', id: 'ticket-1' }] }),
      );

    try {
      const client = new ExpoPushClient(buildConfig());
      const pending = client.send([MESSAGE]);
      await jest.advanceTimersByTimeAsync(1_000);
      const tickets = await pending;

      expect(tickets).toEqual([{ status: 'ok', id: 'ticket-1' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('타임아웃은 다시 보내지 않는다 — Expo가 이미 접수했을 수 있다', async () => {
    fetchMock.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    const client = new ExpoPushClient(buildConfig());

    await expect(client.send([MESSAGE])).rejects.toThrow(
      'expo push request failed: TimeoutError',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('보낸 뒤 끊긴 오류(ECONNRESET)도 다시 보내지 않는다', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('read ECONNRESET'), {
          code: 'ECONNRESET',
        }),
      }),
    );

    const client = new ExpoPushClient(buildConfig());

    await expect(client.send([MESSAGE])).rejects.toThrow(
      'expo push request failed: ECONNRESET',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
