import { DeviceTokenService } from '@/modules/user/services/device-token.service';

import { PushClient } from '../push/push.client';
import { PushReceiptService } from './push-receipt.service';

const SENT_AT = new Date('2026-09-16T20:00:00.000Z');
const minutesAfter = (minutes: number): Date =>
  new Date(SENT_AT.getTime() + minutes * 60 * 1000);

describe('PushReceiptService', () => {
  let service: PushReceiptService;
  let pushClient: jest.Mocked<PushClient>;
  let deviceTokenService: jest.Mocked<DeviceTokenService>;

  beforeEach(() => {
    pushClient = {
      send: jest.fn(),
      getReceipts: jest.fn().mockResolvedValue(new Map()),
    };

    deviceTokenService = {
      invalidateDeliveredTokens: jest
        .fn()
        .mockImplementation((targets: unknown[]) =>
          Promise.resolve(targets.length),
        ),
    } as unknown as jest.Mocked<DeviceTokenService>;

    service = new PushReceiptService(pushClient, deviceTokenService);
    service.track(
      [
        { ticketId: 'ticket-a', deviceTokenId: 'device-a', token: 'token-a' },
        { ticketId: 'ticket-b', deviceTokenId: 'device-b', token: 'token-b' },
      ],
      SENT_AT,
    );
  });

  it('발송 후 15분이 지나지 않았으면 조회하지 않는다', async () => {
    // when
    await service.checkDue(minutesAfter(10));

    // then
    expect(pushClient.getReceipts).not.toHaveBeenCalled();
  });

  it('receipt 가 DeviceNotRegistered 인 기기만 무효화하고 답이 온 ticket 은 목록에서 뺀다', async () => {
    // given
    pushClient.getReceipts.mockResolvedValue(
      new Map([
        [
          'ticket-a',
          { status: 'error', error: 'DeviceNotRegistered', message: 'gone' },
        ],
        ['ticket-b', { status: 'ok' }],
      ]),
    );

    // when
    const invalidated = await service.checkDue(minutesAfter(15));

    // then
    expect(pushClient.getReceipts).toHaveBeenCalledWith([
      'ticket-a',
      'ticket-b',
    ]);
    // 보낸 토큰을 함께 넘긴다 — 그사이 새 토큰으로 재등록된 행은 끄지 않는다
    expect(deviceTokenService.invalidateDeliveredTokens).toHaveBeenCalledWith(
      [{ id: 'device-a', token: 'token-a' }],
      minutesAfter(15),
    );
    expect(invalidated).toBe(1);
    expect(service.pendingCount()).toBe(0);
  });

  it('아직 준비되지 않은 receipt 는 남겨 두었다가 다음 주기에 다시 묻는다', async () => {
    // given — ticket-b 만 답이 왔다
    pushClient.getReceipts.mockResolvedValue(
      new Map([['ticket-b', { status: 'ok' }]]),
    );

    // when
    await service.checkDue(minutesAfter(20));

    // then
    expect(service.pendingCount()).toBe(1);
  });

  it('24시간이 지난 ticket 은 묻지 않고 버린다 — Expo 가 receipt 를 지웠다', async () => {
    // when
    await service.checkDue(minutesAfter(24 * 60 + 1));

    // then
    expect(pushClient.getReceipts).not.toHaveBeenCalled();
    expect(service.pendingCount()).toBe(0);
  });
});
