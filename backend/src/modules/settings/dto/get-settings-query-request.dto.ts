import { IsEnum, Matches, MaxLength } from 'class-validator';

import { SEMVER_PATTERN } from '@/common/utils/semver.util';
import { DevicePlatform } from '@/modules/user/user.enum';

/** `1.4.0` — 세 자리 semver의 현실적 상한 */
const MAX_VERSION_LENGTH = 32;

/**
 * settings-api.md 4.1 — 업데이트 안내 판정용 앱 버전.
 *
 * **정책 판정이 아니라 표시 판정이다**(7장) — 이 값으로 티어·기능 접근을 가르지 않는다.
 * 클라이언트가 보낸 값이므로 신뢰 경계 밖이고, 쓰이는 곳은 [업데이트] 배지 하나뿐이다.
 */
export class GetSettingsQueryRequestDto {
  @Matches(SEMVER_PATTERN)
  @MaxLength(MAX_VERSION_LENGTH)
  readonly app_version: string;

  /**
   * 어느 스토어의 최신 버전과 비교할지(settings-api.md 4.1).
   *
   * **`@IsOptional()`을 붙이지 않는다.** 기본값을 두면 그 플랫폼에는 맞고 다른 쪽에는
   * **틀렸다는 사실이 드러나지 않는 판정**이 나간다 — 심사 주기가 갈린 동안 잘못된
   * [업데이트] 배지가 조용히 노출된다.
   *
   * **값 집합은 기기 등록과 같은 `DevicePlatform`이다**(`onboarding-api.md` 4.9).
   * 설정 전용 enum을 따로 두면 같은 문자열의 소유가 두 곳으로 갈린다.
   */
  @IsEnum(DevicePlatform)
  readonly platform: DevicePlatform;
}
