import { Controller, Get, Query } from '@nestjs/common';

import { GetAppVersionQueryRequestDto } from './dto/get-app-version-query-request.dto';
import { GetAppVersionResponseDto } from './dto/get-app-version-response.dto';
import { SettingsOrchestrator } from './settings.orchestrator';

/**
 * 스플래시의 **강제 업데이트 관문**(`splash.md` 4.1 처리 1단계 · FR-35, 신설 2026-09-26).
 *
 * **인증 없이 부른다** — 로그인 전에 판정해야 하므로 `JwtAuthGuard`를 걸지 않는다. 레이트 리밋은
 * 전역 기본 한도를 그대로 받는다(앱 실행당 1회라 충분하다). 판정은 서버가 한다: `app_version <
 * min_supported_version`이면 426 `APP_UPDATE_REQUIRED`, 아니면 4.1의 `version` 블록과 같은 값을 돌려준다.
 * 클라이언트는 실패(네트워크·5xx)에 앱을 막지 않는다(fail-open — `splash.md` 7장, README 결정 39).
 */
@Controller('app')
export class AppVersionController {
  constructor(private readonly settingsOrchestrator: SettingsOrchestrator) {}

  @Get('version')
  getAppVersion(
    @Query() query: GetAppVersionQueryRequestDto,
  ): GetAppVersionResponseDto {
    return GetAppVersionResponseDto.from(
      this.settingsOrchestrator.checkAppVersion(
        query.app_version,
        query.platform,
      ),
    );
  }
}
