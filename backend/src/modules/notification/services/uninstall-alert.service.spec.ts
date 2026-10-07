import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { DevicePlatform } from '@/modules/user/user.enum';

import {
  UninstallAlertService,
  countLastTokenLosses,
  formatUninstallText,
} from './uninstall-alert.service';

const NOW = new Date('2026-10-06T08:30:00Z');

describe('countLastTokenLosses — 마지막 활성 토큰이 죽은 사용자만 플랫폼별로', () => {
  it('활성 토큰이 남은 사용자는 세지 않고, 같은 사용자의 토큰 둘은 1로 센다', () => {
    const estimate = countLastTokenLosses(
      [
        { userId: 'u1', platform: DevicePlatform.IOS },
        { userId: 'u1', platform: DevicePlatform.IOS },
        { userId: 'u2', platform: DevicePlatform.IOS },
        { userId: 'u3', platform: DevicePlatform.ANDROID },
      ],
      new Map([['u2', 1]]),
    );

    expect(estimate).toEqual({ ios: 1, android: 1 });
  });

  it('목록에 없는 사용자는 활성 0으로 본다', () => {
    expect(
      countLastTokenLosses(
        [{ userId: 'u9', platform: DevicePlatform.IOS }],
        new Map(),
      ),
    ).toEqual({ ios: 1 });
  });
});

describe('UninstallAlertService.notifyIfLastToken', () => {
  function build(activeCounts: Map<string, number>) {
    const deviceTokenService = {
      countActiveByUserIds: jest.fn().mockResolvedValue(activeCounts),
    } as unknown as jest.Mocked<DeviceTokenService>;
    const slack = {
      notify: jest.fn(),
    } as unknown as jest.Mocked<SlackAlertService>;

    return {
      service: new UninstallAlertService(deviceTokenService, slack),
      slack,
      deviceTokenService,
    };
  }

  it('iOS 마지막 토큰이 죽으면 Slack 한 줄 — 신원 값 없음', async () => {
    const { service, slack } = build(new Map());

    await service.notifyIfLastToken(
      [{ userId: 'u1', platform: DevicePlatform.IOS }],
      NOW,
    );

    expect(slack.notify).toHaveBeenCalledWith(
      'uninstall-estimate',
      ':iphone: 앱 삭제 추정 1건 · iOS · 푸시 토큰 무효화(활성 기기 0) · 10. 06. 17:30',
    );
    expect(slack.notify.mock.calls[0][1]).not.toContain('u1');
  });

  it('Android 는 Slack 에 올리지 않는다 — GA4 app_remove 가 이미 센다', async () => {
    const { service, slack } = build(new Map());

    const estimate = await service.notifyIfLastToken(
      [{ userId: 'u3', platform: DevicePlatform.ANDROID }],
      NOW,
    );

    expect(estimate).toEqual({ android: 1 });
    expect(slack.notify).not.toHaveBeenCalled();
  });

  it('다른 기기가 살아 있으면 알리지 않는다 — 기기 하나만 지운 것이다', async () => {
    const { service, slack } = build(new Map([['u1', 1]]));

    await service.notifyIfLastToken(
      [{ userId: 'u1', platform: DevicePlatform.IOS }],
      NOW,
    );

    expect(slack.notify).not.toHaveBeenCalled();
  });

  it('빈 입력은 조회조차 하지 않고, 조회 실패는 던지지 않는다', async () => {
    const { service, deviceTokenService } = build(new Map());
    await service.notifyIfLastToken([], NOW);
    expect(deviceTokenService.countActiveByUserIds).not.toHaveBeenCalled();

    deviceTokenService.countActiveByUserIds.mockRejectedValue(new Error('db'));
    await expect(
      service.notifyIfLastToken(
        [{ userId: 'u1', platform: DevicePlatform.IOS }],
        NOW,
      ),
    ).resolves.toEqual({});
  });
});

describe('formatUninstallText', () => {
  it('KST 시각을 붙인다', () => {
    expect(formatUninstallText(2, DevicePlatform.IOS, NOW)).toContain(
      '앱 삭제 추정 2건 · iOS',
    );
  });
});
