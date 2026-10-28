import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { AdminInsightsSummaryQueryRequestDto } from './dto/admin-insights-summary-query-request.dto';
import { AdminInsightsSummaryResponseDto } from './dto/admin-insights-summary-response.dto';
import { AdminInviteCodeCohortsQueryRequestDto } from './dto/admin-invite-code-cohorts-query-request.dto';
import { AdminInviteCodeCohortsResponseDto } from './dto/admin-invite-code-cohorts-response.dto';
import { AdminInviteCodeDetailResponseDto } from './dto/admin-invite-code-detail-response.dto';
import { AdminInsightsService } from './services/admin-insights.service';

/**
 * 어드민 — 서비스 지표 요약(`admin-api.md` 4.22). 로그 콘솔 "서비스 지표" 탭이 **열 때 1회 + [새로고침]**으로 읽는다
 * (자동 폴링 없음 — `backend-monitoring.md` 3장). 읽기 전용이고 응답은 캐시하지 않는다.
 */
@Controller('admin/insights')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminInsightsController {
  constructor(private readonly adminInsightsService: AdminInsightsService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  async summary(
    @Query() query: AdminInsightsSummaryQueryRequestDto,
  ): Promise<AdminInsightsSummaryResponseDto> {
    return AdminInsightsSummaryResponseDto.from(
      await this.adminInsightsService.summarize(
        query.days,
        new Date(),
        query.market ?? null,
      ),
      query.days,
    );
  }

  /** 프로모션(초대 코드)별 묶음 지표 — 로그 콘솔 "프로모션" 탭(2026-10-28). 읽기 전용 · 열 때 1회 */
  @Get('invite-codes')
  @Header('Cache-Control', 'no-store')
  async inviteCodes(
    @Query() query: AdminInviteCodeCohortsQueryRequestDto,
  ): Promise<AdminInviteCodeCohortsResponseDto> {
    const now = new Date();

    return AdminInviteCodeCohortsResponseDto.from(
      await this.adminInsightsService.inviteCodeCohorts(query.days, now),
      query.days,
      now,
    );
  }

  /** 프로모션 탭에서 코드를 누르면 — 그 코드 묶음의 상세(2026-10-28). 없는 코드면 404 */
  @Get('invite-codes/:code')
  @Header('Cache-Control', 'no-store')
  async inviteCodeDetail(
    @Param('code') code: string,
    @Query() query: AdminInviteCodeCohortsQueryRequestDto,
  ): Promise<AdminInviteCodeDetailResponseDto> {
    const now = new Date();
    const result = await this.adminInsightsService.inviteCodeDetail(
      code,
      query.days,
      now,
    );

    if (result === null) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message: '없는 코드예요',
        logLevel: 'info',
      });
    }

    return AdminInviteCodeDetailResponseDto.from(result, query.days, now);
  }
}
