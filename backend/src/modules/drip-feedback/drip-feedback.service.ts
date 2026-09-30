import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';

import {
  DRIP_FEEDBACK_PROMPT_LIMIT,
  DRIP_FEEDBACK_RATEABLE_DAYS,
} from './drip-feedback.constant';
import { DripFeedbackRepository } from './drip-feedback.repository';
import {
  DripFeedbackPromptView,
  DripFeedbackVersionSummary,
  RateDripFeedbackCommand,
} from './drip-feedback.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 추천 온라인 평가(`drip-feedback.md`, KAN-116) — "어제 추천 어떠셨나요?"의 서버 몫.
 *
 * 세 판정 전부 서버가 한다(클라이언트는 표시만): ① 팝업을 낼지(어제 편성분·미평가·그만 보기) ② 별점을 받을
 * 자격(내 편성분인지·접수 기간 안인지) ③ "이번 주"의 경계(서비스 주 — 월 04:00 KST).
 * 별점은 **추천 입력이 아니다** — 어떤 스코어링도 이 표를 읽지 않는다.
 */
@Injectable()
export class DripFeedbackService {
  private readonly logger = new Logger(DripFeedbackService.name);

  constructor(
    private readonly dripFeedbackRepository: DripFeedbackRepository,
    private readonly libraryService: LibraryService,
    private readonly userSettingService: UserSettingService,
  ) {}

  /** 4.1 — 어제(직전 서비스 날짜)의 정규 편성분 중 아직 평가하지 않은 것. 그만 보기 중이면 묻지 않는다 */
  async getPrompt(userId: string, now: Date): Promise<DripFeedbackPromptView> {
    const yesterday = new Date(now.getTime() - MS_PER_DAY);
    const placedDate = toServiceDate(yesterday);
    const settings = await this.userSettingService.getSettings(userId);
    const mutedUntil = settings.dripFeedbackMutedUntil;

    // 라벨 비교 — 서비스 날짜 라벨은 `YYYY-MM-DD`라 문자열 순서가 날짜 순서다
    if (mutedUntil !== null && toServiceDate(now) < mutedUntil) {
      return { show: false, items: [], placedDate, mutedUntil };
    }

    const { start, end } = toServiceDayRange(yesterday);
    const placed = (
      await this.libraryService.findPlacedBetween(userId, start, end)
    ).filter((item) => item.source === LibraryItemSource.DRIP);
    const rated = new Set(
      (
        await this.dripFeedbackRepository.findAllByUserIdAndContentIds(
          userId,
          placed.map((item) => item.contentId),
        )
      ).map((feedback) => feedback.contentId),
    );
    const items = placed
      .filter((item) => !rated.has(item.contentId))
      .slice(0, DRIP_FEEDBACK_PROMPT_LIMIT)
      .map((item) => ({
        contentId: item.contentId,
        title: item.content.title,
        thumbnailUrl: item.content.thumbnailUrl,
        source: item.source,
        placedDate: toServiceDate(item.addedAt),
        libraryStatus: item.status,
      }));

    return { show: items.length > 0, items, placedDate, mutedUntil: null };
  }

  /**
   * 4.2 — 별점 저장. 대상은 **내 편성분(드립·탐험)이고 접수 기간 안**이어야 한다. 하나라도 아니면 전부 거부한다 —
   * 부분 저장은 화면의 선택과 서버 상태를 어긋나게 한다. 같은 콘텐츠의 재전송은 덮어쓴다(멱등).
   */
  async rate(command: RateDripFeedbackCommand): Promise<void> {
    const contentIds = [...new Set(command.ratings.map((r) => r.contentId))];
    const placed = await this.libraryService.findPlacedItems(
      command.userId,
      contentIds,
    );
    const placedByContentId = new Map(
      placed.map((item) => [item.contentId, item]),
    );
    const rateableSince =
      command.now.getTime() - DRIP_FEEDBACK_RATEABLE_DAYS * MS_PER_DAY;

    for (const contentId of contentIds) {
      const item = placedByContentId.get(contentId);

      if (!item || item.addedAt.getTime() < rateableSince) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.DRIP_FEEDBACK_NOT_RATEABLE,
          message: '평가할 수 있는 추천 콘텐츠가 아니에요',
        });
      }
    }

    await this.dripFeedbackRepository.upsert(
      command.ratings.map((rating) => {
        const item = placedByContentId.get(rating.contentId)!;

        return {
          userId: command.userId,
          contentId: rating.contentId,
          source: item.source,
          algorithmVersion: item.algorithmVersion,
          placedDate: toServiceDate(item.addedAt),
          stars: rating.stars,
        };
      }),
    );

    this.logger.log('drip feedback rated', {
      user_id: command.userId,
      count: command.ratings.length,
      stars: command.ratings.map((rating) => rating.stars),
    });
  }

  /** 4.3 — [이번 주 그만 보기]: 다음 서비스 주 월요일까지 팝업을 내지 않는다 */
  async mute(userId: string, now: Date): Promise<{ mutedUntil: string }> {
    const mutedUntil = shiftWeekStart(toCurrentWeekStart(now), 1);
    await this.userSettingService.updateSettings(userId, {
      dripFeedbackMutedUntil: mutedUntil,
    });

    return { mutedUntil };
  }

  /** 어드민 — 알고리즘 버전별 편성 수·평가 수·평균·분포(`admin-api.md` 4.19) */
  async summarizeVersions(): Promise<DripFeedbackVersionSummary[]> {
    return this.dripFeedbackRepository.summarizeByVersion();
  }
}
