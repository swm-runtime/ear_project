import { Module } from '@nestjs/common';
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
  ],
  providers: [
    ContentRepository,
    ContentTopicRepository,
    ContentStatRepository,
    ContentSourceRepository,
    ContentEmbeddingRepository,
    ContentService,
    ContentStatService,
  ],
  exports: [ContentService, ContentStatService],
})
export class ContentModule {}
