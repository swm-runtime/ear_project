import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryService } from '@/modules/library/library.service';

import { UserSignalAction } from '../playback.enum';
import { StartPlayCommand, StartPlayResult } from '../playback.types';
import { PlaybackService } from './playback.service';
import { PlayPolicyService } from './play-policy.service';

/**
 * 재생 시작(library-api.md 4.4) — **한도 판정과 카운트 적재가 여기서 일어난다.**
 *
 * 라이브러리·탐색·미니플레이어·푸시가 **같은 경로를 쓴다.** 진입점마다 경로를 나누면
 * 한도가 경로별로 새는 구멍이 된다(`paywall.md` 4.2).
 *
 * 판정 규칙 자체는 이 코드가 소유하지 않는다 — `ALLOW` / `BLOCKED` / `LIMIT_REACHED`의
 * 기준과 차감 단위, 04시 경계는 전부 `paywall.md` 4.1~4.4가 정한다.
 *
 * Orchestrator가 아니라 Service인 이유: 자기 Entity(`play_records` · `user_signals`)를
 * 쓰는 단일 트랜잭션 유스케이스다(architecture.md 3.3 — Orchestrator는 자기 Repository를
 * 갖지 않는다). 다른 도메인 Service를 호출하는 것은 Service의 책임 범위다(3.2).
 */
@Injectable()
export class PlayService {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    private readonly playbackService: PlaybackService,
    private readonly playPolicyService: PlayPolicyService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly dataSource: DataSource,
  ) {}

  /** 서버 처리 6단계를 **하나의 트랜잭션**으로 수행한다(architecture.md 8.1) */
  async startPlay(command: StartPlayCommand): Promise<StartPlayResult> {
    return this.dataSource.transaction(async (manager) => {
      // 1. 회수 여부는 목록에서 걸러도 이미 화면에 떠 있는 항목이 탭될 수 있다
      await this.contentService.getPublishedById(command.contentId, manager);

      // 2. 한도 판정 — 클라이언트가 보낸 잔여 횟수·티어·진입점은 쓰지 않는다.
      //    **발급(audio-urls)과 같은 함수를 쓴다**(`player-api.md` 3장 설계 메모)
      const permission = await this.playPolicyService.assertPlayable(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // 3. 유니크 제약이 하루 단위 중복을 막는다(domain.md 6.3).
      //    창 안의 재청취는 차감 없이 행만 남긴다 — `listened_sec` 적산 대상이 필요하다
      const inserted = await this.playbackService.recordPlay(
        command.userId,
        command.contentId,
        permission.opensReplayWindow,
        command.now,
        manager,
      );

      /**
       * 응답의 `counted`는 **"차감이 발생했는가"**이지 "행이 생겼는가"가 아니다
       * (`library-api.md` 4.4 — 개정 2026-08-10). 재청취 창 안의 재생은 행이 새로 생겨도
       * 차감이 아니므로 `false`고, **무제한 티어도 차감이 없으므로 `false`다** — 행의
       * `is_counted`(창 기산점)와 이 값이 갈라지는 지점이다(결정 2026-08-11).
       */
      const counted = permission.deductsQuota && inserted;

      // 4. 라이브러리에 있으면 상태를 전이한다. 없으면 행을 만들지 않는다
      const libraryItem = await this.libraryService.markPlayStarted(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // 5. 들은 콘텐츠는 드립으로 다시 오지 않는다(FR-16). 최초 사유는 유지된다
      await this.dripExclusionService.exclude(
        command.userId,
        command.contentId,
        DripExclusionReason.PLAYED,
        command.now,
        manager,
      );

      // 6. 편성·추천 갱신의 입력(FR-15)
      await this.playbackService.recordSignal(
        command.userId,
        command.contentId,
        UserSignalAction.PLAY,
        manager,
      );

      const [progress, quota] = await Promise.all([
        this.playbackService.findProgress(
          command.userId,
          command.contentId,
          manager,
        ),
        // 적재 **이후의** 값을 내려준다 — 클라이언트는 이 값으로 표시를 덮어쓴다
        this.playbackService.buildQuota(
          command.userId,
          permission.dailyPlayLimit,
          command.now,
          manager,
        ),
      ]);

      this.logger.log('play started', {
        userId: command.userId,
        contentId: command.contentId,
        entryPoint: command.entryPoint,
        counted,
      });

      return {
        counted,
        libraryItem: libraryItem
          ? {
              id: libraryItem.id,
              status: libraryItem.status,
              lastPlayedAt: libraryItem.lastPlayedAt,
            }
          : null,
        progress,
        quota,
      };
    });
  }
}
