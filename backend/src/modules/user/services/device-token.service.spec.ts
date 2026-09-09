import { DeviceToken } from '../entities/device-token.entity';
import { DeviceTokenRepository } from '../repositories/device-token.repository';
import { DevicePlatform } from '../user.enum';
import { RegisterDeviceCommand } from '../user.types';
import { DeviceTokenService } from './device-token.service';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = 'device-1';
const NOW = new Date('2026-09-08T10:00:00Z');

function buildCommand(
  overrides: Partial<RegisterDeviceCommand> = {},
): RegisterDeviceCommand {
  return {
    userId: USER_B,
    deviceId: DEVICE_ID,
    pushToken: 'ExponentPushToken[xxx]',
    platform: DevicePlatform.ANDROID,
    isOsPermissionGranted: true,
    appVersion: '1.0.0',
    ...overrides,
  };
}

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  let repository: jest.Mocked<DeviceTokenRepository>;

  beforeEach(() => {
    repository = {
      invalidateOtherUsersByDeviceId: jest.fn().mockResolvedValue(0),
      findByUserIdAndDeviceId: jest.fn().mockResolvedValue(null),
      save: jest.fn((token: DeviceToken) => Promise.resolve(token)),
      create: jest.fn((values: Partial<DeviceToken>) => values as DeviceToken),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<DeviceTokenRepository>;

    service = new DeviceTokenService(repository);
  });

  describe('register', () => {
    it('같은 기기에 남아 있는 다른 계정의 등록을 무효화한다', async () => {
      // given — 앞 사용자(A)가 쓰던 기기에 B가 로그인했다.
      // 유니크가 (user_id, device_id)라 A의 행은 같은 푸시 토큰을 든 채 살아남는다
      repository.invalidateOtherUsersByDeviceId.mockResolvedValue(1);

      // when
      await service.register(buildCommand({ userId: USER_B }), NOW);

      // then
      expect(repository.invalidateOtherUsersByDeviceId).toHaveBeenCalledWith(
        DEVICE_ID,
        USER_B,
        NOW,
        undefined,
      );
    });

    it('무효화는 등록보다 먼저 일어난다 — 그 사이에 알림이 나가지 않아야 한다', async () => {
      // given
      const calls: string[] = [];
      repository.invalidateOtherUsersByDeviceId.mockImplementation(() => {
        calls.push('invalidate');
        return Promise.resolve(1);
      });
      repository.save.mockImplementation((token: DeviceToken) => {
        calls.push('save');
        return Promise.resolve(token);
      });

      // when
      await service.register(buildCommand(), NOW);

      // then
      expect(calls).toEqual(['invalidate', 'save']);
    });

    it('같은 계정이 다시 등록하면 이전 무효화 표시를 지운다', async () => {
      // given — 계정을 오갔다가 돌아온 경우다. 표시가 남아 있으면 알림을 못 받는다
      repository.findByUserIdAndDeviceId.mockResolvedValue({
        userId: USER_A,
        deviceId: DEVICE_ID,
        invalidatedAt: new Date('2026-09-07T00:00:00Z'),
      } as DeviceToken);

      // when
      await service.register(buildCommand({ userId: USER_A }), NOW);

      // then
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ invalidatedAt: null }),
        undefined,
      );
    });
  });
});
