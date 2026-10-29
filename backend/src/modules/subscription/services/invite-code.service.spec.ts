import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { UserTier } from '@/modules/user/user.enum';

import { InviteCodeRedemption } from '../entities/invite-code-redemption.entity';
import { InviteCode } from '../entities/invite-code.entity';
import { InviteCodeRepository } from '../repositories/invite-code.repository';
import { InviteCodeService } from './invite-code.service';

const NOW = new Date('2026-10-10T06:00:00Z'); // 10월 10일 15:00 KST
const MANAGER = {} as EntityManager;

/** 저장소의 메모리 대역 — 판정 규칙은 진짜 Service가 한다 */
class FakeInviteCodeRepository {
  readonly codes: InviteCode[] = [];
  readonly redemptions: InviteCodeRedemption[] = [];

  lockByCode(code: string) {
    return Promise.resolve(this.codes.find((row) => row.code === code) ?? null);
  }
  lockById(id: string) {
    return Promise.resolve(this.codes.find((row) => row.id === id) ?? null);
  }
  existsByCode(code: string) {
    return Promise.resolve(this.codes.some((row) => row.code === code));
  }
  createCode(draft: Partial<InviteCode>) {
    const code = {
      id: `code-${this.codes.length + 1}`,
      redeemedCount: 0,
      isActive: true,
      ...draft,
    } as InviteCode;
    this.codes.push(code);
    return Promise.resolve(code);
  }
  saveCode(code: InviteCode) {
    return Promise.resolve(code);
  }
  findRedemption(inviteCodeId: string, userId: string) {
    return Promise.resolve(
      this.redemptions.find(
        (row) => row.inviteCodeId === inviteCodeId && row.userId === userId,
      ) ?? null,
    );
  }
  findActiveByUserId(userId: string, now: Date) {
    const row = this.redemptions.find(
      (r) => r.userId === userId && r.startsAt <= now && now < r.endsAt,
    );
    return Promise.resolve(
      row
        ? {
            ...row,
            inviteCode: this.codes.find((c) => c.id === row.inviteCodeId),
          }
        : null,
    );
  }
  createRedemption(draft: Partial<InviteCodeRedemption>) {
    const row = {
      id: `redemption-${this.redemptions.length + 1}`,
      tierReleasedAt: null,
      ...draft,
    } as InviteCodeRedemption;
    this.redemptions.push(row);
    return Promise.resolve(row);
  }
}

function setup() {
  const repository = new FakeInviteCodeRepository();
  const service = new InviteCodeService(
    repository as unknown as InviteCodeRepository,
  );
  const addCode = (overrides: Partial<InviteCode> = {}) =>
    repository.createCode({
      code: 'SANGUN-POC',
      name: '산군 PoC',
      tier: UserTier.PRO,
      grantDays: 30,
      grantUntilDate: null,
      maxRedemptions: null,
      redeemableFrom: null,
      redeemableUntil: null,
      ...overrides,
    });
  return { repository, service, addCode };
}

async function expectInviteError(
  work: Promise<unknown>,
  errorCode: ErrorCode,
  status: HttpStatus,
): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error(`expected ${errorCode} but resolved`);
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).errorCode).toBe(errorCode);
  expect((error as BusinessException).getStatus()).toBe(status);
}

describe('InviteCodeService — 코드 입력(subscription-api.md 4.8)', () => {
  it('소문자·공백이 섞여도 같은 코드로 받아 코드의 요금제를 서비스 날짜 경계까지 지급하고 사용 수를 올린다', async () => {
    const { service, addCode, repository } = setup();
    const code = await addCode();

    const result = await service.redeem(
      'user-a',
      ' sangun-poc ',
      false,
      NOW,
      MANAGER,
    );

    expect(result.created).toBe(true);
    expect(result.grant.codeName).toBe('산군 PoC');
    expect(result.grant.redemption).toMatchObject({
      subscribedAtStart: false,
      userId: 'user-a',
      tier: UserTier.PRO,
      startsAt: NOW,
      endsAt: new Date('2026-11-08T19:00:00Z'),
    });
    expect(code.redeemedCount).toBe(1);
    expect(repository.redemptions).toHaveLength(1);
  });

  it('지급 중에 같은 코드를 다시 보내면(재전송) 새로 만들지 않고 기존 지급을 돌려준다', async () => {
    const { service, addCode, repository } = setup();
    const code = await addCode();
    await service.redeem('user-a', 'SANGUN-POC', false, NOW, MANAGER);

    const again = await service.redeem(
      'user-a',
      'SANGUN-POC',
      false,
      NOW,
      MANAGER,
    );

    expect(again.created).toBe(false);
    expect(repository.redemptions).toHaveLength(1);
    expect(code.redeemedCount).toBe(1);
  });

  it('없는 코드·꺼진 코드는 404다', async () => {
    const { service, addCode } = setup();
    await addCode({ code: 'OFF-CODE', isActive: false });

    await expectInviteError(
      service.redeem('user-a', 'NOPE', false, NOW, MANAGER),
      ErrorCode.INVITE_CODE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
    await expectInviteError(
      service.redeem('user-a', 'OFF-CODE', false, NOW, MANAGER),
      ErrorCode.INVITE_CODE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
  });

  it('지급이 끝난 뒤 같은 코드를 다시 쓰면 409 이미 사용이다', async () => {
    const { service, addCode } = setup();
    await addCode({ grantDays: 1 });
    await service.redeem('user-a', 'SANGUN-POC', false, NOW, MANAGER);

    await expectInviteError(
      service.redeem(
        'user-a',
        'SANGUN-POC',
        false,
        new Date('2026-10-12T00:00:00Z'),
        MANAGER,
      ),
      ErrorCode.INVITE_CODE_ALREADY_USED,
      HttpStatus.CONFLICT,
    );
  });

  it('입력 기간 전·마감 뒤, 지급 마지막 날이 지난 코드는 409 기간 만료다', async () => {
    const { service, addCode } = setup();
    await addCode({
      code: 'NOT-YET',
      redeemableFrom: new Date('2026-10-11T00:00:00Z'),
    });
    await addCode({
      code: 'CLOSED',
      redeemableUntil: new Date('2026-10-10T00:00:00Z'),
    });
    await addCode({
      code: 'PAST-END',
      grantDays: null,
      grantUntilDate: '2026-10-09',
    });

    for (const code of ['NOT-YET', 'CLOSED', 'PAST-END']) {
      await expectInviteError(
        service.redeem('user-a', code, false, NOW, MANAGER),
        ErrorCode.INVITE_CODE_EXPIRED,
        HttpStatus.CONFLICT,
      );
    }
  });

  it('다른 코드의 지급이 남아 있으면 409 — 한 계정에 지급은 동시에 하나다', async () => {
    const { service, addCode } = setup();
    await addCode({ code: 'FIRST' });
    await addCode({ code: 'SECOND', tier: UserTier.DAILY });
    await service.redeem('user-a', 'FIRST', false, NOW, MANAGER);

    await expectInviteError(
      service.redeem('user-a', 'SECOND', false, NOW, MANAGER),
      ErrorCode.INVITE_GRANT_ALREADY_ACTIVE,
      HttpStatus.CONFLICT,
    );
  });

  it('사용 한도를 다 쓰면 다음 계정은 409 마감이고 사용 수는 한도를 넘지 않는다', async () => {
    const { service, addCode } = setup();
    const code = await addCode({ maxRedemptions: 1 });
    await service.redeem('user-a', 'SANGUN-POC', false, NOW, MANAGER);

    await expectInviteError(
      service.redeem('user-b', 'SANGUN-POC', false, NOW, MANAGER),
      ErrorCode.INVITE_CODE_EXHAUSTED,
      HttpStatus.CONFLICT,
    );
    expect(code.redeemedCount).toBe(1);
  });
});

describe('InviteCodeService — 관리자 코드 생성·수정(admin-api.md 4.23)', () => {
  it('코드를 비우면 서버가 만들고, 직접 준 값은 대문자로 맞춰 저장하며 같은 값이면 409다', async () => {
    const { service } = setup();
    const base = {
      name: '산군 PoC',
      tier: UserTier.PRO,
      grantDays: 30,
      grantUntilDate: null,
      maxRedemptions: 50,
      redeemableFrom: null,
      redeemableUntil: null,
    };

    const generated = await service.create({ ...base, code: null }, MANAGER);
    const given = await service.create(
      { ...base, code: 'sangun-2026' },
      MANAGER,
    );

    expect(generated.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(given.code).toBe('SANGUN-2026');
    await expectInviteError(
      service.create({ ...base, code: 'SANGUN-2026' }, MANAGER),
      ErrorCode.INVITE_CODE_DUPLICATE,
      HttpStatus.CONFLICT,
    );
  });

  it('수정은 앞으로의 입력에 관한 값만 바꾸고 수정 전 값을 함께 돌려준다', async () => {
    const { service, addCode } = setup();
    const code = await addCode({ maxRedemptions: 10 });

    const { before, after } = await service.update(
      code.id,
      { isActive: false, maxRedemptions: null },
      MANAGER,
    );

    expect(before).toMatchObject({ isActive: true, maxRedemptions: 10 });
    expect(after).toMatchObject({
      isActive: false,
      maxRedemptions: null,
      tier: UserTier.PRO,
      grantDays: 30,
    });
  });
});

describe('InviteCodeService — 내부 캠페인 REVIEW-REWARD(domain.md 8.5 — KAN-279)', () => {
  const reviewReward = {
    code: 'REVIEW-REWARD',
    name: '후기 참여',
    grantDays: 7,
    isActive: false,
  };

  it('코드 입력은 is_active 와 무관하게 없는 코드(404)로 본다 — 운영자가 켜도 열리지 않는다', async () => {
    const { service, addCode, repository } = setup();
    await addCode({ ...reviewReward, isActive: true });

    await expectInviteError(
      service.redeem('user-a', ' review-reward ', false, NOW, MANAGER),
      ErrorCode.INVITE_CODE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
    expect(repository.redemptions).toHaveLength(0);
  });

  it('관리자 수정은 409 CONFLICT 로 거부한다', async () => {
    const { service, addCode } = setup();
    const code = await addCode(reviewReward);

    await expectInviteError(
      service.update(code.id, { isActive: true }, MANAGER),
      ErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
    );
    expect(code.isActive).toBe(false);
  });

  it('프로모션 사용의 지급은 꺼진 코드 행으로도 만들어지고, 초대 코드와 같은 05:00 경계 · 사용 수 규칙을 따른다', async () => {
    const { service, addCode } = setup();
    const code = await addCode(reviewReward);

    const grant = await service.grantReviewReward(
      'user-a',
      { tier: UserTier.PRO, grantDays: 7 },
      true,
      NOW,
      MANAGER,
    );

    expect(grant).toMatchObject({
      codeName: '후기 참여',
      code: 'REVIEW-REWARD',
    });
    expect(grant.redemption).toMatchObject({
      inviteCodeId: code.id,
      userId: 'user-a',
      tier: UserTier.PRO,
      startsAt: NOW,
      subscribedAtStart: true,
    });
    // 10-10 을 1일째로 7일 → 10-17 서비스 날짜 시작(이 테스트는 04:00 경계)
    expect(grant.redemption.endsAt).toEqual(new Date('2026-10-16T19:00:00Z'));
    expect(code.redeemedCount).toBe(1);
  });

  it('코드 행이 없으면(마이그레이션 누락) 지급을 만들지 않고 실패한다', async () => {
    const { service } = setup();

    await expect(
      service.grantReviewReward(
        'user-a',
        { tier: UserTier.PRO, grantDays: 7 },
        false,
        NOW,
        MANAGER,
      ),
    ).rejects.toThrow('REVIEW-REWARD');
  });
});
