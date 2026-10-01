import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { SearchQueryLogSummaryQueryRequestDto } from './dto/search-query-log-summary-query-request.dto';
import { SearchQueryLogSummaryResponseDto } from './dto/search-query-log-summary-response.dto';
import { SearchQueryLogService } from './services/search-query-log.service';

/**
 * 어드민 — 검색 질의 로그 요약(`admin-api.md` 4.21). 로그 콘솔 "검색 로그" 탭이 읽는다.
 * `/admin` 아래에 두되 `AdminModule`이 아니라 여기 둔다 — 버전별 별점(`DripFeedbackAdminController`)과
 * 같은 이유로, 데이터 소유 모듈이 관리자 조회도 낸다.
 */
@Controller('admin/search-query-logs')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class SearchQueryLogAdminController {
  constructor(private readonly searchQueryLogService: SearchQueryLogService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  async summary(
    @Query() query: SearchQueryLogSummaryQueryRequestDto,
  ): Promise<SearchQueryLogSummaryResponseDto> {
    return SearchQueryLogSummaryResponseDto.from(
      await this.searchQueryLogService.summarize(query.days, new Date()),
      query.days,
    );
  }
}
