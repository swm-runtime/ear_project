import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LibraryModule } from '@/modules/library/library.module';
import { UserModule } from '@/modules/user/user.module';

import { DripFeedbackAdminController } from './drip-feedback-admin.controller';
import { DripFeedbackController } from './drip-feedback.controller';
import { DripFeedback } from './drip-feedback.entity';
import { DripFeedbackRepository } from './drip-feedback.repository';
import { DripFeedbackService } from './drip-feedback.service';

/**
 * 추천 온라인 평가(KAN-116) — `drip_feedbacks`(domain.md 6.7)를 소유한다.
 *
 * 편성분 조회는 `library`가, 그만 보기 저장은 `user`(설정)가 소유하므로 그 Service를 쓴다. 어떤 추천 모듈도
 * 이 모듈을 의존하지 않는다 — 별점은 추천 입력이 아니다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DripFeedback]),
    LibraryModule,
    UserModule,
  ],
  controllers: [DripFeedbackController, DripFeedbackAdminController],
  providers: [DripFeedbackRepository, DripFeedbackService],
})
export class DripFeedbackModule {}
