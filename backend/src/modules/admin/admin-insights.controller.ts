import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { AdminInsightsSummaryQueryRequestDto } from './dto/admin-insights-summary-query-request.dto';
import { AdminInsightsSummaryResponseDto } from './dto/admin-insights-summary-response.dto';
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
      await this.adminInsightsService.summarize(query.days, new Date()),
      query.days,
    );
  }
}
