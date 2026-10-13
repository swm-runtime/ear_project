import { createPublicKey } from 'node:crypto';

import { HttpStatus, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { PROVIDER_REQUEST_TIMEOUT_MS } from '../auth.constant';

/** 제공자가 내려주는 공개키 하나. `kty`·`n`·`e`가 RSA 공개키를 이룬다 */
interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  n?: string;
  e?: string;
}

interface JwksResponse {
  keys?: Jwk[];
}

/**
 * 모르는 `kid` 때문에 다시 받아오는 최소 간격. TTL 안에서는 이 간격이 지나야 한 번 더 받는다 —
 * 아무 `kid`나 단 토큰을 보내는 것만으로 요청마다 제공자 호출(최대 5초 대기)을 일으킬 수 없게 한다
 * (2026-10-13 보안 점검). 제공자가 키를 교체한 직후에도 늦어야 이 간격만큼이다.
 */
export const JWKS_UNKNOWN_KID_REFETCH_INTERVAL_MS = 60 * 1000;

/**
 * JWKS 공개키 조회·캐시 (`auth-api.md` 4.1 — `google`·`apple`은 토큰 자체로 검증이 끝난다).
 *
 * **제공자마다 URL만 다르고 절차는 같아** 여기로 모은다. 영구 캐시하면 제공자가 키를
 * 교체한 직후 전원이 로그인하지 못하고, 매 요청마다 받아오면 로그인 지연이 제공자 응답에
 * 묶인다 — TTL을 두되 **모르는 `kid`가 오면 TTL과 무관하게 한 번 더 받아온다**(교체 즉시 대응).
 *
 * 예외는 두 갈래로만 나간다. 네트워크·응답 이상은 여기서 `AUTH_PROVIDER_UNAVAILABLE`로
 * 던지고, **"키를 못 찾았다"는 `null`로 돌려준다** — 그것을 토큰 문제로 볼지는 호출자가 정한다.
 */
export class JwksKeyStore {
  private readonly logger: Logger;

  /**
   * kid → PEM 공개키.
   *
   * `KeyObject`가 아니라 PEM 문자열로 담는다 — 검증 라이브러리가 받는 형식이 문자열이라,
   * 매 요청마다 `export()`를 다시 부르지 않기 위해서다.
   */
  private keys = new Map<string, string>();
  private expiresAt = 0;
  private fetchedAt = 0;
  /** 진행 중인 조회 — 동시에 온 요청은 같은 조회를 기다린다 */
  private inflight: Promise<void> | null = null;

  constructor(
    name: string,
    private readonly url: string,
    private readonly cacheTtlMs: number,
  ) {
    this.logger = new Logger(`JwksKeyStore:${name}`);
  }

  /**
   * 서명 검증 **전**이므로 헤더만 읽는다. 여기서 얻은 값은 키를 고르는 데만 쓴다 —
   * 검증에 쓰지 않으므로 위조된 헤더로 할 수 있는 일은 "없는 키를 가리키는 것"뿐이다.
   */
  static readKeyId(token: string): string | null {
    const [encodedHeader] = token.split('.');

    if (!encodedHeader) {
      return null;
    }

    try {
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { kid?: string };

      return header.kid ?? null;
    } catch {
      return null;
    }
  }

  /** 해당 `kid`의 PEM 공개키. 제공자가 그런 키를 갖고 있지 않으면 `null` */
  async resolve(kid: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.keys.get(kid);
    const fresh = now < this.expiresAt;

    if (cached && fresh) {
      return cached;
    }

    // 캐시가 살아 있는데 모르는 kid — 최근에 받았으면 다시 받지 않는다(키 교체가 아니라 엉뚱한 kid일 가능성이 크다)
    if (fresh && now - this.fetchedAt < JWKS_UNKNOWN_KID_REFETCH_INTERVAL_MS) {
      return null;
    }

    await this.refreshOnce();

    return this.keys.get(kid) ?? null;
  }

  private async refreshOnce(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }

    return this.inflight;
  }

  private async refresh(): Promise<void> {
    let response: Response;

    try {
      response = await fetch(this.url, {
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        'jwks request failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw this.unavailable();
    }

    if (!response.ok) {
      this.logger.error('jwks responded with error', undefined, {
        status: response.status,
      });
      throw this.unavailable();
    }

    let payload: JwksResponse;

    try {
      payload = (await response.json()) as JwksResponse;
    } catch {
      throw this.unavailable();
    }

    const keys = new Map<string, string>();

    for (const jwk of payload.keys ?? []) {
      if (!jwk.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
        continue;
      }

      try {
        const pem = createPublicKey({
          key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
          format: 'jwk',
        })
          .export({ type: 'spki', format: 'pem' })
          .toString();

        keys.set(jwk.kid, pem);
      } catch {
        this.logger.warn('jwk could not be parsed', { kid: jwk.kid });
      }
    }

    if (keys.size === 0) {
      this.logger.error('jwks contained no usable key');
      throw this.unavailable();
    }

    // 새 목록으로 통째로 갈아끼운다 — 폐기된 키가 캐시에 남지 않게 한다
    this.keys = keys;
    this.fetchedAt = Date.now();
    this.expiresAt = this.fetchedAt + this.cacheTtlMs;
  }

  private unavailable(): BusinessException {
    return new BusinessException({
      status: HttpStatus.BAD_GATEWAY,
      errorCode: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
      message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      retryable: true,
      logLevel: 'error',
    });
  }
}
