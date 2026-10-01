import { Controller, Get, Header, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { DripFeedbackVersionsResponseDto } from './dto/drip-feedback-versions-response.dto';
import { DripFeedbackService } from './drip-feedback.service';

/**
 * 어드민 — 알고리즘 버전별 평점(`admin-api.md` 4.19). `/admin` 아래에 두되 `AdminModule`이 아니라 여기 둔다 —
 * 편성 미리보기(`DripPreviewController`)와 같은 이유로, 데이터 소유 모듈이 관리자 조회도 낸다.
 */
@Controller('admin/drip-feedback')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class DripFeedbackAdminController {
  constructor(private readonly dripFeedbackService: DripFeedbackService) {}

  @Get('versions')
  @Header('Cache-Control', 'no-store')
  async versions(): Promise<DripFeedbackVersionsResponseDto> {
    return DripFeedbackVersionsResponseDto.from(
      await this.dripFeedbackService.summarizeVersions(),
    );
  }
}
