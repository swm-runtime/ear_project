import { Injectable } from '@nestjs/common';

import { ContentService } from '@/modules/content/services/content.service';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { UserSignalAction } from '../playback.enum';
import { SourceLinkClickRepository } from '../repositories/source-link-click.repository';
import { PlaybackService } from './playback.service';

/**
 * 클라이언트가 직접 보내는 적재 요청 둘 — `replay`(`player-api.md` 4.4)와 원문 유입
 * 클릭(4.5).
 *
 * **클라이언트가 보내는 신호는 `replay` 하나뿐이다.** `play`는 재생 시작이, `complete`는
 * 위치 저장을 받은 서버가 적재한다. 범용 신호 엔드포인트(`POST .../signals { action }`)를
 * 두지 않는 이유가 이것이다 — action을 열어두면 클라이언트가 `complete`를 선언하는 경로가
 * 계약으로 되살아난다.
 *
 * 둘 다 **응답 본문이 없는 적재 전용**이라 204다. 만들어진 행을 클라이언트가 다시 조회할
 * 수단이 없어 201 + Location이 성립하지 않는다.
 */
@Injectable()
export class PlaybackSignalService {
  constructor(
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly sourceLinkClickRepository: SourceLinkClickRepository,
  ) {}

  /**
   * 완료 상태에서 위치 0부터의 재생이 실제로 시작된 시점에 온다.
   *
   * **완료가 아니면 적재하지 않고 그대로 성공으로 응답한다.** 완료가 아닌 상태의 `replay`는
   * 정의에 없는 신호라 스코어링을 왜곡하고(domain.md 6.4는 스코어링 입력 전용이다),
   * 백그라운드 신호라 오류를 노출할 이유도 없다(`common-error-handling.md` 4.3).
   *
   * **재생 허용·차감과 무관하다** — 그 판정은 재생 시작(4.2)이 이미 담당했다.
   */
  async recordReplay(userId: string, contentId: string): Promise<void> {
    // 회수 여부는 보지 않는다 — 없는 콘텐츠만 404다(`player-api.md` 4.4 에러 표)
    await this.contentService.getById(contentId);

    const item = await this.libraryService.findItemByContentId(
      userId,
      contentId,
    );

    if (item?.status !== LibraryItemStatus.COMPLETED) {
      return;
    }

    await this.playbackService.recordSignal(
      userId,
      contentId,
      UserSignalAction.REPLAY,
    );
  }

  /**
   * [원문 보기] 탭 1회 = 1행(domain.md 6.6). **라이브러리·탐색·플레이어 세 화면 공용**이다
   * (더보기 통일 확정 2026-08-10).
   *
   * **회수 여부를 검증하지 않는다.** 회수 직후 아직 화면에 남아 있던 버튼이 탭될 수 있고,
   * 회수 전 소비분의 통계가 유지되는 것과 같은 논리로 클릭 사실의 적재를 막을 이유가 없다.
   *
   * **어느 화면에서 탭했는지는 받지 않는다** — `source_link_clicks`에 화면 구분 컬럼이 없고
   * (스키마에 없는 컬럼을 계약이 만들지 않는다), 이 값의 용도는 콘텐츠 단위 정산 지표
   * 하나다.
   */
  async recordSourceLinkClick(
    userId: string,
    contentId: string,
  ): Promise<void> {
    await this.contentService.getById(contentId);

    await this.sourceLinkClickRepository.insert(userId, contentId);
  }
}
