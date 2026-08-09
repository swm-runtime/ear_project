import { UserSettingView } from '@/modules/user/user.types';

class SettingsValuesDto {
  readonly default_playback_rate: number;
  readonly is_auto_expand_enabled: boolean;
  readonly is_drip_notification_enabled: boolean;
}

/**
 * settings-api.md 4.2 — **갱신 후의 설정 전체**를 되돌린다.
 *
 * 바꾼 필드만 돌려주지 않는 이유: 낙관적으로 바꾼 화면 값을 이 응답으로 확정하는데,
 * 일부만 오면 나머지 토글의 기준값이 요청 전 상태로 남아 다음 조작이 어긋난다.
 */
export class UpdateSettingsResponseDto {
  readonly settings: SettingsValuesDto;
  readonly client_seq: number;

  static from(
    view: UserSettingView,
    clientSeq: number,
  ): UpdateSettingsResponseDto {
    return {
      settings: {
        default_playback_rate: view.defaultPlaybackRate,
        is_auto_expand_enabled: view.isAutoExpandEnabled,
        is_drip_notification_enabled: view.isDripNotificationEnabled,
      },
      client_seq: clientSeq,
    };
  }
}
