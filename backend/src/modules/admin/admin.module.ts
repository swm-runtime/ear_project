import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AudioDelivery, EnvironmentVariables } from '@/config/env.validation';
import { ContentModule } from '@/modules/content/content.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PartnerModule } from '@/modules/partner/partner.module';

import { AdminController } from './admin.controller';
import { AudioProbe } from './audio-probe';
import { ContentStorageClient } from './content-storage.client';
import { LocalContentStorageClient } from './local-content-storage.client';
import { S3ContentStorageClient } from './s3-content-storage.client';
import { AdminContentService } from './services/admin-content.service';
import { AdminTopicService } from './services/admin-topic.service';

/**
 * admin.md — Entity를 소유하지 않는 운영 유스케이스 모듈. 콘텐츠·주제·감사 로그는 각 소유
 * 모듈(`content` · `interest` · `partner`)의 Service만 호출한다(architecture.md 4.3).
 *
 * 저장소 구현은 `AUDIO_DELIVERY`가 고른다 — 재생 쪽(`PlaybackModule`)이 같은 값으로
 * 서명 방식을 고르는 것과 짝이다.
 */
@Module({
  imports: [ContentModule, InterestModule, LibraryModule, PartnerModule],
  controllers: [AdminController],
  providers: [
    AdminContentService,
    AdminTopicService,
    AudioProbe,
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
