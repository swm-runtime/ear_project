import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';

import { ContentDetailController } from './content-detail.controller';
import { ContentDetailOrchestrator } from './content-detail.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`library-screen` · `explore`와 같은 형태 —
 * architecture.md 3.3 · 4.5).
 *
 * 상세 화면 하나에 세 모듈의 데이터가 함께 들어간다 — 콘텐츠 메타·주제·소스 목록
 * (`content`), 담김 여부(`library`), 재청취 창 힌트(`playback`). 어느 한 모듈의 Entity로
 * 환원되지 않으므로 소유 모듈들 **위에서** Orchestrator로 조합한다.
 *
 * 액션은 전부 기존 계약의 재사용이라(content-detail-api.md 1장) 이 모듈에 쓰기 경로가 없다.
 */
@Module({
  imports: [ContentModule, LibraryModule, PlaybackModule],
  controllers: [ContentDetailController],
  providers: [ContentDetailOrchestrator],
})
export class ContentDetailModule {}
