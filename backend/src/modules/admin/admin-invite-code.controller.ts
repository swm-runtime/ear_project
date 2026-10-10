import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import {
  AdminInviteCodeItemDto,
  AdminInviteCodeListResponseDto,
} from './dto/admin-invite-code-item.dto';
import { CreateInviteCodeRequestDto } from './dto/create-invite-code-request.dto';
import { UpdateInviteCodeRequestDto } from './dto/update-invite-code-request.dto';
import { AdminInviteCodeService } from './services/admin-invite-code.service';

/**
 * 어드민 — 초대 코드 관리(`admin-api.md` 4.23, 2026-10-10). PoC·제휴 캠페인마다 코드를 만들고, 켜고 끄고, 사용 현황을 본다.
 * 삭제는 없다 — 끄면(`is_active = false`) 새 입력만 막히고 지급 기록은 남는다.
 */
@Controller('admin/invite-codes')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminInviteCodeController {
  constructor(
    private readonly adminInviteCodeService: AdminInviteCodeService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(): Promise<AdminInviteCodeListResponseDto> {
    const rows = await this.adminInviteCodeService.list(new Date());
    return {
      items: rows.map((row) =>
        AdminInviteCodeItemDto.from(row.code, row.activeCount),
      ),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: CreateInviteCodeRequestDto,
  ): Promise<AdminInviteCodeItemDto> {
    return AdminInviteCodeItemDto.from(
      await this.adminInviteCodeService.create(
        currentUser.id,
        {
          code: request.code ?? null,
          name: request.name.trim(),
          tier: request.tier,
          grantDays: request.grant_days ?? null,
          grantUntilDate: request.grant_until_date ?? null,
          maxRedemptions: request.max_redemptions ?? null,
          redeemableFrom: toDate(request.redeemable_from),
          redeemableUntil: toDate(request.redeemable_until),
        },
        new Date(),
      ),
    );
  }

  @Patch(':inviteCodeId')
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('inviteCodeId', ParseUUIDPipe) inviteCodeId: string,
    @Body() request: UpdateInviteCodeRequestDto,
  ): Promise<AdminInviteCodeItemDto> {
    return AdminInviteCodeItemDto.from(
      await this.adminInviteCodeService.update(currentUser.id, inviteCodeId, {
        name: request.name?.trim(),
        isActive: request.is_active,
        maxRedemptions: request.max_redemptions,
        redeemableFrom:
          request.redeemable_from === undefined
            ? undefined
            : toDate(request.redeemable_from),
        redeemableUntil:
          request.redeemable_until === undefined
            ? undefined
            : toDate(request.redeemable_until),
      }),
    );
  }
}

function toDate(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}
