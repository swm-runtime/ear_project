import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import {
  AppRemoveAlertService,
  formatAppRemoveText,
  selectNewMinutes,
} from './app-remove-alert.service';
import { Ga4RealtimeClient, RealtimeEventMinute } from './ga4-realtime.client';

/** 2026-10-06 16:30:30 KST */
const NOW = new Date('2026-10-06T07:30:30Z');
const NOW_MINUTE = Math.floor(NOW.getTime() / 60_000);

const minute = (
  minutesAgo: number,
  count = 1,
  platform = 'Android',
): RealtimeEventMinute => ({ minutesAgo, platform, count });

describe('selectNewMinutes — 같은 분을 두 번 세지 않는다', () => {
  it('첫 주기는 보이는 창을 전부 집계하되, 막 도착한 분(3분 안)은 다음 주기로 미룬다', () => {
    const batch = selectNewMinutes(
      [minute(20, 2), minute(5), minute(1)],
      NOW,
      null,
    );

    expect(batch.total).toBe(3);
    expect(batch.countsByPlatform).toEqual({ Android: 3 });
    expect(batch.fromMinute).toBe(NOW_MINUTE - 20);
    expect(batch.toMinute).toBe(NOW_MINUTE - 5);
    // 상한(지금 - 3분)까지 본 것으로 기록한다
    expect(batch.lastProcessedMinute).toBe(NOW_MINUTE - 3);
  });

  it('이미 집계한 분 이하는 건너뛰고 새 분만 더한다', () => {
    const first = selectNewMinutes([minute(10)], NOW, null);
    const later = new Date(NOW.getTime() + 5 * 60_000);
    const second = selectNewMinutes(
      // 5분 뒤 다시 보면 같은 이벤트는 minutesAgo 15, 그 사이 새 이벤트는 4
      [minute(15), minute(4, 3)],
      later,
      first.lastProcessedMinute,
    );

    expect(second.total).toBe(3);
    expect(second.fromMinute).toBe(Math.floor(later.getTime() / 60_000) - 4);
  });

  it('새 분이 없어도 상한까지 본 것으로 기록해 빈 분을 다시 뒤지지 않는다', () => {
    const batch = selectNewMinutes([], NOW, NOW_MINUTE - 10);

    expect(batch.total).toBe(0);
    expect(batch.fromMinute).toBeNull();
    expect(batch.lastProcessedMinute).toBe(NOW_MINUTE - 3);
  });

  it('플랫폼별로 나눠 센다', () => {
    const batch = selectNewMinutes(
      [minute(6, 2, 'Android'), minute(6, 1, 'iOS')],
      NOW,
      null,
    );

    expect(batch.countsByPlatform).toEqual({ Android: 2, iOS: 1 });
  });
});

describe('formatAppRemoveText — 신원 값 없이 한 줄', () => {
  it('플랫폼 하나면 이름만, 둘 이상이면 건수를 붙인다. 시각은 KST 분 범위', () => {
    const single = selectNewMinutes([minute(10, 2)], NOW, null);
    expect(formatAppRemoveText(single, NOW)).toBe(
      ':wastebasket: 앱 삭제 2건 · Android · 16:20~16:21 KST (GA4 app_remove)',
    );

    const both = selectNewMinutes(
      [minute(10, 2, 'Android'), minute(5, 1, 'iOS')],
      NOW,
      null,
    );
    expect(formatAppRemoveText(both, NOW)).toBe(
      ':wastebasket: 앱 삭제 3건 · Android 2 · iOS 1 · 16:20~16:26 KST (GA4 app_remove)',
    );
  });
});

describe('AppRemoveAlertService.poll', () => {
  function build(minutes: RealtimeEventMinute[][]) {
    const client = {
      configured: true,
      fetchEventMinutes: jest.fn(),
    } as unknown as jest.Mocked<Ga4RealtimeClient>;
    for (const m of minutes) client.fetchEventMinutes.mockResolvedValueOnce(m);
    const slack = {
      enabled: true,
      notify: jest.fn(),
    } as unknown as jest.Mocked<SlackAlertService>;

    return { service: new AppRemoveAlertService(client, slack), client, slack };
  }

  it('새 건수가 있으면 Slack 에 한 번 알리고, 다음 주기에 같은 분은 다시 알리지 않는다', async () => {
    const { service, slack } = build([[minute(10)], [minute(15)]]);

    await service.poll(NOW);
    await service.poll(new Date(NOW.getTime() + 5 * 60_000));

    expect(slack.notify).toHaveBeenCalledTimes(1);
    expect(slack.notify).toHaveBeenCalledWith(
      'app-remove',
      expect.stringContaining('앱 삭제 1건'),
    );
  });

  it('건수가 없으면 아무것도 보내지 않는다', async () => {
    const { service, slack } = build([[]]);

    const batch = await service.poll(NOW);

    expect(batch.total).toBe(0);
    expect(slack.notify).not.toHaveBeenCalled();
  });
});
