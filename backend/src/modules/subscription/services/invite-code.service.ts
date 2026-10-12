import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { InviteCodeRedemption } from '../entities/invite-code-redemption.entity';
import { InviteCode } from '../entities/invite-code.entity';
import {
  generateInviteCode,
  normalizeInviteCode,
  resolveInviteGrantEndsAt,
} from '../policies/invite-code.policy';
import {
  InviteCodeDraft,
  InviteCodeRepository,
  InviteCodeWithUsage,
} from '../repositories/invite-code.repository';
import {
  ActiveInviteGrant,
  UpdateInviteCodeCommand,
} from '../subscription.types';

/** 자동 생성 코드가 기존 코드와 겹칠 때 다시 뽑는 횟수 — 8자 공간에서 겹칠 일은 사실상 없다 */
const GENERATE_ATTEMPTS = 5;

/** 입력 결과 — `created`가 false면 같은 계정이 같은 코드를 다시 보낸 것이다(재전송 — 기존 지급을 그대로 돌려준다) */
export interface InviteRedeemResult {
  grant: ActiveInviteGrant;
  created: boolean;
}

/**
 * 초대 코드(domain.md 8.5·8.6)는 subscription 모듈 소유다 — 구독과 함께 "이 계정이 지금 어느 요금제를 쓰는가"의
 * 원천이라서다. 이 Service는 **행만 다룬다.** `users.tier` 캐시를 맞추는 것은 결제 반영(`BillingSyncService`)이
 * 같은 트랜잭션에서 한다 — subscription 모듈은 `users`를 모른다(architecture.md 4.3).
 */
@Injectable()
export class InviteCodeService {
  constructor(private readonly inviteCodeRepository: InviteCodeRepository) {}

  /** 지금 지급 중인 코드 — 없으면 `null` */
  async findActiveGrant(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<ActiveInviteGrant | null> {
    const row = await this.inviteCodeRepository.findActiveByUserId(
      userId,
      now,
      manager,
    );

    return row === null ? null : toActiveGrant(row, row.inviteCode);
  }

  /**
   * 코드 입력(`subscription-api.md` 4.8). 판정 순서가 곧 에러 우선순위다:
   * 없음·꺼짐 → 이 계정이 쓴 적 있음(지급 중이면 재전송으로 보고 그대로 돌려준다) → 입력 기간 →
   * 다른 지급 진행 중 → 한도 → 지급 마지막 날 경과.
   *
   * 코드 행을 잠그고 판정한다 — 한도가 1 남은 코드에 두 계정이 동시에 들어와도 한 명만 받는다. **호출자가 먼저 사용자 행을
   * 잠가야 한다** — 같은 계정이 다른 코드 두 개를 동시에 넣으면 각자 다른 코드 행만 잠가 "지급은 하나" 확인을 둘 다 통과한다.
   *
   * `subscribedAtStart` — 지금 살아 있는 유료 구독이 있는가(호출자가 구독을 보고 넘긴다 — 이 모듈 안의 순환을 피한다).
   */
  async redeem(
    userId: string,
    rawCode: string,
    subscribedAtStart: boolean,
    now: Date,
    manager: EntityManager,
  ): Promise<InviteRedeemResult> {
    const code = await this.inviteCodeRepository.lockByCode(
      normalizeInviteCode(rawCode),
      manager,
    );

    if (code === null || !code.isActive) {
      throw inviteError(
        HttpStatus.NOT_FOUND,
        ErrorCode.INVITE_CODE_NOT_FOUND,
        '사용할 수 없는 코드예요',
      );
    }

    const existing = await this.inviteCodeRepository.findRedemption(
      code.id,
      userId,
      manager,
    );
    if (existing !== null) {
      if (isActive(existing, now)) {
        return { grant: toActiveGrant(existing, code), created: false };
      }
      throw inviteError(
        HttpStatus.CONFLICT,
        ErrorCode.INVITE_CODE_ALREADY_USED,
        '이미 사용한 코드예요',
      );
    }

    if (
      (code.redeemableFrom !== null && now < code.redeemableFrom) ||
      (code.redeemableUntil !== null && now >= code.redeemableUntil)
    ) {
      throw expired();
    }

    const active = await this.inviteCodeRepository.findActiveByUserId(
      userId,
      now,
      manager,
    );
    if (active !== null) {
      throw inviteError(
        HttpStatus.CONFLICT,
        ErrorCode.INVITE_GRANT_ALREADY_ACTIVE,
        '다른 코드의 혜택이 아직 남아 있어요',
      );
    }

    if (
      code.maxRedemptions !== null &&
      code.redeemedCount >= code.maxRedemptions
    ) {
      throw inviteError(
        HttpStatus.CONFLICT,
        ErrorCode.INVITE_CODE_EXHAUSTED,
        '선착순이 마감된 코드예요',
      );
    }

    const endsAt = resolveInviteGrantEndsAt(code, now);
    if (endsAt <= now) {
      throw expired();
    }

    const redemption = await this.inviteCodeRepository.createRedemption(
      {
        inviteCodeId: code.id,
        userId,
        tier: code.tier,
        startsAt: now,
        endsAt,
        subscribedAtStart,
      },
      manager,
    );
    code.redeemedCount += 1;
    await this.inviteCodeRepository.saveCode(code, manager);

    return { grant: toActiveGrant(redemption, code), created: true };
  }

  /**
   * 지급을 지금 끝낸다 — 지급 기간 중 결제한 구독이 생겼을 때(결제가 지급을 대체한다, `subscription-api.md` 4.8).
   * 캐시는 호출자가 같은 트랜잭션에서 다시 맞추므로 `tier_released_at`도 함께 찍는다.
   */
  async endGrant(
    grant: ActiveInviteGrant,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    grant.redemption.endsAt = now;
    grant.redemption.tierReleasedAt = now;
    await this.inviteCodeRepository.saveRedemption(grant.redemption, manager);
  }

  async findEndedUnreleased(
    now: Date,
    limit: number,
  ): Promise<InviteCodeRedemption[]> {
    return this.inviteCodeRepository.findEndedUnreleased(now, limit);
  }

  async markReleased(
    redemption: InviteCodeRedemption,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    redemption.tierReleasedAt = now;
    await this.inviteCodeRepository.saveRedemption(redemption, manager);
  }

  // --- 관리자 (admin-api.md 4.23) ---

  async listWithUsage(now: Date): Promise<InviteCodeWithUsage[]> {
    return this.inviteCodeRepository.findAllWithUsage(now);
  }

  /** `code`를 비우면 서버가 만든다. 같은 값이 있으면 409 */
  async create(
    draft: Omit<InviteCodeDraft, 'code'> & { code: string | null },
    manager: EntityManager,
  ): Promise<InviteCode> {
    const code =
      draft.code !== null
        ? normalizeInviteCode(draft.code)
        : await this.generateUnusedCode(manager);

    if (await this.inviteCodeRepository.existsByCode(code, manager)) {
      throw inviteError(
        HttpStatus.CONFLICT,
        ErrorCode.INVITE_CODE_DUPLICATE,
        '같은 코드가 이미 있어요',
      );
    }

    return this.inviteCodeRepository.createCode({ ...draft, code }, manager);
  }

  /**
   * 바꿀 수 있는 것은 **앞으로의 입력**에 관한 값뿐이다(이름·켜기/끄기·한도·입력 기간). 코드 값·지급 요금제·지급 기간은
   * 바꾸지 않는다 — 이미 받은 사람과 앞으로 받을 사람이 다른 조건이 되고, 사용자가 받아 적은 코드가 무효가 된다.
   */
  async update(
    id: string,
    command: UpdateInviteCodeCommand,
    manager: EntityManager,
  ): Promise<{ before: InviteCode; after: InviteCode }> {
    const code = await this.inviteCodeRepository.lockById(id, manager);
    if (code === null) {
      throw inviteError(
        HttpStatus.NOT_FOUND,
        ErrorCode.INVITE_CODE_NOT_FOUND,
        '초대 코드를 찾을 수 없어요',
      );
    }
    const before = { ...code };

    if (command.name !== undefined) code.name = command.name;
    if (command.isActive !== undefined) code.isActive = command.isActive;
    if (command.maxRedemptions !== undefined)
      code.maxRedemptions = command.maxRedemptions;
    if (command.redeemableFrom !== undefined)
      code.redeemableFrom = command.redeemableFrom;
    if (command.redeemableUntil !== undefined)
      code.redeemableUntil = command.redeemableUntil;

    return {
      before,
      after: await this.inviteCodeRepository.saveCode(code, manager),
    };
  }

  private async generateUnusedCode(manager: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt += 1) {
      const candidate = generateInviteCode();
      if (!(await this.inviteCodeRepository.existsByCode(candidate, manager))) {
        return candidate;
      }
    }
    throw new Error('invite code generation collided repeatedly');
  }
}

function isActive(redemption: InviteCodeRedemption, now: Date): boolean {
  return redemption.startsAt <= now && now < redemption.endsAt;
}

function toActiveGrant(
  redemption: InviteCodeRedemption,
  code: InviteCode,
): ActiveInviteGrant {
  return { redemption, codeName: code.name };
}

function expired(): BusinessException {
  return inviteError(
    HttpStatus.CONFLICT,
    ErrorCode.INVITE_CODE_EXPIRED,
    '사용 기간이 지난 코드예요',
  );
}

/** 사용자 입력 실수가 대부분이라 info 로 남긴다 — 경보 대상이 아니다 */
function inviteError(
  status: HttpStatus,
  errorCode: ErrorCode,
  message: string,
): BusinessException {
  return new BusinessException({
    status,
    errorCode,
    message,
    logLevel: 'info',
  });
}
