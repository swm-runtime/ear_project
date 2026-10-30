import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';

import {
  COMPLETION_LENGTH_CONTENT_MARKET,
  COMPLETION_LENGTH_MIN_AGE_HOURS,
  COMPLETION_LENGTH_SLOPE_STEP_MIN,
  DRIP_ARRIVAL_TIME_MIN_SAMPLE,
  DRIP_ARRIVAL_TIME_REACTION_HOURS,
  FUNNEL_HABIT_MIN_PLAY_DAYS,
  SERIES_EPISODES_MIN_AGE_HOURS,
  SHORT_VARIANT_DROP_10_SEC,
  SHORT_VARIANT_DROP_30_SEC,
  SHORT_VARIANT_DROP_60_SEC,
  SHORT_VARIANT_MIN_AGE_HOURS,
  SHORT_VARIANT_MIN_SAMPLE,
} from './admin.constant';
import { AdminInsightsCompletionByLengthResponseDto } from './dto/admin-insights-completion-by-length-response.dto';
import { AdminInsightsDripArrivalTimeQueryRequestDto } from './dto/admin-insights-drip-arrival-time-query-request.dto';
import { AdminInsightsDripArrivalTimeResponseDto } from './dto/admin-insights-drip-arrival-time-response.dto';
import { AdminInsightsFunnelQueryRequestDto } from './dto/admin-insights-funnel-query-request.dto';
import { AdminInsightsFunnelResponseDto } from './dto/admin-insights-funnel-response.dto';
import { AdminInsightsSummaryQueryRequestDto } from './dto/admin-insights-summary-query-request.dto';
import { AdminInsightsSummaryResponseDto } from './dto/admin-insights-summary-response.dto';
import { AdminInsightsSeriesEpisodesQueryRequestDto } from './dto/admin-insights-series-episodes-query-request.dto';
import { AdminInsightsSeriesEpisodesResponseDto } from './dto/admin-insights-series-episodes-response.dto';
import { AdminInsightsShortVariantQueryRequestDto } from './dto/admin-insights-short-variant-query-request.dto';
import { AdminInsightsShortVariantResponseDto } from './dto/admin-insights-short-variant-response.dto';
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
  constructor(
    private readonly adminInsightsService: AdminInsightsService,
    // 짧은 판 실험의 코호트 경계 — 판정 규칙의 한 곳(KAN-298)에서 읽는다
    private readonly contentCohortService: ContentCohortService,
  ) {}

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

  /**
   * 길이별 완청률 — 로그 콘솔 "실험 지표" 탭(2026-10-28). 한국 콘텐츠만, 추세(로지스틱 회귀)와 편별 축소값.
   * 읽기 전용 · 편 단위 집계(사용자는 수로만) · 열 때 1회 + [새로고침]
   */
  @Get('completion-by-length')
  @Header('Cache-Control', 'no-store')
  async completionByLength(): Promise<AdminInsightsCompletionByLengthResponseDto> {
    return AdminInsightsCompletionByLengthResponseDto.from(
      await this.adminInsightsService.completionByLength(new Date()),
      {
        contentMarket: COMPLETION_LENGTH_CONTENT_MARKET,
        minAgeHours: COMPLETION_LENGTH_MIN_AGE_HOURS,
        slopeStepMin: COMPLETION_LENGTH_SLOPE_STEP_MIN,
      },
    );
  }

  /**
   * 시리즈 편별 완청·이탈 — "몇 편에서 빠지는가"(KAN-293, 2026-10-29). 시리즈 편만(단일 콘텐츠 제외), 편마다 시작·완청·다음 편 진행.
   * 읽기 전용 · 편 단위 집계(사용자는 수로만) · 열 때 1회 + [새로고침]
   */
  @Get('series-episodes')
  @Header('Cache-Control', 'no-store')
  async seriesEpisodes(
    @Query() query: AdminInsightsSeriesEpisodesQueryRequestDto,
  ): Promise<AdminInsightsSeriesEpisodesResponseDto> {
    return AdminInsightsSeriesEpisodesResponseDto.from(
      await this.adminInsightsService.seriesEpisodes(
        new Date(),
        query.market ?? null,
      ),
      { minAgeHours: SERIES_EPISODES_MIN_AGE_HOURS },
    );
  }

  /**
   * 짧은 판·도입부 실험 — 로그 콘솔 "실험 지표" 탭(KAN-298 · KAN-296, 2026-10-29). 기존 판 vs 짧은 판 완청률, 기존 도입부 vs
   * 바뀐 도입부의 10초·30초·1분 이탈. 읽기 전용 · 집계값만(사용자는 수로만) · 열 때 1회 + [새로고침]
   */
  @Get('short-variant')
  @Header('Cache-Control', 'no-store')
  async shortVariant(
    @Query() query: AdminInsightsShortVariantQueryRequestDto,
  ): Promise<AdminInsightsShortVariantResponseDto> {
    return AdminInsightsShortVariantResponseDto.from(
      await this.adminInsightsService.shortVariant(
        new Date(),
        this.contentCohortService.cohortSince(),
        query.market ?? null,
      ),
      {
        minAgeHours: SHORT_VARIANT_MIN_AGE_HOURS,
        minSample: SHORT_VARIANT_MIN_SAMPLE,
        dropSec: [
          SHORT_VARIANT_DROP_10_SEC,
          SHORT_VARIANT_DROP_30_SEC,
          SHORT_VARIANT_DROP_60_SEC,
        ],
      },
    );
  }

  /**
   * 도착 알림 시각 실험 — 로그 콘솔 "실험 지표" 탭(KAN-289, 2026-10-30). 07:00 기준선 · 07:30(A) · 08:00(B)의 2시간·당일
   * 재생률과 참고 행(아침 알림). 읽기 전용 · 집계값만(사용자는 수로만) · 열 때 1회 + [새로고침]
   */
  @Get('drip-arrival-time')
  @Header('Cache-Control', 'no-store')
  async dripArrivalTime(
    @Query() query: AdminInsightsDripArrivalTimeQueryRequestDto,
  ): Promise<AdminInsightsDripArrivalTimeResponseDto> {
    return AdminInsightsDripArrivalTimeResponseDto.from(
      await this.adminInsightsService.dripArrivalTime(
        new Date(),
        query.days,
        query.market ?? null,
      ),
      {
        minSample: DRIP_ARRIVAL_TIME_MIN_SAMPLE,
        reactionWindowHours: DRIP_ARRIVAL_TIME_REACTION_HOURS,
      },
    );
  }
}
