import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AudioDelivery, EnvironmentVariables } from '@/config/env.validation';
import { ContentModule } from '@/modules/content/content.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { NoticeModule } from '@/modules/notice/notice.module';
import { PartnerModule } from '@/modules/partner/partner.module';
import { PlaybackModule } from '@/modules/playback/playback.module';

import { AdminController } from './admin.controller';
import { AudioProbe } from './audio-probe';
import { ContentStorageClient } from './content-storage.client';
import { LocalContentStorageClient } from './local-content-storage.client';
import { S3ContentStorageClient } from './s3-content-storage.client';
import { ThumbnailImage } from './thumbnail-image';
import { AdminContentService } from './services/admin-content.service';
import { AdminSystemStatsService } from './services/admin-system-stats.service';
import { ResourceAlertService } from './services/resource-alert.service';
import { AdminTopicService } from './services/admin-topic.service';
import { AdminNoticeService } from './services/admin-notice.service';
import { TopicExposureService } from './services/topic-exposure.service';
import { TopicExposureScheduler } from './topic-exposure.scheduler';

/**
 * admin.md — Entity를 소유하지 않는 운영 유스케이스 모듈. 콘텐츠·주제·감사 로그는 각 소유
 * 모듈(`content` · `interest` · `partner`)의 Service만 호출한다(architecture.md 4.3).
 * `playback`은 재발행 시 낡은 재생 위치 폐기 때문이다 — `playback`은 admin을 모르므로
 * 순환이 없다.
 *
 * 노출 가능 콘텐츠 0건 주제의 자동 숨김(`TopicExposureService` · 일일 배치)도 여기 둔다 — content ·
 * interest · partner 를 함께 쓰는 판정이라, 이미 셋을 조합하는 이 모듈에 두면 새 의존 방향이 없다.
 *
 * 저장소 구현은 `AUDIO_DELIVERY`가 고른다 — 재생 쪽(`PlaybackModule`)이 같은 값으로
 * 서명 방식을 고르는 것과 짝이다.
 */
@Module({
  imports: [
    ContentModule,
    InterestModule,
    LibraryModule,
    // 공지 관리(KAN-67) — notice 는 admin 을 모르므로 순환이 없다
    NoticeModule,
    PartnerModule,
    PlaybackModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminContentService,
    AdminSystemStatsService,
    AdminTopicService,
    AdminNoticeService,
    TopicExposureService,
    TopicExposureScheduler,
    ResourceAlertService,
    AudioProbe,
    ThumbnailImage,
    {
      provide: ContentStorageClient,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ): ContentStorageClient =>
        configService.get('AUDIO_DELIVERY', { infer: true }) ===
        AudioDelivery.CLOUDFRONT
          ? new S3ContentStorageClient(configService)
          : new LocalContentStorageClient(configService),
    },
  ],
})
export class AdminModule {}
