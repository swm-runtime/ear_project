import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserModule } from '@/modules/user/user.module';

import { Topic } from './entities/topic.entity';
import { UserInterest } from './entities/user-interest.entity';
import { InterestController } from './interest.controller';
import { PublicTopicController } from './public-topic.controller';
import { TopicRepository } from './repositories/topic.repository';
import { UserInterestRepository } from './repositories/user-interest.repository';
import { TopicService } from './services/topic.service';
import { UserInterestService } from './services/user-interest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Topic, UserInterest]),
    // 관심사 교체가 같은 사용자의 동시 저장을 직렬화하려면 사용자 행을 잠가야 한다
    // (interest-management.md 7 — last-write-wins)
    UserModule,
  ],
  // 공개 주제 목록(랜딩 빌드용, 인증 없음) — public-api.md
  controllers: [InterestController, PublicTopicController],
  providers: [
    TopicRepository,
    UserInterestRepository,
    TopicService,
    UserInterestService,
  ],
  exports: [TopicService, UserInterestService],
})
export class InterestModule {}
