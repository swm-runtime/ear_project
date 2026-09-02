import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { ProfileController } from './profile.controller';
import { ProfileOrchestrator } from './profile.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`onboarding` · `library-screen` · `explore`와
 * 같은 형태 — architecture.md 3.3 · 4.5).
 *
 * 프로필 한 화면에 계정(`users`), 구독·요금제(`subscriptions` · `plans`), 관심사
 * (`user_interests` · `topics`), 완청 수(`library_items`), 청취 통계(`play_records`),
 * 주제 분포 조인(`content_topics`)이 함께 들어간다. 어느 한 모듈의 Entity로 환원되지 않으므로
 * 소유 모듈들 **위에서** Orchestrator가 조합한다.
 *
 * **`user` · `subscription`을 직접 의존한다** — `library-screen` · `explore`가 두 모듈을
 * 피했던 이유는 잔여 재생 표시값을 `playback`이 조립해 주기 때문인데, 프로필이 필요한 것은
 * 그 값이 아니라 **계정 정보와 플랜 카드**다. 티어의 진실의 원천인 `subscriptions`를 직접 읽어야
 * `users.tier` 캐시가 어긋나 있어도 옳은 플랜을 보여줄 수 있다(`profile-api.md` 3장).
 *
 * 여섯 모듈 모두 `profile`을 모르므로 순환은 없다.
 */
@Module({
  imports: [
    UserModule,
    SubscriptionModule,
    InterestModule,
    LibraryModule,
    PlaybackModule,
    ContentModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileOrchestrator],
})
export class ProfileModule {}
