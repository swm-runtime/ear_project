import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { UserService } from '@/modules/user/services/user.service';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import { SubscriptionTransition } from '../billing.types';
import { BillingEventAlertService } from './billing-event-alert.service';
import { SyncOutcome } from './billing-sync.service';

const NOW = new Date('2026-10-18T05:03:00Z');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function build(
  options: {
    enabled?: boolean;
    getById?: () => Promise<unknown>;
  } = {},
) {
  const slack = {
    enabled: options.enabled ?? true,
    notify: jest.fn(),
  } as unknown as jest.Mocked<SlackAlertService>;
  const getById = jest.fn(
    options.getById ?? (() => Promise.resolve({ market: UserMarket.KR })),
  );
  const users = { getById } as unknown as UserService;

  return {
    service: new BillingEventAlertService(slack, users),
    slack,
    getById,
  };
}

function applied(overrides: Partial<SubscriptionTransition> = {}): SyncOutcome {
  return {
    kind: 'applied',
    transition: {
      kind: 'started',
      isResubscribe: false,
      userId: 'user-a',
      store: SubscriptionStore.APP_STORE,
      environment: SubscriptionEnvironment.SANDBOX,
      tier: UserTier.PRO,
      detail: null,
      ...overrides,
    },
  };
}

describe('BillingEventAlertService — 결제 알림 발송(backend-monitoring.md 3-7)', () => {
  it('전이가 있으면 시장을 찾아 한 줄 보낸다 — 묶음 창 없이 건마다', async () => {
    const { service, slack } = build();

    service.report(applied(), ['started'], NOW);
    service.report(applied(), ['started'], NOW);
    await flush();

    expect(slack.notify).toHaveBeenCalledTimes(2);
    expect(slack.notify).toHaveBeenCalledWith(
      'billing-started',
      ':tada: 신규 구독 · App Store · Sandbox(시험 결제) · pro · 시장 KR · 10. 18. 14:03',
    );
  });

  it.each([
    ['전이 없는 반영', { kind: 'applied' }, ['started']],
    ['변경 없음', { kind: 'unchanged' }, ['started']],
    [
      '그 경로가 올리지 않는 전이',
      applied({ kind: 'cancel_scheduled' }),
      ['started'],
    ],
    [
      '갱신 거래로 되살아난 구독(결제 실패 복구)',
      applied({
        detail: {
          isTrial: false,
          isRenewal: true,
          storefront: null,
          price: null,
        },
      }),
      ['started'],
    ],
  ] as const)('%s 는 보내지 않는다', async (_label, outcome, kinds) => {
    const { service, slack } = build();

    service.report(outcome, kinds, NOW);
    await flush();

    expect(slack.notify).not.toHaveBeenCalled();
  });

  it('웹훅이 없으면 시장 조회도 하지 않는다', async () => {
    const { service, getById } = build({ enabled: false });

    service.report(applied(), ['started'], NOW);
    await flush();

    expect(getById).not.toHaveBeenCalled();
  });

  it('시장 조회가 실패해도 던지지 않고 시장 칸만 빼고 보낸다', async () => {
    const { service, slack } = build({
      getById: () => Promise.reject(new Error('db down')),
    });

    expect(() => service.report(applied(), ['started'], NOW)).not.toThrow();
    await flush();

    expect(slack.notify).toHaveBeenCalledWith(
      'billing-started',
      ':tada: 신규 구독 · App Store · Sandbox(시험 결제) · pro · 10. 18. 14:03',
    );
  });
});
