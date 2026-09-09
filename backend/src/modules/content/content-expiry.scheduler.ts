import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ContentService } from './services/content.service';

/**
 * 라이선스 만료 전환 배치 — `partner-control.md` 4.4 "만료일이 지나면 배치가 `status = expired`로
 * 전환하고 회수와 동일한 노출 제외를 수행한다"의 실행부다(FR-33).
 *
 * 이 배치가 없던 동안 `expired`를 만드는 경로가 코드에 없었다(2026-09-09 감사). 노출 조회는
 * `applyVisibility`가 만료일로 걸러 왔지만 재생·서명 URL 발급 게이트는 status만 봐서, 계약이
 * 끝난 파트너 콘텐츠가 라이브러리에서 무기한 재생됐다. 게이트에도 만료 검사를 넣었으므로
 * 이 배치는 "노출면 전체를 한 상태로 정리"하는 역할이다 — 하루 1회로 충분하다.
 *
 * 04:10 KST — 서비스 날짜 경계(04:00) 직후, 통계 집계(04:00)·드립 편성(05:00) 사이. 편성이
 * 후보를 뽑기 전에 만료분이 `expired`로 빠져야 한다.
 *
 * 라이브러리 잔존분은 건드리지 않는다 — 4.4 미결(`changes/pending/license-expiry-library-handling.md`).
 */
@Injectable()
export class ContentExpiryScheduler {
  private readonly logger = new Logger(ContentExpiryScheduler.name);

  constructor(private readonly contentService: ContentService) {}

  @Cron('10 4 * * *', {
    name: 'content-license-expiry',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    try {
      const expiredCount = await this.contentService.expireLicensed(new Date());

      if (expiredCount > 0) {
        this.logger.log('licensed contents expired', {
          expired_count: expiredCount,
        });
      }
    } catch (error) {
      // 던지면 스케줄러가 멈춘다 — 다음 날 다시 시도하고, 그 사이는 게이트의 만료 검사가 막는다
      this.logger.error(
        'content license expiry failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
