import { generateKeyPairSync, JsonWebKey } from 'node:crypto';

import { HttpStatus, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { JwksKeyStore } from './jwks-key-store';

const JWKS_URL = 'https://provider.test/jwks';
const TTL_MS = 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-10-10T06:00:00Z');

/** 실제 RSA 공개키를 JWK 로 — 파싱 경로를 진짜로 태운다 */
function rsaJwk(kid: string): JsonWebKey & { kid: string } {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' };
}

const KEY_A = rsaJwk('kid-a');
const KEY_B = rsaJwk('kid-b');

/** 제공자 JWKS 엔드포인트의 대역 — 응답을 차례대로 돌려주고 호출 수를 센다 */
class FakeJwksEndpoint {
  calls = 0;
  private readonly responses: Array<() => Promise<Response>> = [];

  respondKeys(keys: unknown[]): this {
    this.responses.push(() =>
      Promise.resolve(
        new Response(JSON.stringify({ keys }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    return this;
  }
  respondStatus(status: number): this {
    this.responses.push(() =>
      Promise.resolve(new Response('error', { status })),
    );
    return this;
  }
  respondBody(body: string): this {
    this.responses.push(() =>
      Promise.resolve(new Response(body, { status: 200 })),
    );
    return this;
  }
  failNetwork(): this {
    this.responses.push(() => Promise.reject(new TypeError('fetch failed')));
    return this;
  }

  handle = (): Promise<Response> => {
    this.calls += 1;
    const next = this.responses.shift();
    if (!next) {
      throw new Error('unexpected jwks request');
    }
    return next();
  };
}

function setup() {
  const endpoint = new FakeJwksEndpoint();
  let nowMs = NOW_MS;
  jest.spyOn(global, 'fetch').mockImplementation(endpoint.handle);
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  // 실패 경로가 남기는 오류 로그는 이 테스트의 관심이 아니다
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const store = new JwksKeyStore('test', JWKS_URL, TTL_MS);
  return {
    endpoint,
    store,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

function encodeHeader(header: unknown): string {
  return Buffer.from(JSON.stringify(header)).toString('base64url');
}

async function expectUnavailable(work: Promise<unknown>): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error('expected AUTH_PROVIDER_UNAVAILABLE but resolved');
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).errorCode).toBe(
    ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
  );
  expect((error as BusinessException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('JwksKeyStore', () => {
  describe('readKeyId', () => {
    it('토큰 헤더의 kid 를 서명 검증 없이 읽는다', () => {
      // given
      const token = `${encodeHeader({ alg: 'RS256', kid: 'kid-a' })}.payload.sig`;

      // when
      const kid = JwksKeyStore.readKeyId(token);

      // then
      expect(kid).toBe('kid-a');
    });

    it('헤더에 kid 가 없으면 null 을 돌려준다', () => {
      // given
      const token = `${encodeHeader({ alg: 'RS256' })}.payload.sig`;

      // when
      const kid = JwksKeyStore.readKeyId(token);

      // then
      expect(kid).toBeNull();
    });

    it('헤더가 JSON 이 아니면 예외 없이 null 을 돌려준다', () => {
      // given
      const token = `${Buffer.from('not-json').toString('base64url')}.payload.sig`;

      // when
      const kid = JwksKeyStore.readKeyId(token);

      // then
      expect(kid).toBeNull();
    });

    it('빈 문자열이면 null 을 돌려준다', () => {
      // when
      const kid = JwksKeyStore.readKeyId('');

      // then
      expect(kid).toBeNull();
    });
  });

  describe('resolve', () => {
    it('제공자가 가진 kid 면 PEM 공개키를 돌려준다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondKeys([KEY_A]);

      // when
      const pem = await store.resolve('kid-a');

      // then
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('TTL 안에서 다시 물으면 제공자에 다시 요청하지 않는다', async () => {
      // given
      const { endpoint, store, advance } = setup();
      endpoint.respondKeys([KEY_A]);
      const first = await store.resolve('kid-a');
      advance(TTL_MS - 1);

      // when
      const second = await store.resolve('kid-a');

      // then
      expect(second).toBe(first);
      expect(endpoint.calls).toBe(1);
    });

    it('TTL 이 지나면 아는 kid 라도 목록을 다시 받아온다', async () => {
      // given
      const { endpoint, store, advance } = setup();
      endpoint.respondKeys([KEY_A]).respondKeys([KEY_A]);
      await store.resolve('kid-a');
      advance(TTL_MS);

      // when
      await store.resolve('kid-a');

      // then
      expect(endpoint.calls).toBe(2);
    });

    it('모르는 kid 가 오면 TTL 과 무관하게 즉시 다시 받아와 교체된 키를 찾는다', async () => {
      // given — 캐시는 아직 유효하지만 제공자가 키를 kid-b 로 교체했다
      const { endpoint, store } = setup();
      endpoint.respondKeys([KEY_A]).respondKeys([KEY_B]);
      await store.resolve('kid-a');

      // when
      const pem = await store.resolve('kid-b');

      // then
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(endpoint.calls).toBe(2);
    });

    it('다시 받아온 목록에도 없는 kid 면 null 을 돌려준다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondKeys([KEY_A]);

      // when
      const pem = await store.resolve('kid-unknown');

      // then
      expect(pem).toBeNull();
    });

    it('교체로 빠진 키는 새 목록을 받은 뒤 캐시에 남지 않는다', async () => {
      // given — kid-a 가 캐시된 뒤 제공자가 kid-b 만 남겼다
      const { endpoint, store } = setup();
      endpoint.respondKeys([KEY_A]).respondKeys([KEY_B]).respondKeys([KEY_B]);
      await store.resolve('kid-a');
      await store.resolve('kid-b');

      // when
      const pem = await store.resolve('kid-a');

      // then
      expect(pem).toBeNull();
    });

    it('RSA 가 아니거나 n·e·kid 가 빠진 키는 건너뛰고 쓸 수 있는 키만 담는다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondKeys([
        { kid: 'kid-ec', kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
        { kid: 'kid-no-n', kty: 'RSA', e: 'AQAB' },
        { ...KEY_B, kid: undefined },
        KEY_A,
      ]);

      // when
      const pem = await store.resolve('kid-a');

      // then
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('쓸 수 있는 키가 하나도 없으면 502 AUTH_PROVIDER_UNAVAILABLE 을 던진다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondKeys([{ kid: 'kid-ec', kty: 'EC' }]);

      // when / then
      await expectUnavailable(store.resolve('kid-ec'));
    });

    it('네트워크 오류면 502 AUTH_PROVIDER_UNAVAILABLE 을 던진다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.failNetwork();

      // when / then
      await expectUnavailable(store.resolve('kid-a'));
    });

    it('제공자가 오류 상태로 응답하면 502 AUTH_PROVIDER_UNAVAILABLE 을 던진다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondStatus(503);

      // when / then
      await expectUnavailable(store.resolve('kid-a'));
    });

    it('응답 본문이 JSON 이 아니면 502 AUTH_PROVIDER_UNAVAILABLE 을 던진다', async () => {
      // given
      const { endpoint, store } = setup();
      endpoint.respondBody('<html>maintenance</html>');

      // when / then
      await expectUnavailable(store.resolve('kid-a'));
    });

    it('새로 받아오기에 실패하면 기존 캐시를 지우지 않아 다음 요청이 다시 시도된다', async () => {
      // given — kid-a 캐시 뒤 TTL 만료, 첫 재요청은 실패
      const { endpoint, store, advance } = setup();
      endpoint.respondKeys([KEY_A]).respondStatus(500).respondKeys([KEY_A]);
      await store.resolve('kid-a');
      advance(TTL_MS);
      await expectUnavailable(store.resolve('kid-a'));

      // when
      const pem = await store.resolve('kid-a');

      // then
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(endpoint.calls).toBe(3);
    });
  });
});
