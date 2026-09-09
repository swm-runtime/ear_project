import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  SESSION_PURGE_INTERVAL_MS,
  SESSION_RETENTION_MS,
} from './auth.constant';
import { SessionRepository } from './session.repository';

/**
 * 만료·폐기 후 보존 기간이 지난 세션을 지운다 — `sessions`의 **유일한 삭제 경로**다.
 *
 * refresh 회전은 매번 새 행을 만들고(`AuthService.issueSession`) 폐기는 `revoked_at`
 * 마킹뿐이라, 활성 기기당 access TTL(30분) 주기로 하루 수십 행이 영구 누적됐다
 * (2026-09-09 감사). `findByRefreshTokenHash`가 매 갱신마다 이 테이블을 조회하므로
 * 성장은 조회 비용으로도 돌아온다.
 *
 * 보존 기간은 refresh TTL과 같다 — 재사용(탈취) 탐지가 폐기 이력을 보는 창이 그 길이다.
 * 기한의 근거와 domain.md 12.1 개정은 `changes/pending/sessions-retention-period.md`.
 *
 * 다중 인스턴스가 동시에 돌아도 안전하다. 같은 조건의 DELETE라 겹치면 지울 것이 없을 뿐이다.
 */
@Injectable()
export class SessionPurgeScheduler {
  private readonly logger = new Logger(SessionPurgeScheduler.name);

  constructor(private readonly sessionRepository: SessionRepository) {}

  @Interval('session-purge', SESSION_PURGE_INTERVAL_MS)
  async purgeInactive(): Promise<void> {
    const before = new Date(Date.now() - SESSION_RETENTION_MS);

    try {
      const deletedCount =
        await this.sessionRepository.deleteInactiveBefore(before);

      if (deletedCount > 0) {
        this.logger.log('inactive sessions purged', {
          deleted_count: deletedCount,
        });
      }
    } catch (error) {
      // 실패해도 다음 주기가 다시 시도한다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'failed to purge inactive sessions',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
