import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { EMBEDDING_MODEL_ID } from '@/modules/content/content.constant';
import { parseEmbeddingResponse } from '@/modules/content/embedding-response';

import {
  QUERY_EMBEDDING_CACHE_MAX_ENTRIES,
  QUERY_EMBEDDING_CACHE_TTL_MS,
  QUERY_EMBEDDING_FAILURE_COOLDOWN_MS,
  QUERY_EMBEDDING_TIMEOUT_MS,
} from './explore.constant';

/** 결손 사유 — WARN 로그에 이것만 남긴다(질의 본문·토큰은 남기지 않는다) */
type UnavailableReason =
  | 'timeout'
  | 'network'
  | `http_${number}`
  | 'invalid_body'
  | 'model_mismatch'
  | 'dim_mismatch';

interface CacheEntry {
  vector: number[];
  expiresAt: number;
}

/**
 * 탐색 검색의 질의 임베딩(KAN-238 — `explore.md` 4.5-5 의미 엔진). AI 서버 `POST /embeddings`(`X-Internal-Token`)를 부른다 —
 * **백엔드가 요청 시점에 AI 서버를 부르는 첫 경로다**(architecture.md 1장 — 모델 추론은 AI 서버 안).
 *
 * **검색은 AI 서버 때문에 실패하지 않는다.** 미설정(`AI_SERVER_URL`·`AI_SERVER_INTERNAL_TOKEN` 중 하나라도 비었다)·타임아웃
 * 예산(`QUERY_EMBEDDING_TIMEOUT_MS`) 초과·네트워크 오류·2xx 아님·응답 모양이 틀림·모델이 `EMBEDDING_MODEL_ID`가 아님(`dev-stub`
 * 거부)·차원이 `EMBEDDING_DIM`이 아님은 전부 `null`(결손)이고, 호출부는 키워드 엔진만으로 응답한다(`engines: ["keyword"]`).
 * 결손은 WARN 한 줄에 **사유만** 남긴다 — 질의 본문은 검색 로그 표(`search_query_logs`)가 이미 갖고, 토큰은 어디에도 찍지 않는다.
 *
 * **인-프로세스 LRU 캐시**(키 = 모델 + 정규화 질의, TTL ≥ 커서 수명, 크기 상한) — 디바운스 타이핑의 같은 질의·커서 다음 페이지·
 * 교정 재검색이 AI 서버를 다시 부르지 않는다. Redis는 없다. **클러스터 모드(워커 여러 개)면 워커마다 캐시가 따로다** — 같은
 * 질의가 다른 워커로 가면 한 번 더 부를 뿐이고(비용 몇 원 단위), 공유 캐시를 들일 만한 규모가 아니다.
 *
 * 결손이 연달아 지연으로 오는 상황(보안 그룹이 패킷을 버려 매번 타임아웃까지 기다린다)을 막으려고, 타임아웃·네트워크 오류 뒤
 * `QUERY_EMBEDDING_FAILURE_COOLDOWN_MS` 동안은 부르지 않고 바로 결손으로 답한다 — 검색 한 번마다 예산만큼 늦어지지 않게.
 *
 * 토큰은 `AI_SERVER_URL`로 가는 이 요청의 헤더에만 싣는다.
 */
@Injectable()
export class QueryEmbeddingClient {
  private readonly logger = new Logger(QueryEmbeddingClient.name);
  private readonly endpoint: string | null;
  private readonly token: string;
  /** `Map`의 삽입 순서를 LRU 순서로 쓴다 — 읽을 때 지웠다 다시 넣어 맨 뒤(최근)로 옮긴다 */
  private readonly cache = new Map<string, CacheEntry>();
  private cooldownUntil = 0;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const baseUrl =
      configService.get('AI_SERVER_URL', { infer: true })?.trim() ?? '';
    this.token =
      configService.get('AI_SERVER_INTERNAL_TOKEN', { infer: true })?.trim() ??
      '';
    this.endpoint =
      baseUrl !== '' && this.token !== ''
        ? `${baseUrl.replace(/\/+$/, '')}/embeddings`
        : null;
  }

  /** 의미 엔진을 쓸 수 있게 설정됐는가 — 둘 중 하나라도 비면 꺼져 있다 */
  get enabled(): boolean {
    return this.endpoint !== null;
  }

  /**
   * 정규화된 질의의 임베딩. 결손이면 `null` — 던지지 않는다.
   * `now`는 캐시 만료 판정용(테스트가 시계를 넘길 수 있게 받는다)
   */
  async embed(
    normalizedQuery: string,
    now: number = Date.now(),
  ): Promise<number[] | null> {
    if (!this.endpoint) {
      return null;
    }

    const key = `${EMBEDDING_MODEL_ID}\u0000${normalizedQuery}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.delete(key);

      if (cached.expiresAt > now) {
        this.cache.set(key, cached);
        return cached.vector;
      }
    }

    if (now < this.cooldownUntil) {
      return null;
    }

    const vector = await this.request(this.endpoint, normalizedQuery, now);

    if (vector) {
      this.remember(key, vector, now);
    }

    return vector;
  }

  private async request(
    endpoint: string,
    text: string,
    now: number,
  ): Promise<number[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      QUERY_EMBEDDING_TIMEOUT_MS,
    );

    try {
      const response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': this.token,
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // 본문은 읽지 않는다 — 연결을 붙잡지 않게 버린다
        void response.body?.cancel().catch(() => undefined);
        return this.unavailable(`http_${response.status}`);
      }

      // 본문 읽기도 같은 예산 안이다(타이머가 아직 돈다). 해석은 따로 한다 — 연결 오류와 본문 오류를 가른다
      const raw = await response.text();
      let body: unknown;

      try {
        body = JSON.parse(raw);
      } catch {
        return this.unavailable('invalid_body');
      }

      return this.validate(body);
    } catch {
      // 연결이 늦거나 끊긴 것 — 잠시 부르지 않는다(보안 그룹이 패킷을 버리면 매 검색이 예산만큼 늦어진다)
      this.cooldownUntil = now + QUERY_EMBEDDING_FAILURE_COOLDOWN_MS;

      return this.unavailable(
        controller.signal.aborted ? 'timeout' : 'network',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** 응답 `{ model, dim, vector }`(ai-server `EmbeddingResponse`) — 모델·차원이 저장 벡터와 같아야 비교할 수 있다(domain.md 5.6) */
  private validate(body: unknown): number[] | null {
    const parsed = parseEmbeddingResponse(body);

    return 'vector' in parsed ? parsed.vector : this.unavailable(parsed.reason);
  }

  private remember(key: string, vector: number[], now: number): void {
    this.cache.set(key, {
      vector,
      expiresAt: now + QUERY_EMBEDDING_CACHE_TTL_MS,
    });

    while (this.cache.size > QUERY_EMBEDDING_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.cache.delete(oldest);
    }
  }

  private unavailable(reason: UnavailableReason): null {
    this.logger.warn('query embedding unavailable', { reason });
    return null;
  }
}
