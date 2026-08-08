import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';

import { LibraryScreenController } from './library-screen.controller';
import { LibraryScreenOrchestrator } from './library-screen.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`onboarding`과 같은 형태 —
 * architecture.md 3.3 · 4.5).
 *
 * 라이브러리 화면은 `library_items` 하나로 그려지지 않는다. 목록에는 재생 위치와 오늘
 * 카운트(`playback` 소유)가, 앱바에는 재생 한도(`subscription` 소유)가 함께 나가고,
 * 삭제는 드립 영구 제외(`drip` 소유)까지 건드린다.
 *
 * 이걸 `library` 모듈에 넣지 않는 이유는 순환 때문이다 — `library-api.md` 8장이
 * **`playback` → `library`**(재생 시작이 라이브러리 상태 전이를 호출한다)와
 * "`library` 모듈은 `content` · `user`에만 의존한다"를 함께 정하고 있어서, `library`가
 * `playback`을 의존하면 양방향이 된다(`forwardRef` 금지 — architecture.md 4.3).
 * 그래서 두 모듈 **위에서** Orchestrator로 조합한다.
 *
 * **`subscription` · `user`를 import 하지 않는다.** 앱바의 잔여 재생 표시값은 티어·요금제
 * 한도까지 포함해 `PlaybackService.buildQuotaForUser`가 조립해 주고, 탐색 화면도 같은
 * 함수를 호출한다(`explore-api.md` 2장 — 두 화면이 같은 숫자를 보여야 한다).
 */
@Module({
  imports: [LibraryModule, PlaybackModule, ContentModule, DripModule],
  controllers: [LibraryScreenController],
  providers: [LibraryScreenOrchestrator],
})
export class LibraryScreenModule {}
