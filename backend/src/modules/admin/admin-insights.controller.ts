import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { FUNNEL_HABIT_MIN_PLAY_DAYS } from './admin.constant';
import { AdminInsightsFunnelQueryRequestDto } from './dto/admin-insights-funnel-query-request.dto';
import { AdminInsightsFunnelResponseDto } from './dto/admin-insights-funnel-response.dto';
import { AdminInsightsSummaryQueryRequestDto } from './dto/admin-insights-summary-query-request.dto';
import { AdminInsightsSummaryResponseDto } from './dto/admin-insights-summary-response.dto';
import { AdminInviteCodeCohortsQueryRequestDto } from './dto/admin-invite-code-cohorts-query-request.dto';
import { AdminInviteCodeCohortsResponseDto } from './dto/admin-invite-code-cohorts-response.dto';
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

  /**
   * 가입 주 코호트 퍼널 — 로그 콘솔 "실험 지표" 탭(2026-10-28). 가입한 사람이 어느 단계에서 가장 많이 빠지나.
   * 읽기 전용 · 집계값만(개인 식별 정보 없음) · 열 때 1회 + [새로고침]
   */
  @Get('funnel')
  @Header('Cache-Control', 'no-store')
  async funnel(
    @Query() query: AdminInsightsFunnelQueryRequestDto,
  ): Promise<AdminInsightsFunnelResponseDto> {
    return AdminInsightsFunnelResponseDto.from(
      await this.adminInsightsService.signupFunnel(
        query.weeks,
        new Date(),
        query.market ?? null,
      ),
      FUNNEL_HABIT_MIN_PLAY_DAYS,
    );
  }
}
