import { Module } from '@nestjs/common';

import { RetentionPurgeScheduler } from './retention-purge.scheduler';
import { RetentionRepository } from './retention.repository';
import { RetentionService } from './retention.service';

/**
 * `domain.md` 12.1의 보존 기간을 집행하는 배치 모듈.
 *
 * **Entity를 소유하지 않는다**(architecture.md 4.5의 `DripBatch` · `Onboarding`과 같은 자리).
 * 지우는 네 테이블의 소유자는 `playback`(`user_signals` · `audio_access_logs` ·
 * `source_link_clicks`)과 아직 코드가 없는 알림 영역(`notification_logs`)이지만,
 * **보존 기간은 어느 한 도메인의 규칙이 아니라 12.1 표 하나의 규칙이다.** 소유 모듈마다
 * 나눠 두면 표가 네 조각으로 쪼개져 문서와 대조할 수 없게 된다.
 *
 * 어떤 모듈도 이 모듈을 의존하지 않는다. 이 모듈도 다른 모듈을 의존하지 않는다 —
 * 삭제 조건이 `created_at` 하나뿐이라 도메인 판정이 없기 때문이다.
 */
@Module({
  providers: [RetentionRepository, RetentionService, RetentionPurgeScheduler],
})
export class RetentionModule {}
