import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  RATE_LIMIT_INVITE_CODE_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '@/common/rate-limit.constant';

import { BillingOrchestrator } from '../billing.orchestrator';
import { CreatePurchaseIntentRequestDto } from '../dto/create-purchase-intent-request.dto';
import { CreatePurchaseIntentResponseDto } from '../dto/create-purchase-intent-response.dto';
import { RedeemInviteCodeRequestDto } from '../dto/redeem-invite-code-request.dto';
import { RestorePurchasesRequestDto } from '../dto/restore-purchases-request.dto';
import { RestorePurchasesResponseDto } from '../dto/restore-purchases-response.dto';
import { SubmitPurchaseRequestDto } from '../dto/submit-purchase-request.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';

/**
 * subscription-api.md 4.2~4.5.
 *
 * **해지 엔드포인트가 없다** — 스토어 구독은 앱이 해지할 수 없다. 앱은 스토어로 보내고 결과는 서버 알림으로
 * 들어온다(4.6). **`Idempotency-Key`도 쓰지 않는다** — 영수증 제출·복원은 스토어 거래 ID가 자연 키라
 * 같은 거래의 재전송이 같은 상태로 수렴한다(2장).
 */
@Controller('users/me/subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly billingOrchestrator: BillingOrchestrator) {}

  /** 앱 실행·포그라운드 복귀 시의 동기화(4.2). 구독 상태는 캐시하지 않는다 */
  @Get()
  @Header('Cache-Control', 'no-store')
  async get(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.billingOrchestrator.getSubscription(
        currentUser.id,
        new Date(),
      ),
    );
  }

  /** 결제 시트를 열기 직전(4.3) */
  @Post('purchase-intents')
  @HttpCode(HttpStatus.CREATED)
  async createPurchaseIntent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: CreatePurchaseIntentRequestDto,
  ): Promise<CreatePurchaseIntentResponseDto> {
    return CreatePurchaseIntentResponseDto.from(
      await this.billingOrchestrator.createPurchaseIntent({
        userId: currentUser.id,
        planId: request.plan_id,
        platform: request.platform,
        entryPoint: request.entry_point ?? null,
      }),
    );
  }

  /** 영수증 제출(4.4) — 200을 받은 뒤에만 클라이언트가 거래를 끝낸다 */
  @Post('purchases')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async submitPurchase(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: SubmitPurchaseRequestDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.billingOrchestrator.submitPurchase({
        userId: currentUser.id,
        platform: request.platform,
        signedTransaction: request.signed_transaction ?? null,
        purchaseToken: request.purchase_token ?? null,
        now: new Date(),
      }),
    );
  }

  /** 구매 복원(4.5) */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async restore(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: RestorePurchasesRequestDto,
  ): Promise<RestorePurchasesResponseDto> {
    return RestorePurchasesResponseDto.from(
      await this.billingOrchestrator.restorePurchases({
        userId: currentUser.id,
        platform: request.platform,
        signedTransactions: request.signed_transactions ?? [],
        purchaseTokens: (request.purchases ?? []).map(
          (purchase) => purchase.purchase_token,
        ),
        now: new Date(),
      }),
    );
  }

  /**
   * 초대 코드 입력(4.8) — 지급하고 그 결과의 구독 상태를 돌려준다(`plan.grant`). 같은 계정이 같은 코드를 다시 보내면
   * 지급 중인 한 같은 결과다(재전송 안전 — 멱등키를 쓰지 않는다). 사용자 단위 분당 10회(`architecture.md` 9.6).
   */
  @Post('invite-codes')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({
    default: {
      limit: RATE_LIMIT_INVITE_CODE_PER_MINUTE,
      ttl: RATE_LIMIT_WINDOW_MS,
    },
  })
  async redeemInviteCode(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: RedeemInviteCodeRequestDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.billingOrchestrator.redeemInviteCode(
        currentUser.id,
        request.code,
        new Date(),
      ),
    );
  }
}
