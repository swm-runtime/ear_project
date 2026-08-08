import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';

import { ContentSaveController } from './controllers/content-save.controller';
import { ExploreController } from './controllers/explore.controller';
import { ExploreOrchestrator } from './explore.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`onboarding` · `library-screen`과 같은 형태 —
 * architecture.md 3.3 · 4.5).
 *
 * 탐색 화면 하나에 다섯 모듈의 데이터가 함께 들어간다 — 콘텐츠·주제·집계(`content`),
 * 라이브러리 상태와 담기/해제(`library`), 오늘 카운트·잔여 표시·소비 신호(`playback`),
 * 관심 주제(`interest`), 담기 해제 시의 드립 영구 제외(`drip`). 어느 한 모듈의 Entity로
 * 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator로 조합한다.
 *
 * `user` · `subscription`을 직접 import 하지 않는 이유: 잔여 재생 표시값은 `playback`이
 * 조립해 내려준다(`PlaybackService.buildQuotaForUser`). 라이브러리와 **같은 조립 경로**를
 * 써야 두 화면이 같은 숫자를 보여준다(explore-api.md 2장).
 */
@Module({
  imports: [
    ContentModule,
    LibraryModule,
    PlaybackModule,
    InterestModule,
    DripModule,
  ],
  controllers: [ExploreController, ContentSaveController],
  providers: [ExploreOrchestrator],
})
export class ExploreModule {}
