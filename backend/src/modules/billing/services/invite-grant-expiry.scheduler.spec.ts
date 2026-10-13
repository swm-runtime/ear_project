import { InviteGrantExpiryScheduler } from './invite-grant-expiry.scheduler';
import { InviteGrantExpiryService } from './invite-grant-expiry.service';

describe('InviteGrantExpiryScheduler', () => {
  let service: jest.Mocked<InviteGrantExpiryService>;
  let scheduler: InviteGrantExpiryScheduler;

  beforeEach(() => {
    service = {
      releaseEnded: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<InviteGrantExpiryService>;
    scheduler = new InviteGrantExpiryScheduler(service);
  });

  it('끝난 지급을 되돌린다', async () => {
    service.releaseEnded.mockResolvedValue(3);

    await scheduler.run();

    expect(service.releaseEnded).toHaveBeenCalledWith(expect.any(Date));
  });

  it('실패해도 던지지 않는다 — 던지면 크론이 멈추고 10분 뒤 재시도가 없다', async () => {
    service.releaseEnded.mockRejectedValue(new Error('db down'));

    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});
