import { getMetadataArgsStorage } from 'typeorm';

import { UserSettingService } from './user-setting.service';
import { UserSetting } from '../entities/user-setting.entity';
import { UserSettingRepository } from '../repositories/user-setting.repository';
import { PlaybackRate } from '../user.enum';

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** 엔티티 `@Column({ default })` — 마이그레이션은 엔티티에서 생성되므로 DB 기본값과 같은 근거다(마이그레이션 자체는 보지 않는다) */
function columnDefault(propertyName: keyof UserSetting): unknown {
  const column = getMetadataArgsStorage().columns.find(
    (args) => args.target === UserSetting && args.propertyName === propertyName,
  );
  return column?.options.default;
}

describe('UserSettingService', () => {
  let repository: jest.Mocked<UserSettingRepository>;
  let service: UserSettingService;

  beforeEach(() => {
    repository = {
      findByUserId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<UserSettingRepository>;
    service = new UserSettingService(repository);
  });

  describe('getSettings — 행이 없을 때의 기본값', () => {
    it('행이 없으면 기본값을 돌려주고 저장하지 않는다 — 조회가 쓰기를 유발하지 않는다', async () => {
      const view = await service.getSettings(USER_ID);

      expect(view).toEqual({
        defaultPlaybackRate: PlaybackRate.NORMAL,
        isAutoExpandEnabled: true,
        isDripNotificationEnabled: true,
        dripFeedbackMutedUntil: null,
        dripFeedbackLastPromptedDate: null,
        preferredAudioQuality: null,
      });
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('코드 기본값이 엔티티(DB) 기본값과 같다 — 한쪽만 바뀌면 첫 PATCH 직후 화면이 튄다(domain.md 3.5)', async () => {
      const view = await service.getSettings(USER_ID);

      expect(Number(columnDefault('defaultPlaybackRate'))).toBe(
        view.defaultPlaybackRate,
      );
      expect(columnDefault('isAutoExpandEnabled')).toBe(
        view.isAutoExpandEnabled,
      );
      expect(columnDefault('isDripNotificationEnabled')).toBe(
        view.isDripNotificationEnabled,
      );
    });
  });

  describe('updateSettings — 부분 갱신', () => {
    it('보낸 필드만 저장하고 보내지 않은 필드는 건드리지 않는다', async () => {
      repository.upsert.mockResolvedValue({
        defaultPlaybackRate: PlaybackRate.NORMAL,
        isAutoExpandEnabled: false,
        isDripNotificationEnabled: true,
        dripFeedbackMutedUntil: null,
        dripFeedbackLastPromptedDate: null,
        preferredAudioQuality: null,
      } as UserSetting);

      const view = await service.updateSettings(USER_ID, {
        isAutoExpandEnabled: false,
      });

      expect(repository.upsert).toHaveBeenCalledWith(
        USER_ID,
        { isAutoExpandEnabled: false },
        undefined,
      );
      expect(view.isAutoExpandEnabled).toBe(false);
    });

    it('null 은 "보내지 않음"이 아니라 값이다 — 별점 그만 보기 해제처럼 비우는 요청을 저장한다', async () => {
      repository.upsert.mockResolvedValue({} as UserSetting);

      await service.updateSettings(USER_ID, { dripFeedbackMutedUntil: null });

      expect(repository.upsert).toHaveBeenCalledWith(
        USER_ID,
        { dripFeedbackMutedUntil: null },
        undefined,
      );
    });
  });
});
