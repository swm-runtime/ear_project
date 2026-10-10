import { BadRequestException, HttpStatus } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { AuditLogService } from '@/modules/partner/audit-log.service';
import { RecordAuditLogCommand } from '@/modules/partner/partner.types';
import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { InviteCodeRepository } from '@/modules/subscription/repositories/invite-code.repository';
import { InviteCodeService } from '@/modules/subscription/services/invite-code.service';
import { UserTier } from '@/modules/user/user.enum';

import {
  AUDIT_ACTION_INVITE_CODE_CREATE,
  AUDIT_ACTION_INVITE_CODE_UPDATE,
} from '../admin.constant';
import {
  AdminInviteCodeService,
  CreateInviteCodeCommand,
} from './admin-invite-code.service';

const NOW = new Date('2026-10-10T06:00:00Z'); // 10월 10일 15:00 KST — 서비스 날짜 10-10
const ACTOR = 'admin-1';
const MANAGER = {} as EntityManager;

/**
 * 트랜잭션을 흉내 내는 메모리 세계 — 콜백이 던지면 시작 전 상태로 되돌린다.
 * 판정 규칙은 진짜 `AdminInviteCodeService`·`InviteCodeService`가 한다.
 */
class InviteCodeWorld {
  codes: InviteCode[] = [];
  auditLogs: RecordAuditLogCommand[] = [];
  /** 다음 `createCode`를 이 오류로 실패시킨다(유니크 인덱스 경합 재현) */
  nextCreateError: Error | null = null;

  readonly repository = {
    existsByCode: (code: string) =>
      Promise.resolve(this.codes.some((row) => row.code === code)),
    createCode: (draft: Partial<InviteCode>) => {
      if (this.nextCreateError !== null) {
        const error = this.nextCreateError;
        this.nextCreateError = null;
        return Promise.reject(error);
      }
      const code = {
        id: `code-${this.codes.length + 1}`,
        redeemedCount: 0,
        isActive: true,
        ...draft,
      } as InviteCode;
      this.codes.push(code);
      return Promise.resolve(code);
    },
    lockById: (id: string) =>
      Promise.resolve(this.codes.find((row) => row.id === id) ?? null),
    saveCode: (code: InviteCode) => Promise.resolve(code),
  };

  readonly dataSource = {
    transaction: async <T>(
      work: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => {
      const codes = structuredClone(this.codes);
      const auditLogs = structuredClone(this.auditLogs);
      try {
        return await work(MANAGER);
      } catch (error) {
        this.codes = codes;
        this.auditLogs = auditLogs;
        throw error;
      }
    },
  };

  readonly auditLogService = {
    record: (command: RecordAuditLogCommand) => {
      this.auditLogs.push(command);
      return Promise.resolve({});
    },
  };
}

function setup() {
  const world = new InviteCodeWorld();
  const service = new AdminInviteCodeService(
    world.dataSource as unknown as DataSource,
    new InviteCodeService(world.repository as unknown as InviteCodeRepository),
    world.auditLogService as unknown as AuditLogService,
  );
  return { world, service };
}

function command(
  overrides: Partial<CreateInviteCodeCommand> = {},
): CreateInviteCodeCommand {
  return {
    code: 'SANGUN-POC',
    name: '산군 PoC',
    tier: UserTier.PRO,
    grantDays: 30,
    grantUntilDate: null,
    maxRedemptions: null,
    redeemableFrom: null,
    redeemableUntil: null,
    ...overrides,
  };
}

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT INTO invite_codes', [], {
    code: '23505',
  } as unknown as Error);
}

describe('AdminInviteCodeService', () => {
  describe('create', () => {
    it('지급 일수로 만들면 코드를 저장하고 같은 트랜잭션에서 생성 감사 기록을 남긴다', async () => {
      // given
      const { world, service } = setup();

      // when
      const created = await service.create(ACTOR, command(), NOW);

      // then
      expect(world.codes).toHaveLength(1);
      expect(world.auditLogs).toEqual([
        expect.objectContaining({
          actor: ACTOR,
          action: AUDIT_ACTION_INVITE_CODE_CREATE,
          target: `invite_code:${created.id}`,
          after: expect.objectContaining({
            code: 'SANGUN-POC',
            tier: UserTier.PRO,
            grant_days: 30,
            grant_until_date: null,
          }) as unknown,
        }),
      ]);
    });

    it('grant_days 와 grant_until_date 를 둘 다 보내면 400 이고 아무것도 저장하지 않는다', async () => {
      // given
      const { world, service } = setup();

      // when
      const work = service.create(
        ACTOR,
        command({ grantDays: 30, grantUntilDate: '2026-12-31' }),
        NOW,
      );

      // then
      await expect(work).rejects.toBeInstanceOf(BadRequestException);
      expect(world.codes).toHaveLength(0);
      expect(world.auditLogs).toHaveLength(0);
    });

    it('grant_days 와 grant_until_date 를 둘 다 비우면 400 이다', async () => {
      // given
      const { service } = setup();

      // when
      const work = service.create(
        ACTOR,
        command({ grantDays: null, grantUntilDate: null }),
        NOW,
      );

      // then
      await expect(work).rejects.toBeInstanceOf(BadRequestException);
    });

    it('grant_until_date 가 오늘(서비스 날짜)보다 앞이면 400 이다', async () => {
      // given
      const { service } = setup();

      // when
      const work = service.create(
        ACTOR,
        command({ grantDays: null, grantUntilDate: '2026-10-09' }),
        NOW,
      );

      // then
      await expect(work).rejects.toBeInstanceOf(BadRequestException);
    });

    it('grant_until_date 가 오늘(서비스 날짜)이면 받아들인다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.create(
        ACTOR,
        command({ grantDays: null, grantUntilDate: '2026-10-10' }),
        NOW,
      );

      // then
      expect(world.codes[0].grantUntilDate).toBe('2026-10-10');
    });

    it('새벽 경계 전(03:30 KST)에는 달력상 어제가 아직 오늘이라 그 날짜를 받아들인다', async () => {
      // given — 10월 10일 03:30 KST 는 서비스 날짜 10-09 다
      const { world, service } = setup();
      const beforeBoundary = new Date('2026-10-09T18:30:00Z');

      // when
      await service.create(
        ACTOR,
        command({ grantDays: null, grantUntilDate: '2026-10-09' }),
        beforeBoundary,
      );

      // then
      expect(world.codes).toHaveLength(1);
    });

    it('입력 기간 시작이 끝과 같으면 400 이다', async () => {
      // given
      const { service } = setup();
      const at = new Date('2026-10-20T00:00:00Z');

      // when
      const work = service.create(
        ACTOR,
        command({ redeemableFrom: at, redeemableUntil: at }),
        NOW,
      );

      // then
      await expect(work).rejects.toBeInstanceOf(BadRequestException);
    });

    it('입력 기간 한쪽만 있으면 순서를 따지지 않고 받아들인다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.create(
        ACTOR,
        command({ redeemableUntil: new Date('2026-10-01T00:00:00Z') }),
        NOW,
      );

      // then
      expect(world.codes).toHaveLength(1);
    });

    it('이미 있는 코드면 409 INVITE_CODE_DUPLICATE 이고 감사 기록을 남기지 않는다', async () => {
      // given
      const { world, service } = setup();
      await service.create(ACTOR, command(), NOW);

      // when
      const error = await service
        .create(ACTOR, command({ name: '두 번째' }), NOW)
        .catch((thrown: unknown) => thrown);

      // then
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(
        ErrorCode.INVITE_CODE_DUPLICATE,
      );
      expect((error as BusinessException).getStatus()).toBe(
        HttpStatus.CONFLICT,
      );
      expect(world.auditLogs).toHaveLength(1);
    });

    it('동시 생성으로 유니크 인덱스(23505)가 막으면 500 이 아니라 409 INVITE_CODE_DUPLICATE 로 바꾼다', async () => {
      // given
      const { world, service } = setup();
      world.nextCreateError = uniqueViolation();

      // when
      const error = await service
        .create(ACTOR, command(), NOW)
        .catch((thrown: unknown) => thrown);

      // then
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(
        ErrorCode.INVITE_CODE_DUPLICATE,
      );
      expect((error as BusinessException).getStatus()).toBe(
        HttpStatus.CONFLICT,
      );
    });

    it('유니크 위반이 아닌 DB 오류는 그대로 올려보낸다', async () => {
      // given
      const { world, service } = setup();
      const other = new QueryFailedError('INSERT', [], {
        code: '23502',
      } as unknown as Error);
      world.nextCreateError = other;

      // when
      const work = service.create(ACTOR, command(), NOW);

      // then
      await expect(work).rejects.toBe(other);
    });
  });

  describe('update', () => {
    async function seeded() {
      const context = setup();
      const created = await context.service.create(
        ACTOR,
        command({
          redeemableFrom: new Date('2026-10-01T00:00:00Z'),
          redeemableUntil: new Date('2026-10-31T00:00:00Z'),
        }),
        NOW,
      );
      context.world.auditLogs = [];
      return { ...context, id: created.id };
    }

    it('보낸 값만 바꾸고 바뀌기 전·후를 담은 수정 감사 기록을 남긴다', async () => {
      // given
      const { world, service, id } = await seeded();

      // when
      const updated = await service.update(ACTOR, id, {
        isActive: false,
        maxRedemptions: 10,
      });

      // then
      expect(updated).toMatchObject({
        isActive: false,
        maxRedemptions: 10,
        name: '산군 PoC',
      });
      expect(world.auditLogs).toEqual([
        expect.objectContaining({
          action: AUDIT_ACTION_INVITE_CODE_UPDATE,
          target: `invite_code:${id}`,
          before: expect.objectContaining({
            is_active: true,
            max_redemptions: null,
          }) as unknown,
          after: expect.objectContaining({
            is_active: false,
            max_redemptions: 10,
          }) as unknown,
        }),
      ]);
    });

    it('시작만 바꿔 기존 끝보다 뒤가 되면 400 이고 코드는 바뀌지 않는다', async () => {
      // given — 끝은 10-31 로 저장돼 있다
      const { world, service, id } = await seeded();

      // when
      const work = service.update(ACTOR, id, {
        redeemableFrom: new Date('2026-11-05T00:00:00Z'),
      });

      // then
      await expect(work).rejects.toBeInstanceOf(BadRequestException);
      expect(world.codes[0].redeemableFrom).toEqual(
        new Date('2026-10-01T00:00:00Z'),
      );
      expect(world.auditLogs).toHaveLength(0);
    });

    it('없는 코드를 고치면 404 INVITE_CODE_NOT_FOUND 다', async () => {
      // given
      const { service } = setup();

      // when
      const error = await service
        .update(ACTOR, 'missing', { name: '새 이름' })
        .catch((thrown: unknown) => thrown);

      // then
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(
        ErrorCode.INVITE_CODE_NOT_FOUND,
      );
      expect((error as BusinessException).getStatus()).toBe(
        HttpStatus.NOT_FOUND,
      );
    });
  });
});
