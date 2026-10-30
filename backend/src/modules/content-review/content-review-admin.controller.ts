import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import {
  decodeContentReviewCursor,
  encodeContentReviewCursor,
} from './content-review.cursor';
import { ContentReviewService } from './content-review.service';
import { AdminContentReviewListFilter } from './content-review.types';
import { AdminContentReviewListQueryRequestDto } from './dto/admin-content-review-list-query-request.dto';
import { AdminContentReviewListResponseDto } from './dto/admin-content-review-list-response.dto';
import { AdminContentReviewSummaryQueryRequestDto } from './dto/admin-content-review-summary-query-request.dto';
import { AdminContentReviewSummaryResponseDto } from './dto/admin-content-review-summary-response.dto';
import { CONTENT_REVIEW_ADMIN_DEFAULT_LIMIT } from './content-review.constant';

/**
 * 관리자 — 편별 후기 집계 · 글 목록(`content-review-api.md` 4.8 · 4.9). 읽기 전용. `/admin` 아래에 두되 `AdminModule`이
 * 아니라 데이터 소유 모듈에 둔다(추천 별점 `DripFeedbackAdminController`와 같은 이유).
 *
 * **응답에 작성자(`user_id`) · 닉네임 · 이메일이 없다.** 원문은 이 응답으로만 읽는다 — Slack · Jira · 문서 · 커밋 ·
 * 파이프라인 Supabase 에 옮기지 않는다(`content-review.md` 4.7).
 */
@Controller('admin/content-reviews')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class ContentReviewAdminController {
  constructor(private readonly contentReviewService: ContentReviewService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  async summary(
    @Query() query: AdminContentReviewSummaryQueryRequestDto,
  ): Promise<AdminContentReviewSummaryResponseDto> {
    return AdminContentReviewSummaryResponseDto.from(
      await this.contentReviewService.getAdminSummary(
        { contentId: query.content_id ?? null, market: query.market ?? null },
        new Date(),
      ),
    );
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query() query: AdminContentReviewListQueryRequestDto,
  ): Promise<AdminContentReviewListResponseDto> {
    const filter: AdminContentReviewListFilter = {
      contentId: query.content_id ?? null,
      market: query.market ?? null,
      hasText: query.has_text ?? null,
    };
    const cursor =
      query.cursor === undefined
        ? null
        : decodeContentReviewCursor(query.cursor, filter);
    const page = await this.contentReviewService.getAdminPage(
      filter,
      cursor,
      query.limit ?? CONTENT_REVIEW_ADMIN_DEFAULT_LIMIT,
    );

    return AdminContentReviewListResponseDto.from(
      page.items,
      page.next === null ? null : encodeContentReviewCursor(page.next, filter),
    );
  }
}
