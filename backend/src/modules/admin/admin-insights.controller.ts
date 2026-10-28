import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { AdminInsightsSummaryQueryRequestDto } from './dto/admin-insights-summary-query-request.dto';
import { AdminInsightsSummaryResponseDto } from './dto/admin-insights-summary-response.dto';
import { AdminInsightsV2QueryRequestDto } from './dto/admin-insights-v2-query-request.dto';
import { AdminInsightsV2ResponseDto } from './dto/admin-insights-v2-response.dto';
import { AdminInviteCodeCohortsQueryRequestDto } from './dto/admin-invite-code-cohorts-query-request.dto';
import { AdminInviteCodeCohortsResponseDto } from './dto/admin-invite-code-cohorts-response.dto';
import { INSIGHTS_V2_LAPSE_WINDOW_DAYS } from './admin.constant';
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
   * 서비스 지표 v2(2026-10-28) — 질문형 패널 셋(① 습관 사용자 ② 가입 주 퍼널 ③ 안 듣는 세그먼트)의 재료. 로그 콘솔
   * "서비스 지표 v2" 탭이 열 때 1회 + [새로고침]으로 읽는다. 읽기 전용 · 집계값만(개인 식별 정보 없음)
   */
  @Get('v2')
  @Header('Cache-Control', 'no-store')
  async v2(
    @Query() query: AdminInsightsV2QueryRequestDto,
  ): Promise<AdminInsightsV2ResponseDto> {
    return AdminInsightsV2ResponseDto.from(
      await this.adminInsightsService.insightsV2(
        query.weeks,
        new Date(),
        query.market ?? null,
      ),
      INSIGHTS_V2_LAPSE_WINDOW_DAYS,
    );
  }
}
