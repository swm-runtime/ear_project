import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { TITLE_EMBEDDING_TIMEOUT_MS } from './content.constant';
import { parseEmbeddingResponse } from './embedding-response';

/**
 * 콘텐츠 쪽 텍스트 임베딩(제목 임베딩 생성 — `ContentTitleEmbeddingService`). AI 서버 `POST /embeddings`(`X-Internal-Token`)를
 * 부른다 — 질의 임베딩(`QueryEmbeddingClient`, explore 모듈)과 같은 엔드포인트·같은 응답 검증(`parseEmbeddingResponse`)이다.
 *
 * 질의 클라이언트와 나눈 이유: 그쪽은 검색 요청 안에서 400ms 예산·LRU 캐시·실패 냉각을 갖는다. 이쪽은 발행 뒤·백필에서
 * 한 편에 한 번 부르는 경로라 캐시가 쓸모없고, 예산은 넉넉해야 하며(`TITLE_EMBEDDING_TIMEOUT_MS`), 냉각이 끼면 백필이 멈춘다.
 * 또 explore 모듈이 content 모듈을 import 하므로 content 쪽이 explore의 클라이언트를 가져다 쓸 수 없다.
 *
 * **던지지 않는다** — 미설정·타임아웃·네트워크·2xx 아님·응답 모양·모델 불일치는 전부 `null`이고 WARN 한 줄에 사유만 남긴다.
 * 토큰은 이 요청의 헤더에만 싣는다.
 */
@Injectable()
export class TextEmbeddingClient {
  private readonly logger = new Logger(TextEmbeddingClient.name);
  private readonly endpoint: string | null;
  private readonly token: string;

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

  /** AI 서버를 부를 수 있게 설정됐는가 — 둘 중 하나라도 비면 꺼져 있다 */
  get enabled(): boolean {
    return this.endpoint !== null;
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.endpoint) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TITLE_EMBEDDING_TIMEOUT_MS,
    );

    try {
      const response = await globalThis.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': this.token,
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return this.unavailable(`http_${response.status}`);
      }

      // 본문 읽기도 같은 예산 안이다. 해석은 따로 한다 — 연결 오류와 본문 오류를 가른다
      const raw = await response.text();
      let body: unknown;

      try {
        body = JSON.parse(raw);
      } catch {
        return this.unavailable('invalid_body');
      }

      const parsed = parseEmbeddingResponse(body);

      return 'vector' in parsed
        ? parsed.vector
        : this.unavailable(parsed.reason);
    } catch {
      return this.unavailable(
        controller.signal.aborted ? 'timeout' : 'network',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private unavailable(reason: string): null {
    this.logger.warn('text embedding unavailable', { reason });
    return null;
  }
}
