import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(private readonly deviceTokenRepository: DeviceTokenRepository) {}

  /**
   * `device_id` 기준 upsert. `uq_device_tokens_user_id_device_id`가 1행을 보장하므로
   * 같은 값을 몇 번 보내도 결과가 같다 — 멱등키가 필요 없어 PUT이다.
   *
   * **같은 기기에 남은 다른 계정의 등록은 함께 무효화한다.** 유니크가 (user_id, device_id)라
   * 계정을 바꿔 로그인하면 앞 계정의 행이 **같은 푸시 토큰을 든 채** 살아남는다. 그대로 두면
   * 앞 사용자의 알림이 지금 이 기기 주인에게 간다 — 한 기기는 한 계정을 향한다.
   *
   * 로그아웃 시점이 아니라 **등록 시점에** 정리하는 이유: 앱 삭제·강제 종료·토큰 만료처럼
   * 로그아웃을 거치지 않는 경로가 있어서, 로그아웃 훅만으로는 빠짐없이 잡히지 않는다.
   */
  async register(
    command: RegisterDeviceCommand,
    now: Date,
    manager?: EntityManager,
  ): Promise<DeviceToken> {
    const invalidatedCount =
      await this.deviceTokenRepository.invalidateOtherUsersByDeviceId(
        command.deviceId,
        command.userId,
        now,
        manager,
      );

    if (invalidatedCount > 0) {
      // 기기 주인이 바뀐 순간이다 — 알림이 엉뚱한 사람에게 갔는지 되짚을 수 있어야 한다
      this.logger.log('device reassigned to another account', {
        user_id: command.userId,
        invalidated_count: invalidatedCount,
      });
    }

    /**
     * find → save 대신 **한 문장 upsert**. 같은 (user, device)의 최초 동시 등록 두 건이
     * 모두 "행 없음"을 보고 각자 INSERT 해 유니크 위반 500이 나던 경합을 제약이 갱신으로
     * 흡수한다(architecture.md 8.4). 재등록이므로 이전 무효화 표시도 upsert가 지운다.
     */
    await this.deviceTokenRepository.upsert(
      {
        userId: command.userId,
        deviceId: command.deviceId,
        token: command.pushToken,
        platform: command.platform,
        isOsPermissionGranted: command.isOsPermissionGranted,
        appVersion: command.appVersion,
      },
      manager,
    );

    const saved = await this.deviceTokenRepository.findByUserIdAndDeviceId(
      command.userId,
      command.deviceId,
      manager,
    );

    if (!saved) {
      // upsert 직후라 있을 수밖에 없다 — 없다면 같은 트랜잭션 밖에서 삭제가 겹친 것이고 재시도 대상이다
      throw new Error('device token missing right after upsert');
    }

    return saved;
  }

  /** 푸시 발송 대상 기기(`notification.md` 4.2) — 판정은 notification 모듈이 하고 여기는 조회만 한다 */
  async findDeliverableByUserIds(
    userIds: string[],
    manager?: EntityManager,
  ): Promise<DeviceToken[]> {
    return this.deviceTokenRepository.findDeliverableByUserIds(
      userIds,
      manager,
    );
  }

  /**
   * 발송 서비스가 "더 이상 이 기기에 닿지 않는다"(Expo `DeviceNotRegistered`)고 알려준 토큰을 뺀다
   * (`notification.md` 7). 행을 지우지 않는다 — 앱이 다시 등록하면 upsert가 표시를 지운다.
   * 보낸 토큰이 아직 그 행에 있을 때만 끈다 — 그사이 새 토큰으로 재등록됐으면 건드리지 않는다.
   */
  async invalidateDeliveredTokens(
    targets: { id: string; token: string }[],
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const unique = [
      ...new Map(
        targets.map((target) => [`${target.id}:${target.token}`, target]),
      ).values(),
    ];

    if (unique.length === 0) {
      return 0;
    }

    return this.deviceTokenRepository.invalidateByIdAndToken(
      unique,
      now,
      manager,
    );
  }

  /**
   * 로그아웃한 기기로 이전 사용자의 알림이 가지 않게 한다(`auth.md` 4.2 · `notification.md` 7).
   * 같은 기기에서 다시 로그인하면 앱의 등록(`register`)이 표시를 지운다.
   */
  async invalidateByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    return this.deviceTokenRepository.invalidateByUserIdAndDeviceId(
      userId,
      deviceId,
      now,
      manager,
    );
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.deviceTokenRepository.deleteByUserId(userId, manager);
  }
}
