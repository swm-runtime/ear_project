import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { BillingOrchestrator } from '../billing.orchestrator';
import { ListPlansQueryRequestDto } from '../dto/list-plans-query-request.dto';
import { ListPlansResponseDto } from '../dto/list-plans-response.dto';

/** subscription-api.md 4.1 — 페이월 시트·구독 관리의 3티어 비교 카드 */
@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlanController {
  constructor(private readonly billingOrchestrator: BillingOrchestrator) {}

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListPlansQueryRequestDto,
  ): Promise<ListPlansResponseDto> {
    return ListPlansResponseDto.from(
      await this.billingOrchestrator.listPlans(currentUser.id, query.platform),
    );
  }
}
