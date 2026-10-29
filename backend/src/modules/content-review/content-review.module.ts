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
import { Promotion } from './entities/promotion.entity';
import { PromotionRepository } from './promotion.repository';
import { PromotionService } from './promotion.service';

/**
 * 콘텐츠 후기(KAN-279) — `content_reviews`(domain.md 6.8) · `promotions`(8.7)를 소유한다.
 *
 * 의존(domain.md 2장): `content`(편 · 노출) · `library`(완청) · `playback`(재생 시작) · `user`(사용자 잠금 · 먼저 묻기 상태).
 * **어떤 추천 모듈(`drip` · `explore`)도 이 모듈을 의존하지 않는다** — 후기는 추천 입력이 아니다.
 *
 * 후기 저장(`PUT /contents/:contentId/review`) · 프로모션 화면 · 사용 경로는 `billing`에 있다 — 응답의 프로모션(쓸 수 있는지 ·
 * 사유 · 요금제 이름)과 지급이 구독 상태를 알아야 하는데, 이 모듈은 `subscription`을 의존하지 않는다(domain.md 2장).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentReview, Promotion]),
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
  providers: [
    ContentReviewRepository,
    ContentReviewService,
    PromotionRepository,
    PromotionService,
  ],
  // 후기 저장의 발급 결과 조립 · 프로모션 화면 · 사용(지급)은 `billing`이 이 둘과 `subscription` · `user`를 조합한다
  exports: [ContentReviewService, PromotionService],
})
export class ContentReviewModule {}
