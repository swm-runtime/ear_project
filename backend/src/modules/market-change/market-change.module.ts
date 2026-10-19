import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { DripModule } from '@/modules/drip/drip.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { UserModule } from '@/modules/user/user.module';

import { MarketChangeController } from './market-change.controller';
import { MarketChangeOrchestrator } from './market-change.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`onboarding` · `settings`와 같은 형태 — architecture.md 3.3 · 4.5).
 *
 * 시장 전환(`global-api.md` 4.11)은 사용자 행·동의·전환 이력(`user`), 관심 주제(`interest`), 첫 드립 작업(`drip`)을 한 번에 바꾸고
 * 새 access token(`auth`)을 돌려준다. 어느 한 모듈에 넣으면 그 모듈이 나머지를 의존해야 하는데 `interest`·`drip`·`auth`가 이미
 * `user`를 의존해 순환이 된다. 네 모듈 모두 `market-change`를 모르므로 순환은 없다.
 */
@Module({
  imports: [UserModule, InterestModule, DripModule, AuthModule],
  controllers: [MarketChangeController],
  providers: [MarketChangeOrchestrator],
})
export class MarketChangeModule {}
