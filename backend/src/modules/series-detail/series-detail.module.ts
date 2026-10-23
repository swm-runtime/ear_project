import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';

import { SeriesDetailController } from './series-detail.controller';
import { SeriesDetailOrchestrator } from './series-detail.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`content-detail`과 같은 형태 — architecture.md 3.3 · 4.5).
 * 시리즈 화면 하나에 세 모듈의 데이터가 함께 들어간다 — 시리즈·편 메타(`content`), 담김·완청(`library`),
 * 재생 위치·재청취 창 힌트(`playback`). 어떤 모듈도 이 모듈을 의존하지 않는다.
 *
 * 시리즈째 담기·빼기·복구(KAN-245)는 편 담기·해제 규칙을 편마다 그대로 부른다 — 해제가 드립 영구 제외(`drip`)를 건드리므로
 * `DripModule`을 함께 쓴다(라이브러리 화면 `library-screen`과 같은 조합).
 */
@Module({
  imports: [ContentModule, LibraryModule, PlaybackModule, DripModule],
  controllers: [SeriesDetailController],
  providers: [SeriesDetailOrchestrator],
})
export class SeriesDetailModule {}
