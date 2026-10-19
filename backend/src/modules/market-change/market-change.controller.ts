import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { ChangeMarketRequestDto } from './dto/change-market-request.dto';
import { ChangeMarketResponseDto } from './dto/change-market-response.dto';
import { MarketChangePreviewQueryDto } from './dto/market-change-preview-query.dto';
import { MarketChangePreviewResponseDto } from './dto/market-change-preview-response.dto';
import { MarketChangeOrchestrator } from './market-change.orchestrator';

/** `global-api.md` 4.11 — 설정 › 콘텐츠 언어. 탈퇴(`withdrawal-preview` → `withdraw`)와 같은 미리보기 → 실행 2단계다 */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class MarketChangeController {
  constructor(
    private readonly marketChangeOrchestrator: MarketChangeOrchestrator,
  ) {}

  @Get('market-change/preview')
  async preview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: MarketChangePreviewQueryDto,
  ): Promise<MarketChangePreviewResponseDto> {
    return MarketChangePreviewResponseDto.from(
      await this.marketChangeOrchestrator.preview(
        currentUser.id,
        query.preferred_language,
        new Date(),
      ),
    );
  }

  @Post('market-change')
  @HttpCode(HttpStatus.OK)
  async change(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: ChangeMarketRequestDto,
  ): Promise<ChangeMarketResponseDto> {
    const now = new Date();

    return ChangeMarketResponseDto.from(
      await this.marketChangeOrchestrator.change(
        currentUser.id,
        request.preferred_language,
        request.consents.map((consent) => ({
          consentType: consent.consent_type,
          version: consent.version ?? null,
          isAgreed: consent.is_agreed,
        })),
        now,
      ),
      now,
    );
  }
}
