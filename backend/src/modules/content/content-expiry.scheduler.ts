import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DataSource } from 'typeorm';

import { LibraryService } from '@/modules/library/library.service';

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
 * **라이브러리 잔존분도 회수와 같이 지운다**(4.4 확정 2026-09-10, 종전 미결). 목록에 남겨 두면
 * 제공이 끝난 콘텐츠가 계속 노출되어 파트너 계약상 문제가 될 소지가 있고, 사용자에게는
 * 눌러도 재생되지 않는 항목이 쌓인다.
 *
 * **soft delete다.** 행이 남아야 드립 후보 필터(`deleted_at` 여부를 보지 않는다)가 재적립을
 * 계속 막는다 — 라이선스가 갱신돼 다시 발행돼도 이미 받았던 사용자에게 두 번 가지 않는다.
 * 취향 신호(`user_signals`·`play_records`)는 건드리지 않으므로 추천 입력도 그대로다.
 */
@Injectable()
export class ContentExpiryScheduler {
  private readonly logger = new Logger(ContentExpiryScheduler.name);

  constructor(
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('10 4 * * *', {
    name: 'content-license-expiry',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    const now = new Date();

    try {
      /**
       * **상태 전환과 라이브러리 삭제를 한 트랜잭션에서 한다.** 나눠 하면 전환만 되고
       * 삭제가 실패한 상태가 남아, 목록에 눌러도 안 되는 항목이 그대로 있게 된다.
       * 재실행하면 그 콘텐츠는 이미 `expired`라 조건에 걸리지 않아 영영 정리되지 않는다.
       */
      const { expiredIds, removedItemCount } =
        await this.dataSource.transaction(async (manager) => {
          const ids = await this.contentService.expireLicensed(now, manager);
          let removed = 0;

          for (const contentId of ids) {
            removed += await this.libraryService.removeAllByWithdrawnContent(
              contentId,
              now,
              manager,
            );
          }

          return { expiredIds: ids, removedItemCount: removed };
        });

      if (expiredIds.length > 0) {
        this.logger.log('licensed contents expired', {
          expired_count: expiredIds.length,
          removed_library_item_count: removedItemCount,
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
