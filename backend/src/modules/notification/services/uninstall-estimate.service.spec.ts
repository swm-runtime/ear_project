import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { DevicePlatform } from '@/modules/user/user.enum';

import {
  UninstallEstimateService,
  countLastTokenLosses,
} from './uninstall-estimate.service';

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

describe('UninstallEstimateService.recordIfLastToken', () => {
  function build(activeCounts: Map<string, number>) {
    const deviceTokenService = {
      countActiveByUserIds: jest.fn().mockResolvedValue(activeCounts),
    } as unknown as jest.Mocked<DeviceTokenService>;

    return {
      service: new UninstallEstimateService(deviceTokenService),
      deviceTokenService,
    };
  }

  it('마지막 활성 토큰이 죽은 사용자를 플랫폼별로 돌려준다 — 다른 기기가 살아 있으면 세지 않는다', async () => {
    const { service } = build(new Map([['u2', 1]]));

    const estimate = await service.recordIfLastToken([
      { userId: 'u1', platform: DevicePlatform.IOS },
      { userId: 'u2', platform: DevicePlatform.IOS },
      { userId: 'u3', platform: DevicePlatform.ANDROID },
    ]);

    expect(estimate).toEqual({ ios: 1, android: 1 });
  });

  it('빈 입력은 조회조차 하지 않고, 조회 실패는 던지지 않는다', async () => {
    const { service, deviceTokenService } = build(new Map());
    await service.recordIfLastToken([]);
    expect(deviceTokenService.countActiveByUserIds).not.toHaveBeenCalled();

    deviceTokenService.countActiveByUserIds.mockRejectedValue(new Error('db'));
    await expect(
      service.recordIfLastToken([
        { userId: 'u1', platform: DevicePlatform.IOS },
      ]),
    ).resolves.toEqual({});
  });
});
