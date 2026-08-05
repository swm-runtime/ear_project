import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Topic } from './entities/topic.entity';
import { UserInterest } from './entities/user-interest.entity';
import { TopicRepository } from './repositories/topic.repository';
import { UserInterestRepository } from './repositories/user-interest.repository';
import { TopicService } from './services/topic.service';
import { UserInterestService } from './services/user-interest.service';

@Module({
  imports: [TypeOrmModule.forFeature([Topic, UserInterest])],
  providers: [
    TopicRepository,
    UserInterestRepository,
    TopicService,
    UserInterestService,
  ],
  exports: [TopicService, UserInterestService],
})
export class InterestModule {}
