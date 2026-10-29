import { Module } from '@nestjs/common';

import { LibraryModule } from '@/modules/library/library.module';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentAudioRendition } from './entities/content-audio-rendition.entity';
import { ContentEmbedding } from './entities/content-embedding.entity';
import { ContentScript } from './entities/content-script.entity';
import { ContentSource } from './entities/content-source.entity';
import { ContentStat } from './entities/content-stat.entity';
import { ContentTitleEmbedding } from './entities/content-title-embedding.entity';
import { ContentTopic } from './entities/content-topic.entity';
import { Content } from './entities/content.entity';
import { SearchQueryLog } from './entities/search-query-log.entity';
import { Series } from './entities/series.entity';
import { SeriesRepository } from './repositories/series.repository';
import { SeriesService } from './services/series.service';
import { ContentRepository } from './repositories/content.repository';
import { ContentAudioRenditionRepository } from './repositories/content-audio-rendition.repository';
import { ContentEmbeddingRepository } from './repositories/content-embedding.repository';
import { ContentScriptRepository } from './repositories/content-script.repository';
import { ContentSourceRepository } from './repositories/content-source.repository';
import { ContentStatRepository } from './repositories/content-stat.repository';
import { ContentTitleEmbeddingRepository } from './repositories/content-title-embedding.repository';
import { ContentTopicRepository } from './repositories/content-topic.repository';
import { SearchQueryLogRepository } from './repositories/search-query-log.repository';
import { ContentExpiryScheduler } from './content-expiry.scheduler';
import { SearchQueryLogAdminController } from './search-query-log-admin.controller';
import { ContentCohortService } from './services/content-cohort.service';
import { ContentService } from './services/content.service';
import { ContentStatService } from './services/content-stat.service';
import { ContentTitleEmbeddingService } from './services/content-title-embedding.service';
import { SearchQueryLogService } from './services/search-query-log.service';
import { TextEmbeddingClient } from './text-embedding.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Content,
      ContentTopic,
      ContentStat,
      ContentSource,
      ContentEmbedding,
      ContentTitleEmbedding,
      ContentAudioRendition,
      ContentScript,
      SearchQueryLog,
      Series,
    ]),
    // 라이선스 만료 배치가 라이브러리 잔존분을 함께 지운다(partner-control.md 4.4)
    LibraryModule,
  ],
  controllers: [SearchQueryLogAdminController],
  providers: [
    ContentRepository,
    ContentTopicRepository,
    ContentStatRepository,
    ContentSourceRepository,
    ContentEmbeddingRepository,
    ContentTitleEmbeddingRepository,
    ContentAudioRenditionRepository,
    ContentScriptRepository,
    SearchQueryLogRepository,
    SeriesRepository,
    ContentService,
    ContentStatService,
    SearchQueryLogService,
    SeriesService,
    ContentExpiryScheduler,
    TextEmbeddingClient,
    ContentTitleEmbeddingService,
    ContentCohortService,
  ],
  exports: [
    ContentService,
    ContentStatService,
    // 발행·재발행 뒤 제목 임베딩(admin) · 백필 스크립트
    ContentTitleEmbeddingService,
    SearchQueryLogService,
    SeriesService,
    // 짧은 판 코호트(KAN-298) — 노출면이 사용자 코호트를 여기서만 묻는다
    ContentCohortService,
  ],
})
export class ContentModule {}
