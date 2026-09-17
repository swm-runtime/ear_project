import { Injectable, Logger } from '@nestjs/common';

import { PushMessage, PushReceipt, PushTicket } from '../notification.types';
import { PushClient } from './push.client';

/**
 * `PUSH_DELIVERY=log` — 실제로 보내지 않는다. 대상 판정과 `notification_logs` 기록은 그대로 돌아
 * 개발계에서도 "누구에게 무엇이 갔을지"를 확인할 수 있다. 토큰·문구는 로그에 남기지 않는다.
 */
@Injectable()
export class LogPushClient extends PushClient {
  private readonly logger = new Logger(LogPushClient.name);

  send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.logger.log('push delivery disabled, messages not sent', {
      message_count: messages.length,
    });

    return Promise.resolve(
      messages.map(() => ({ status: 'ok' as const, id: null })),
    );
  }

  getReceipts(): Promise<Map<string, PushReceipt>> {
    return Promise.resolve(new Map<string, PushReceipt>());
  }
}
