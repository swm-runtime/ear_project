import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentModule } from '@/modules/content/content.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { UserModule } from '@/modules/user/user.module';

import { ContentReviewAdminController } from './content-review-admin.controller';
import {
  ContentReviewController,
  ContentReviewPromptController,
} from './content-review.controller';
import { ContentReviewRepository } from './content-review.repository';
import { ContentReviewService } from './content-review.service';
import { ContentReview } from './entities/content-review.entity';

/**
 * 콘텐츠 후기(KAN-279) — `content_reviews`(domain.md 6.8)를 소유한다.
 *
 * 의존(domain.md 2장): `content`(편 · 노출) · `library`(완청) · `playback`(재생 시작) · `user`(사용자 잠금 · 먼저 묻기 상태).
 * **어떤 추천 모듈(`drip` · `explore`)도 이 모듈을 의존하지 않는다** — 후기는 추천 입력이 아니다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentReview]),
    ContentModule,
    LibraryModule,
    PlaybackModule,
    UserModule,
  ],
  controllers: [
    ContentReviewController,
    ContentReviewPromptController,
    ContentReviewAdminController,
  ],
  providers: [ContentReviewRepository, ContentReviewService],
  exports: [ContentReviewService],
})
export class ContentReviewModule {}
