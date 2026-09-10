import { Module } from '@nestjs/common';

import { LibraryModule } from '@/modules/library/library.module';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentEmbedding } from './entities/content-embedding.entity';
import { ContentSource } from './entities/content-source.entity';
import { ContentStat } from './entities/content-stat.entity';
import { ContentTopic } from './entities/content-topic.entity';
import { Content } from './entities/content.entity';
import { ContentRepository } from './repositories/content.repository';
import { ContentEmbeddingRepository } from './repositories/content-embedding.repository';
import { ContentSourceRepository } from './repositories/content-source.repository';
import { ContentStatRepository } from './repositories/content-stat.repository';
import { ContentTopicRepository } from './repositories/content-topic.repository';
import { ContentExpiryScheduler } from './content-expiry.scheduler';
import { ContentService } from './services/content.service';
import { ContentStatService } from './services/content-stat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Content,
      ContentTopic,
      ContentStat,
      ContentSource,
      ContentEmbedding,
    ]),
    // 라이선스 만료 배치가 라이브러리 잔존분을 함께 지운다(partner-control.md 4.4)
    LibraryModule,
  ],
  providers: [
    ContentRepository,
    ContentTopicRepository,
    ContentStatRepository,
    ContentSourceRepository,
    ContentEmbeddingRepository,
    ContentService,
    ContentStatService,
    ContentExpiryScheduler,
  ],
  exports: [ContentService, ContentStatService],
})
export class ContentModule {}
