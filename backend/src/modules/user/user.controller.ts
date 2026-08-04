import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '@/modules/idempotency/idempotency.interceptor';

import { ConsentService } from './services/consent.service';
import { GetActiveEmailVerificationResponseDto } from './dto/get-active-email-verification-response.dto';
import { GetWithdrawalPreviewResponseDto } from './dto/get-withdrawal-preview-response.dto';
import { SendEmailVerificationRequestDto } from './dto/send-email-verification-request.dto';
import { SendEmailVerificationResponseDto } from './dto/send-email-verification-response.dto';
import { UpdateConsentsRequestDto } from './dto/update-consents-request.dto';
import { UpdateConsentsResponseDto } from './dto/update-consents-response.dto';
import { VerifyEmailVerificationRequestDto } from './dto/verify-email-verification-request.dto';
import { VerifyEmailVerificationResponseDto } from './dto/verify-email-verification-response.dto';
import { WithdrawUserRequestDto } from './dto/withdraw-user-request.dto';
import { EmailVerificationService } from './services/email-verification.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';

/**
 * auth-api.md 3장 — 내 리소스는 `me`를 쓴다.
 * 경로에 `userId`를 받지 않고 토큰에서 꺼낸 값으로 스코프한다 (architecture.md 9.2).
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly consentService: ConsentService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly userWithdrawalService: UserWithdrawalService,
  ) {}

  @Post('consents')
  @HttpCode(HttpStatus.OK)
  async updateConsents(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: UpdateConsentsRequestDto,
  ): Promise<UpdateConsentsResponseDto> {
    await this.consentService.recordConsents(
      currentUser.id,
      request.consents.map((consent) => ({
        consentType: consent.consent_type,
        version: consent.version ?? null,
        isAgreed: consent.is_agreed,
      })),
      new Date(),
    );

    return UpdateConsentsResponseDto.from(
      await this.consentService.findCurrentStates(currentUser.id),
    );
  }

  @Get('withdrawal-preview')
  async getWithdrawalPreview(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetWithdrawalPreviewResponseDto> {
    return GetWithdrawalPreviewResponseDto.from(
      await this.userWithdrawalService.getPreview(currentUser.id),
    );
  }

  @Post('withdraw')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdrawUser(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: WithdrawUserRequestDto,
  ): Promise<void> {
    await this.userWithdrawalService.withdraw(
      {
        userId: currentUser.id,
        reasonCode: request.reason_code ?? null,
        reasonText: request.reason_text ?? null,
        confirm: request.confirm,
        agreedSubscriptionExpiry: request.agreed_subscription_expiry ?? false,
      },
      new Date(),
    );
  }

  // 연타로 발송 횟수가 소모되는 것을 막는다 (auth-api.md 4.8 ★)
  @Post('email-verifications')
  @UseInterceptors(IdempotencyInterceptor)
  async sendEmailVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: SendEmailVerificationRequestDto,
  ): Promise<SendEmailVerificationResponseDto> {
    return SendEmailVerificationResponseDto.from(
      await this.emailVerificationService.sendCode(
        currentUser.id,
        request.email,
        new Date(),
      ),
    );
  }

  @Get('email-verifications/active')
  async getActiveEmailVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetActiveEmailVerificationResponseDto> {
    return GetActiveEmailVerificationResponseDto.from(
      await this.emailVerificationService.findActive(
        currentUser.id,
        new Date(),
      ),
    );
  }

  @Post('email-verifications/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') verificationId: string,
    @Body() request: VerifyEmailVerificationRequestDto,
  ): Promise<VerifyEmailVerificationResponseDto> {
    return VerifyEmailVerificationResponseDto.from(
      await this.emailVerificationService.verifyCode(
        currentUser.id,
        verificationId,
        request.code,
        new Date(),
      ),
    );
  }

  @Delete('email-verifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async invalidateEmailVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') verificationId: string,
  ): Promise<void> {
    await this.emailVerificationService.invalidate(
      currentUser.id,
      verificationId,
      new Date(),
    );
  }
}
