import { AppVersionView } from '../settings.types';

/**
 * settings-api.md 4.6 — 버전 관문 응답. 설정 화면 4.1의 `version` 블록과 **같은 형태**다 — 스플래시와 설정이
 * 같은 배포 설정을 읽는다는 것이 계약이다(`splash.md` 7장). 최소 지원 버전 미만이면 이 응답 대신
 * 426 `APP_UPDATE_REQUIRED`가 나간다 — 판정은 서버가 한다.
 */
export class GetAppVersionResponseDto {
  readonly latest_version: string;
  readonly min_supported_version: string;
  /** `app_version < latest_version` — 권장 업데이트 안내(닫기 가능) */
  readonly update_available: boolean;

  static from(view: AppVersionView): GetAppVersionResponseDto {
    return {
      latest_version: view.latestVersion,
      min_supported_version: view.minSupportedVersion,
      update_available: view.updateAvailable,
    };
  }
}
