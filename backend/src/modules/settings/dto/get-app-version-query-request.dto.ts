import { GetSettingsQueryRequestDto } from './get-settings-query-request.dto';

/**
 * settings-api.md 4.6 — 스플래시 버전 관문(`splash.md` 4.1)의 입력. 설정 화면 조회(4.1)와 **같은 두 값**
 * (`app_version` semver · `platform`)이라 검증 규칙을 그대로 물려받는다. 값 집합·플랫폼 필수 이유는 4.1과 같다.
 */
export class GetAppVersionQueryRequestDto extends GetSettingsQueryRequestDto {}
