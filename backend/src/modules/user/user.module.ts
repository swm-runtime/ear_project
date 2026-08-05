import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';

import { ArchiveRepository } from './repositories/archive.repository';
import { ConsentRepository } from './repositories/consent.repository';
import { ConsentService } from './services/consent.service';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { EmailVerificationService } from './services/email-verification.service';
import { ArchivedConsent } from './entities/archived-consent.entity';
import { ArchivedSubscription } from './entities/archived-subscription.entity';
import { ArchivedUser } from './entities/archived-user.entity';
import { Consent } from './entities/consent.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { User } from './entities/user.entity';
import { WithdrawalLog } from './entities/withdrawal-log.entity';
import { LoggingMailClient, MailClient } from './mail.client';
import { UserController } from './user.controller';
import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';
import { UserWithdrawalService } from './services/user-withdrawal.service';
import { WithdrawalLogRepository } from './repositories/withdrawal-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Consent,
      WithdrawalLog,
      EmailVerification,
      ArchivedUser,
      ArchivedConsent,
      ArchivedSubscription,
    ]),
    // 탈퇴가 결제 이력을 판정하려면 subscription 모듈의 Service가 필요하다 (auth-api.md 8장)
    SubscriptionModule,
    IdempotencyModule,
  ],
  controllers: [UserController],
  providers: [
    UserRepository,
    ConsentRepository,
    EmailVerificationRepository,
    WithdrawalLogRepository,
    ArchiveRepository,
    UserService,
    ConsentService,
    EmailVerificationService,
    UserWithdrawalService,
    // 발송 인프라가 확정되면 이 바인딩만 교체한다 (mail.client.ts 주석)
    { provide: MailClient, useClass: LoggingMailClient },
  ],
  exports: [UserService, ConsentService],
})
export class UserModule {}
