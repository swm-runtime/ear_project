import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { InviteCodeService } from '@/modules/subscription/services/invite-code.service';

import { BillingSyncService } from './billing-sync.service';
import { InviteGrantExpiryService } from './invite-grant-expiry.service';

const NOW = new Date('2026-11-08T19:05:00Z');
const MANAGER = {} as EntityManager;

function redemption(id: string, userId: string): InviteCodeRedemption {
  return { id, userId, tierReleasedAt: null } as InviteCodeRedemption;
}

describe('InviteGrantExpiryService — 끝난 지급의 티어 되돌리기(domain.md 8.6)', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('끝난 지급마다 한 트랜잭션에서 티어를 다시 맞추고 표시를 찍으며, 한 계정이 실패해도 나머지는 진행한다', async () => {
    const rows = [
      redemption('r-1', 'user-a'),
      redemption('r-2', 'user-b'),
      redemption('r-3', 'user-c'),
    ];
    const inviteCodeService = {
      findEndedUnreleased: jest.fn().mockResolvedValue(rows),
      markReleased: jest.fn(
        (row: InviteCodeRedemption, now: Date): Promise<void> => {
          row.tierReleasedAt = now;
          return Promise.resolve();
        },
      ),
    };
    const billingSyncService = {
      syncUserTier: jest.fn((userId: string) =>
        userId === 'user-b'
          ? Promise.reject(new Error('lock timeout'))
          : Promise.resolve(),
      ),
    };
    const dataSource = {
      transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
        work(MANAGER),
    };
    const service = new InviteGrantExpiryService(
      dataSource as unknown as DataSource,
      inviteCodeService as unknown as InviteCodeService,
      billingSyncService as unknown as BillingSyncService,
    );

    const released = await service.releaseEnded(NOW);

    expect(released).toBe(2);
    expect(billingSyncService.syncUserTier).toHaveBeenCalledWith(
      'user-a',
      MANAGER,
      NOW,
    );
    expect(rows.map((row) => row.tierReleasedAt)).toEqual([NOW, null, NOW]);
  });
});
