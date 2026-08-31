import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';

import { ArchiveRepository } from './repositories/archive.repository';
import { ConsentRepository } from './repositories/consent.repository';
import { ConsentService } from './services/consent.service';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { EmailVerificationService } from './services/email-verification.service';
import { DeviceTokenRepository } from './repositories/device-token.repository';
import { DeviceTokenService } from './services/device-token.service';
import { UserOnboardingService } from './services/user-onboarding.service';
import { DeviceToken } from './entities/device-token.entity';
import { ArchivedConsent } from './entities/archived-consent.entity';
import { ArchivedSubscription } from './entities/archived-subscription.entity';
import { ArchivedUser } from './entities/archived-user.entity';
import { Consent } from './entities/consent.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { User } from './entities/user.entity';
import { WithdrawalLog } from './entities/withdrawal-log.entity';
import { EnvironmentVariables, MailDelivery } from '@/config/env.validation';

import { LoggingMailClient, MailClient } from './mail.client';
import { SesMailClient } from './ses-mail.client';
import { JobCategoryController } from './controllers/job-category.controller';
import { UserController } from './controllers/user.controller';
import { UserCareerService } from './services/user-career.service';
import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';
import { UserSetting } from './entities/user-setting.entity';
import { UserSettingRepository } from './repositories/user-setting.repository';
import { UserSettingService } from './services/user-setting.service';
import { WithdrawalLogRepository } from './repositories/withdrawal-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Consent,
      WithdrawalLog,
      EmailVerification,
      DeviceToken,
      UserSetting,
      ArchivedUser,
      ArchivedConsent,
      ArchivedSubscription,
    ]),
    // 탈퇴가 결제 이력을 판정하려면 subscription 모듈의 Service가 필요하다 (auth-api.md 8장)
    SubscriptionModule,
    IdempotencyModule,
  ],
  controllers: [UserController, JobCategoryController],
  providers: [
    UserRepository,
    ConsentRepository,
    EmailVerificationRepository,
    WithdrawalLogRepository,
    ArchiveRepository,
    DeviceTokenRepository,
    UserSettingRepository,
    UserService,
    ConsentService,
    EmailVerificationService,
    UserWithdrawalService,
    UserOnboardingService,
    UserCareerService,
    DeviceTokenService,
    UserSettingService,
    // 발송 방식은 배포 설정이 고른다 — 운영은 ses, 개발 기본은 logging(발송 안 함)
    {
      provide: MailClient,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ): MailClient =>
        configService.get('MAIL_DELIVERY', { infer: true }) === MailDelivery.SES
          ? new SesMailClient(configService)
          : new LoggingMailClient(),
    },
  ],
  exports: [
    UserService,
    ConsentService,
    UserOnboardingService,
    UserSettingService,
  ],
})
export class UserModule {}
