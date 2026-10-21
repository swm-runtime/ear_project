import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { RecommendInspectorDetailResponseDto } from './dto/recommend-inspector-detail-response.dto';
import { RecommendInspectorUsersQueryRequestDto } from './dto/recommend-inspector-users-query-request.dto';
import { RecommendInspectorUsersResponseDto } from './dto/recommend-inspector-users-response.dto';
import { RecommendInspectorService } from './recommend-inspector.service';

/**
 * 서비스 지표 "추천 검증"(2026-10-22) — 로그 콘솔 서비스 지표 화면에서 가명 사용자 한 명의 청취·편성·추천 계산을 본다.
 * 인증·인가는 서비스 지표 요약(`/admin/insights/summary`)과 같다(`JwtAuthGuard` + `AdminRoleGuard`). 읽기 전용이고
 * 응답은 캐시하지 않는다. 상세 열람은 1회마다 감사 로그(`insights.recommendation_view`)를 남긴다.
 *
 * 개인정보 처리 근거: 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선" — 이름·이메일·연락처는 조회하지 않는다.
 */
@Controller('admin/insights/recommendations')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class RecommendInspectorController {
  constructor(private readonly service: RecommendInspectorService) {}

  @Get('users')
  @Header('Cache-Control', 'no-store')
  async users(
    @Query() query: RecommendInspectorUsersQueryRequestDto,
  ): Promise<RecommendInspectorUsersResponseDto> {
    const now = new Date();

    return RecommendInspectorUsersResponseDto.from(
      query.sort,
      await this.service.listUsers(query.sort, query.limit, now),
      now,
    );
  }

  @Get('users/:userId')
  @Header('Cache-Control', 'no-store')
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<RecommendInspectorDetailResponseDto> {
    const now = new Date();

    return RecommendInspectorDetailResponseDto.from(
      await this.service.inspect(userId, currentUser.id, now),
      now,
    );
  }
}
