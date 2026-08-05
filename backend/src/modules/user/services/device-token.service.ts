import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { DeviceToken } from '../entities/device-token.entity';
import { DeviceTokenRepository } from '../repositories/device-token.repository';
import { RegisterDeviceCommand } from '../user.types';

/**
 * `device_tokens`는 user 모듈 소유다(domain.md 2장).
 *
 * 온보딩 전용 경로를 만들지 않는다 — 같은 값을 설정 화면과 포그라운드 복귀 동기화도
 * 갱신하므로, 경로를 나누면 권한 상태의 진실이 두 곳이 된다(onboarding-api.md 3장).
 */
@Injectable()
export class DeviceTokenService {
  constructor(private readonly deviceTokenRepository: DeviceTokenRepository) {}

  /**
   * `device_id` 기준 upsert. `uq_device_tokens_user_id_device_id`가 1행을 보장하므로
   * 같은 값을 몇 번 보내도 결과가 같다 — 멱등키가 필요 없어 PUT이다.
   */
  async register(
    command: RegisterDeviceCommand,
    manager?: EntityManager,
  ): Promise<DeviceToken> {
    const existing = await this.deviceTokenRepository.findByUserIdAndDeviceId(
      command.userId,
      command.deviceId,
      manager,
    );

    const deviceToken =
      existing ??
      this.deviceTokenRepository.create({
        userId: command.userId,
        deviceId: command.deviceId,
      });

    deviceToken.token = command.pushToken;
    deviceToken.platform = command.platform;
    deviceToken.isOsPermissionGranted = command.isOsPermissionGranted;
    deviceToken.appVersion = command.appVersion;
    // 다시 등록됐으므로 이전 무효화 표시를 지운다
    deviceToken.invalidatedAt = null;

    return this.deviceTokenRepository.save(deviceToken, manager);
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.deviceTokenRepository.deleteByUserId(userId, manager);
  }
}
