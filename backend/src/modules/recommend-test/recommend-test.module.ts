import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripBatchModule } from '@/modules/drip-batch/drip-batch.module';
import { ExploreModule } from '@/modules/explore/explore.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryScreenModule } from '@/modules/library-screen/library-screen.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { UserModule } from '@/modules/user/user.module';

import { RecommendTestController } from './recommend-test.controller';
import { RecommendTestService } from './recommend-test.service';

/**
 * 추천 테스트 콘솔(개발계 전용) — **Entity를 소유하지 않는 유스케이스 모듈**이다(architecture.md 3.3).
 *
 * 앱이 추천에 남기는 행동(재생·완청·담기·해제·삭제·재청취·관심 주제·커리어)을 테스트 계정에 대신 수행하려면
 * 그 행동을 소유한 모듈 전부의 **같은 서비스 메서드**가 필요하다 — 그래서 다른 어떤 모듈보다 위에 있고,
 * 어떤 모듈도 이 모듈을 의존하지 않는다. 신호를 직접 적재하는 지름길을 만들지 않는다.
 */
@Module({
  imports: [
    UserModule,
    InterestModule,
    ContentModule,
    LibraryModule,
    PlaybackModule,
    ExploreModule,
    LibraryScreenModule,
    DripBatchModule,
  ],
  controllers: [RecommendTestController],
  providers: [RecommendTestService],
})
export class RecommendTestModule {}
