import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { MAX_LISTENED_SEC_DELTA } from '../playback.constant';
import { UserSignalAction } from '../playback.enum';
import { SaveProgressCommand, SaveProgressResult } from '../playback.types';
import { PlaybackService } from './playback.service';

/**
 * 재생 위치 저장(`player-api.md` 4.3) — `player.md` 4.3(위치)·4.4(완청)·4.4-1(청취 시간)에
 * 대응한다.
 *
 * **완청은 서버가 판정한다.** 클라이언트에는 완료를 선언할 수 있는 필드 자체가 없고
 * (`player-api.md` 2장), 서버는 **매 저장마다** `max_reached_sec`으로 판정하므로 90% 도달
 * 후 늦어도 다음 저장(주기 5초) 안에 `completed`가 응답에 실린다.
 *
 * **호출 시점을 강제하지 않는다.** 시점의 소유자는 `player.md` 4.3이고, 이 계약은 언제
 * 도착하든 같은 규칙으로 처리한다.
 */
@Injectable()
export class PlaybackProgressService {
  constructor(
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly dataSource: DataSource,
  ) {}

  async saveProgress(
    command: SaveProgressCommand,
  ): Promise<SaveProgressResult> {
    return this.dataSource.transaction(async (manager) => {
      /**
       * **회수 여부를 검증하지 않는다.** 회수의 차단 지점은 발급(4.1)이고, 이미 발급된
       * URL로 진행 중인 재생의 위치까지 거부하면 유효한 청취 기록이 유실된다 —
       * `architecture.md` 9.4가 정한 지연 상한 안에서 일어나는 정상 재생이다.
       */
      const content = await this.contentService.getById(
        command.contentId,
        manager,
      );

      const libraryItem =
        await this.libraryService.findItemWithContentByContentId(
          command.userId,
          command.contentId,
          manager,
        );

      /**
       * 버전이 다르면 **저장하지 않고 현재 상태를 돌려준다.**
       *
       * 재발행 전 버전에서 계산된 위치가 새 오디오에 씌워지는 것을 막는다. 특히 길이가
       * 짧아진 재발행에서 낡은 `max_reached_sec`이 90%를 넘겨 **가짜 완청**을 만드는 것을
       * 막는 안전장치다.
       */
      if (content.contentVersion !== command.contentVersion) {
        const current = await this.playbackService.findProgress(
          command.userId,
          command.contentId,
          manager,
        );

        return {
          positionSec: current?.positionSec ?? 0,
          maxReachedSec: current?.maxReachedSec ?? 0,
          contentVersion: content.contentVersion,
          libraryItem: toLibraryItemView(libraryItem),
        };
      }

      // 경계·배속 타이밍 오차로 길이를 살짝 넘겨 오는 것은 정상이다 — 거부하지 않고 맞춘다
      const positionSec = clamp(command.positionSec, content.durationSec);
      const maxReachedSec = clamp(command.maxReachedSec, content.durationSec);

      const saved = await this.playbackService.saveProgress(
        command.userId,
        command.contentId,
        positionSec,
        maxReachedSec,
        manager,
      );

      /**
       * 정산 원천이라 비정상 크기를 그대로 받지 않는다(`player-api.md` 7장).
       * **거부가 아니라 클램프다** — 백그라운드 동기화라 사용자에게 알릴 수단이 없고,
       * 거부하면 정상 청취분까지 함께 버려진다.
       */
      await this.playbackService.addListenedSec(
        command.userId,
        command.contentId,
        Math.min(command.listenedSecDelta, MAX_LISTENED_SEC_DELTA),
        manager,
      );

      const completed = await this.completeIfReached(
        command,
        libraryItem,
        maxReachedSec,
        manager,
      );

      return {
        positionSec: saved.positionSec,
        maxReachedSec: saved.maxReachedSec,
        contentVersion: content.contentVersion,
        libraryItem: toLibraryItemView(completed ?? libraryItem),
      };
    });
  }

  /**
   * 완청 판정(`player.md` 4.4) — 90% 기준값은 `library` 모듈이 소유하므로 그쪽 Service를
   * 호출한다. 기준을 여기서 다시 쓰면 두 곳이 갈라진다.
   *
   * **라이브러리에 없는 콘텐츠는 진행만 저장한다.** 상태 전이·`complete` 신호는 라이브러리
   * 행이 전제다. 실제로는 탐색 재생의 자동 적립이 행을 만들어 두므로 경합에서만 나타난다.
   *
   * **이미 `completed`면 전이도 신호 적재도 반복하지 않는다** — `completed_at`은 최초 값을
   * 유지하고, 완료 후 되감아 들어도 상태는 내려가지 않는다.
   */
  private async completeIfReached(
    command: SaveProgressCommand,
    libraryItem: LibraryItem | null,
    maxReachedSec: number,
    manager: EntityManager,
  ): Promise<LibraryItem | null> {
    if (!libraryItem || libraryItem.status === LibraryItemStatus.COMPLETED) {
      return null;
    }

    /**
     * `duration_sec`이 없거나 0이면 이 경로로는 판정할 수 없다. 그 콘텐츠의 완청은 재생
     * 종료 이벤트에서 클라이언트가 `library-api.md` 4.5를 호출하는 폴백을 따른다
     * (`library.md` 7). **여기서 무조건 완료시키면 가짜 완청이 된다.**
     */
    const durationSec = libraryItem.content?.durationSec ?? 0;

    if (durationSec <= 0) {
      return null;
    }

    const before = libraryItem.status;
    const completed = await this.libraryService
      .completeItem(libraryItem, maxReachedSec, command.now, manager)
      .catch((error: unknown) => {
        /**
         * **기준 미달만 삼킨다** — 그 계약이 "조용히 무시, 상태를 바꾸지 않는다"다
         * (`common-error-handling.md` 9장 — `LIBRARY_COMPLETION_NOT_REACHED`).
         *
         * 나머지 예외(데드락·타임아웃 등 DB 실패)는 그대로 던진다. 여기서 삼키면 Postgres가
         * abort시킨 트랜잭션 위에서 처리가 계속되고, 마지막 COMMIT이 조용히 ROLLBACK으로
         * 바뀌어 **클라이언트는 200을 받는데 위치·청취 시간이 전부 유실**된다.
         */
        if (
          error instanceof BusinessException &&
          error.errorCode === ErrorCode.LIBRARY_COMPLETION_NOT_REACHED
        ) {
          return null;
        }

        throw error;
      });

    if (!completed || completed.status === before) {
      return null;
    }

    await this.playbackService.recordSignal(
      command.userId,
      command.contentId,
      UserSignalAction.COMPLETE,
      manager,
    );

    return completed;
  }
}

function clamp(value: number, durationSec: number): number {
  if (durationSec <= 0) {
    return value;
  }

  return Math.min(value, durationSec);
}

function toLibraryItemView(
  item: LibraryItem | null,
): SaveProgressResult['libraryItem'] {
  return item
    ? { id: item.id, status: item.status, completedAt: item.completedAt }
    : null;
}
