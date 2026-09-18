import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import {
  EXPO_PUSH_RETRY_DELAYS_MS,
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  EXPO_PUSH_TIMEOUT_MS,
} from '../notification.constant';
import { PushMessage, PushReceipt, PushTicket } from '../notification.types';
import { PushClient } from './push.client';

interface ExpoErrorBody {
  status: 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoSendResponse {
  data?: ({ status: 'ok'; id: string } | ExpoErrorBody)[];
}

interface ExpoReceiptsResponse {
  data?: Record<string, { status: 'ok' } | ExpoErrorBody>;
}

/**
 * Expo Push API(`notification.md` 4.3 — 결정 2026-09-17). iOS는 APNs, Android는 FCM으로 Expo가 전달한다 —
 * 두 자격 증명은 서버가 아니라 EAS에 있다. 서버 비밀값은 보안 발송을 켰을 때의 access token 하나다.
 *
 * SDK(`expo-server-sdk`)를 쓰지 않는다 — 필요한 것은 POST 두 개이고, 청크·재시도 정책은 호출부가 정한다.
 */
export class ExpoPushClient extends PushClient {
  private readonly accessToken: string | undefined;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();
    this.accessToken = configService.get('EXPO_ACCESS_TOKEN', { infer: true });
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) {
      return [];
    }

    const body = await this.post<ExpoSendResponse>(
      EXPO_PUSH_SEND_URL,
      messages.map((message) => ({
        ...message,
        sound: 'default',
        priority: 'high',
      })),
    );
    const data = body.data ?? [];

    if (data.length !== messages.length) {
      // 순서로 짝을 맞추므로 길이가 다르면 어느 기기의 결과인지 알 수 없다
      throw new Error(
        `expo push ticket count mismatch: ${data.length}/${messages.length}`,
      );
    }

    return data.map((ticket) =>
      ticket.status === 'ok'
        ? { status: 'ok', id: ticket.id }
        : toError(ticket),
    );
  }

  async getReceipts(ids: string[]): Promise<Map<string, PushReceipt>> {
    if (ids.length === 0) {
      return new Map();
    }

    const body = await this.post<ExpoReceiptsResponse>(EXPO_PUSH_RECEIPTS_URL, {
      ids,
    });

    return new Map(
      Object.entries(body.data ?? {}).map(([id, receipt]) => [
        id,
        receipt.status === 'ok' ? { status: 'ok' } : toError(receipt),
      ]),
    );
  }

  private async post<T>(url: string, payload: unknown): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    };

    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      // 429(한도)·5xx(일시 장애)는 거절이 확정된 응답이라 다시 보내도 중복이 생기지 않는다
      const retryable = response.status === 429 || response.status >= 500;

      if (!retryable || attempt >= EXPO_PUSH_RETRY_DELAYS_MS.length) {
        throw new Error(`expo push request failed: ${response.status}`);
      }

      await new Promise((resolve) =>
        setTimeout(resolve, EXPO_PUSH_RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}

function toError(body: ExpoErrorBody): {
  status: 'error';
  error: string | null;
  message: string;
} {
  return {
    status: 'error',
    error: body.details?.error ?? null,
    message: body.message ?? 'unknown expo push error',
  };
}
