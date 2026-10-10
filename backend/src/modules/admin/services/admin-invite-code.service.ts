import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { toServiceDate } from '@/common/utils/service-date.util';
import { AuditLogService } from '@/modules/partner/audit-log.service';
import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { InviteCodeWithUsage } from '@/modules/subscription/repositories/invite-code.repository';
import { InviteCodeService } from '@/modules/subscription/services/invite-code.service';
import { UpdateInviteCodeCommand } from '@/modules/subscription/subscription.types';
import { UserTier } from '@/modules/user/user.enum';

import {
  AUDIT_ACTION_INVITE_CODE_CREATE,
  AUDIT_ACTION_INVITE_CODE_UPDATE,
} from '../admin.constant';

export interface CreateInviteCodeCommand {
  code: string | null;
  name: string;
  tier: UserTier;
  grantDays: number | null;
  grantUntilDate: string | null;
  maxRedemptions: number | null;
  redeemableFrom: Date | null;
  redeemableUntil: Date | null;
}

/**
 * admin-api.md 4.23 — 초대 코드 관리. 쓰기와 감사 기록을 **한 트랜잭션**으로 묶는다(공지·주제 관리와 같은 구조).
 */
@Injectable()
export class AdminInviteCodeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inviteCodeService: InviteCodeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(now: Date): Promise<InviteCodeWithUsage[]> {
    return this.inviteCodeService.listWithUsage(now);
  }

  async create(
    actorUserId: string,
    command: CreateInviteCodeCommand,
    now: Date,
  ): Promise<InviteCode> {
    if ((command.grantDays === null) === (command.grantUntilDate === null)) {
      throw new BadRequestException(
        'grant_days 와 grant_until_date 중 하나만 보내요',
      );
    }
    // 마지막 날이 이미 지났으면 아무도 쓸 수 없는 코드다 — 날짜 실수로 본다
    if (
      command.grantUntilDate !== null &&
      command.grantUntilDate < toServiceDate(now)
    ) {
      throw new BadRequestException('grant_until_date 가 이미 지났어요');
    }
    assertWindow(command.redeemableFrom, command.redeemableUntil);

    return this.dataSource
      .transaction(async (manager) => {
        const created = await this.inviteCodeService.create(command, manager);
        await this.auditLogService.record(
          {
            actor: actorUserId,
            action: AUDIT_ACTION_INVITE_CODE_CREATE,
            target: `invite_code:${created.id}`,
            after: snapshot(created),
          },
          manager,
        );
        return created;
      })
      .catch((error: unknown) => {
        // 같은 코드를 동시에 만들면 중복 확인을 둘 다 통과하고 유니크 인덱스가 막는다 — 500 이 아니라 409
        if (isUniqueViolation(error)) {
          throw new BusinessException({
            status: HttpStatus.CONFLICT,
            errorCode: ErrorCode.INVITE_CODE_DUPLICATE,
            message: '같은 코드가 이미 있어요',
            logLevel: 'info',
          });
        }
        throw error;
      });
  }

  async update(
    actorUserId: string,
    id: string,
    command: UpdateInviteCodeCommand,
  ): Promise<InviteCode> {
    return this.dataSource.transaction(async (manager) => {
      const { before, after } = await this.inviteCodeService.update(
        id,
        command,
        manager,
      );
      assertWindow(after.redeemableFrom, after.redeemableUntil);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_INVITE_CODE_UPDATE,
          target: `invite_code:${after.id}`,
          before: snapshot(before),
          after: snapshot(after),
        },
        manager,
      );
      return after;
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

/** 입력 기간이 뒤집혀 있으면 아무도 못 쓰는 코드가 된다 — 실수로 보고 400 */
function assertWindow(from: Date | null, until: Date | null): void {
  if (from !== null && until !== null && from >= until) {
    throw new BadRequestException(
      'redeemable_from 은 redeemable_until 보다 앞이어야 해요',
    );
  }
}

/** 감사 로그에 남길 값 — 코드 값은 운영자가 정한 공개 값이라 남긴다(사용자 정보는 없다) */
function snapshot(code: InviteCode): Record<string, unknown> {
  return {
    code: code.code,
    name: code.name,
    tier: code.tier,
    grant_days: code.grantDays,
    grant_until_date: code.grantUntilDate,
    max_redemptions: code.maxRedemptions,
    redeemable_from: code.redeemableFrom?.toISOString() ?? null,
    redeemable_until: code.redeemableUntil?.toISOString() ?? null,
    is_active: code.isActive,
  };
}
