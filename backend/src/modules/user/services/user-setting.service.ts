import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserSetting } from '../entities/user-setting.entity';
import { UserSettingRepository } from '../repositories/user-setting.repository';
import { PlaybackRate } from '../user.enum';
import { UserSettingView, UpdateUserSettingCommand } from '../user.types';

/**
 * `user_settings`는 user 모듈 소유다(domain.md 2장). 다른 모듈은 Repository를 직접
 * 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class UserSettingService {
  constructor(private readonly userSettingRepository: UserSettingRepository) {}

  /**
   * 현재 설정. **행이 없으면 기본값을 만들어 돌려주고 저장하지 않는다**
   * (`settings-api.md` 4.1 — 조회가 쓰기를 유발하지 않는다).
   *
   * 기본값을 여기서 만드는 이유: DB 기본값과 같은 값을 코드가 한 번 더 들고 있어야
   * 행이 없는 사용자에게도 화면이 토글 기준값을 받는다. 두 곳의 값이 어긋나면 첫 PATCH
   * 직후 화면이 튀므로, **DB 기본값과 이 상수를 같은 근거(domain.md 3.5)로 맞춘다.**
   */
  async getSettings(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserSettingView> {
    const setting = await this.userSettingRepository.findByUserId(
      userId,
      manager,
    );

    return setting ? toView(setting) : buildDefaults();
  }

  /**
   * 부분 갱신. **절대값 저장이라 같은 요청이 두 번 도착해도 결과가 같다**
   * (`settings-api.md` 3장 — 그래서 멱등키가 없다).
   *
   * 보내지 않은 필드는 건드리지 않는다.
   */
  async updateSettings(
    userId: string,
    command: UpdateUserSettingCommand,
    manager?: EntityManager,
  ): Promise<UserSettingView> {
    const changes: Partial<UserSetting> = {};

    if (command.defaultPlaybackRate !== undefined) {
      changes.defaultPlaybackRate = command.defaultPlaybackRate;
    }
    if (command.isAutoExpandEnabled !== undefined) {
      changes.isAutoExpandEnabled = command.isAutoExpandEnabled;
    }
    if (command.isDripNotificationEnabled !== undefined) {
      changes.isDripNotificationEnabled = command.isDripNotificationEnabled;
    }

    const saved = await this.userSettingRepository.upsert(
      userId,
      changes,
      manager,
    );

    return toView(saved);
  }

  /** 탈퇴 파기. FK가 `ON DELETE CASCADE`라 실제로는 계정 삭제로 함께 사라진다(domain.md 12.3) */
  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.userSettingRepository.deleteByUserId(userId, manager);
  }
}

function toView(setting: UserSetting): UserSettingView {
  return {
    defaultPlaybackRate: setting.defaultPlaybackRate,
    isAutoExpandEnabled: setting.isAutoExpandEnabled,
    isDripNotificationEnabled: setting.isDripNotificationEnabled,
  };
}

/** domain.md 3.5의 DEFAULT와 같은 값이다. 한쪽만 바뀌면 첫 PATCH 직후 화면이 튄다 */
function buildDefaults(): UserSettingView {
  return {
    defaultPlaybackRate: PlaybackRate.NORMAL,
    isAutoExpandEnabled: true,
    isDripNotificationEnabled: true,
  };
}
