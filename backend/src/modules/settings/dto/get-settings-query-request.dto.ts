import { Matches, MaxLength } from 'class-validator';

import { SEMVER_PATTERN } from '@/common/utils/semver.util';

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
}
