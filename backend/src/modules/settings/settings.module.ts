import { Module } from '@nestjs/common';

import { InterestModule } from '@/modules/interest/interest.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { SettingsController } from './settings.controller';
import { SettingsOrchestrator } from './settings.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(`onboarding` · `library-screen` · `explore` ·
 * `profile`과 같은 형태 — architecture.md 3.3 · 4.5).
 *
 * 설정 화면 하나에 계정·설정값·동의(`user` 소유), 구독·요금제(`subscription` 소유),
 * 관심 주제 요약(`interest` 소유)이 함께 들어간다. 어느 한 모듈의 Entity로 환원되지 않으므로
 * 소유 모듈들 **위에서** Orchestrator가 조합한다.
 *
 * **`user_settings`는 이 모듈이 아니라 `user` 모듈이 소유한다**(domain.md 2장). 설정 화면이
 * 그 테이블의 주 사용처이지만, 소유는 화면이 아니라 데이터 기준으로 나눈다(architecture.md 4.1) —
 * 배속은 플레이어도 읽고, `sleep_timer_last_choice`는 애초에 이 화면이 다루지 않는다.
 *
 * 세 모듈 모두 `settings`를 모르므로 순환은 없다.
 */
@Module({
  imports: [UserModule, SubscriptionModule, InterestModule],
  controllers: [SettingsController],
  providers: [SettingsOrchestrator],
})
export class SettingsModule {}
