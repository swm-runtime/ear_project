import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { GetSettingsQueryRequestDto } from './dto/get-settings-query-request.dto';
import { GetSettingsResponseDto } from './dto/get-settings-response.dto';
import { UpdateMarketingConsentRequestDto } from './dto/update-marketing-consent-request.dto';
import { UpdateMarketingConsentResponseDto } from './dto/update-marketing-consent-response.dto';
import { UpdateSettingsRequestDto } from './dto/update-settings-request.dto';
import { UpdateSettingsResponseDto } from './dto/update-settings-response.dto';
import { SettingsOrchestrator } from './settings.orchestrator';
import { UpdateSettingsCommand } from './settings.types';

/**
 * settings-api.md 3장 — 설정 화면의 엔드포인트 셋.
 *
 * 설정은 대부분 하위 기능으로 연결하는 허브라, 서버가 소유하는 것은 화면 조회 · 설정 값 변경 ·
 * 마케팅 동의뿐이다. 이메일 인증·로그아웃·탈퇴·구독 변경은 각 소유 API가 담당한다(1장 경계 표).
 *
 * **경로에 `userId`를 받지 않고 `me`를 쓴다**(IDOR 방지 — architecture.md 9.2).
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsOrchestrator: SettingsOrchestrator) {}

  /** 설정 화면 진입 시 호출한다. 카드·토글 값이 한 화면에 함께 뜨므로 한 번에 받는다 */
  @Get('settings')
  async getSettings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: GetSettingsQueryRequestDto,
  ): Promise<GetSettingsResponseDto> {
    return GetSettingsResponseDto.from(
      await this.settingsOrchestrator.getSummary(
        currentUser.id,
        query.app_version,
      ),
    );
  }

  /**
   * 토글·시트에서 값을 바꾸는 순간 호출된다(낙관적 UI — `settings.md` 4.2).
   *
   * **PATCH인 이유**: 절대값 저장이라 같은 요청이 두 번 도착해도 결과가 같다. 그래서
   * 멱등키가 없다(`settings-api.md` 3장 설계 메모).
   */
  @Patch('settings')
  async updateSettings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: UpdateSettingsRequestDto,
  ): Promise<UpdateSettingsResponseDto> {
    const command = toUpdateCommand(request);

    // 세 설정 필드 중 최소 하나는 있어야 한다(4.2). 형식이 아니라 조합의 문제라 DTO가 아니다
    if (Object.keys(command).length === 0) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '요청을 처리할 수 없어요',
        logLevel: 'warn',
      });
    }

    return UpdateSettingsResponseDto.from(
      await this.settingsOrchestrator.updateSettings(currentUser.id, command),
      request.client_seq,
    );
  }

  /**
   * 마케팅 수신 동의·철회. **`consents`에 행을 추가하는 append다**(domain.md 3.2).
   *
   * **POST인 이유**: PATCH가 절대값 UPDATE인 것과 달리 매 호출이 이력 행을 만든다.
   * 관측되는 상태는 최신 행으로 수렴하지만, 리소스 표현은 "상태 갱신"이 아니라
   * "동의·철회 사실의 기록 추가"다(`settings-api.md` 4.3).
   *
   * 생성이지만 **200이다** — 클라이언트가 받는 것은 만들어진 행이 아니라 갱신된 현재 상태이며,
   * 되돌려 줄 리소스 URI도 없다.
   */
  @Post('consents/marketing')
  @HttpCode(HttpStatus.OK)
  async updateMarketingConsent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: UpdateMarketingConsentRequestDto,
  ): Promise<UpdateMarketingConsentResponseDto> {
    return UpdateMarketingConsentResponseDto.from(
      await this.settingsOrchestrator.recordMarketingConsent(
        currentUser.id,
        request.is_agreed,
        new Date(),
      ),
      request.client_seq,
    );
  }
}

/** DTO(snake_case)를 Service 경계의 Command(camelCase)로 옮긴다(convention.md 1.6 · 3.2) */
function toUpdateCommand(
  request: UpdateSettingsRequestDto,
): UpdateSettingsCommand {
  const command: UpdateSettingsCommand = {};

  if (request.default_playback_rate !== undefined) {
    command.defaultPlaybackRate = request.default_playback_rate;
  }
  if (request.is_auto_expand_enabled !== undefined) {
    command.isAutoExpandEnabled = request.is_auto_expand_enabled;
  }
  if (request.is_drip_notification_enabled !== undefined) {
    command.isDripNotificationEnabled = request.is_drip_notification_enabled;
  }

  return command;
}
