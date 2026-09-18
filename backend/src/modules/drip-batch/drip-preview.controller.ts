import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { DripPreviewQueryRequestDto } from './dto/drip-preview-query-request.dto';
import { DripPreviewResponseDto } from './dto/drip-preview-response.dto';
import { DripPreviewService } from './drip-preview.service';

/**
 * 편성 미리보기 — admin 콘솔 "추천 검증" 탭(요청 2026-09-18). **읽기 전용**이다: 계산만 하고 어떤 표도
 * 바꾸지 않는다(`DripPreviewService` 머리 주석).
 *
 * `/admin` 아래에 두되 `AdminModule`이 아니라 여기(편성 배치 모듈)에 둔다 — 계산기(`planForUser`)가 이
 * 모듈에 있고, `AdminModule`이 배치 모듈을 의존하게 만들 이유가 없다("어떤 모듈도 이 모듈을 의존하지
 * 않는다"). 권한 판정은 다른 관리자 라우트와 같다: `users.role == 'admin'`을 서버가 매 요청 확인한다
 * (admin-api 2장). 매번 다시 계산하는 값이라 캐시하지 않는다.
 */
@Controller('admin/drip')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class DripPreviewController {
  constructor(private readonly dripPreviewService: DripPreviewService) {}

  @Get('preview')
  @Header('Cache-Control', 'no-store')
  async preview(
    @Query() query: DripPreviewQueryRequestDto,
  ): Promise<DripPreviewResponseDto> {
    return DripPreviewResponseDto.from(
      await this.dripPreviewService.preview(query.email, new Date()),
    );
  }
}
