import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  shiftServiceDate,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';

import {
  DRIP_FEEDBACK_PROMPT_INTERVAL_DAYS,
  DRIP_FEEDBACK_PROMPT_LIMIT,
  DRIP_FEEDBACK_RATEABLE_DAYS,
  DRIP_FEEDBACK_SIGNUP_GRACE_DAYS,
} from './drip-feedback.constant';
import { DripFeedbackRepository } from './drip-feedback.repository';
import {
  DismissDripFeedbackCommand,
  DripFeedbackPromptView,
  DripFeedbackVersionSummary,
  RateDripFeedbackCommand,
} from './drip-feedback.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 추천 온라인 평가(`drip-feedback.md`, KAN-116) — "어제 추천 어떠셨나요?"의 서버 몫.
 *
 * 세 판정 전부 서버가 한다(클라이언트는 표시만): ① 팝업을 낼지(가장 최근 편성분·아직 묻지 않음·미평가·그만 보기)
 * ② 별점을 받을 자격(내 편성분인지·접수 기간 안인지) ③ "이번 주"의 경계(서비스 주 — 월 05:00 KST).
 * 별점은 **추천 입력이 아니다** — 어떤 스코어링도 이 표를 읽지 않는다.
 */
@Injectable()
export class DripFeedbackService {
  private readonly logger = new Logger(DripFeedbackService.name);

  constructor(
    private readonly dripFeedbackRepository: DripFeedbackRepository,
    private readonly libraryService: LibraryService,
    private readonly userSettingService: UserSettingService,
    private readonly userService: UserService,
  ) {}

  /**
   * 4.1 — **가장 최근 정규 편성분**을 묻되, 한 사람에게 **7일에 한 번**이다(개정 2026-10-16, 종전 편성분마다 한 번).
   *
   * 오늘(서비스 날짜) 전에 적립된 마지막 드립 편성분을 찾는다. 별점을 보냈거나 팝업을 닫으면 그 편성분 날짜가
   * `drip_feedback_last_prompted_date`에 남고, **그 날짜 + 7일 전의 편성분은 묻지 않는다** — 며칠 만에 열어도 쌓인
   * 날짜마다 묻지 않고 마지막 편성분 하나만 묻는다.
   * 오늘 아침 편성분은 아직 듣기 전이라 내일 묻는다.
   *
   * 묻지 않는 편성분이 둘 있다(2026-10-02). **온보딩 직후의 첫 드립** — 알고리즘 버전이 없는 편성분이라
   * 조회 단계에서 빠진다(방금 들어온 사용자에게 받을 평가가 없다). **접수 기간(7일)을 지난 편성분** — 물어도
   * `rate`가 거부하고 앱은 그 거부를 조용히 버려, 오래 쉬다 돌아온 사용자가 진입할 때마다 같은 팝업을 봤다.
   *
   * **누구에게, 얼마나 자주**(2026-10-16 결정) — 가입 4일째부터, 지난번에 물은 편성분에서 **7일이 지난 편성분**만
   * 묻는다. **듣지 않은 편도 묻는다** — 묻는 것은 콘텐츠 품질이 아니라 "이 추천이 마음에 드는가"다. 재생한 편만
   * 물으면 응답이 너무 적다(같은 날 결정).
   */
  async getPrompt(userId: string, now: Date): Promise<DripFeedbackPromptView> {
    const settings = await this.userSettingService.getSettings(userId);
    const today = toServiceDate(now);
    const hidden = (placedDate: string | null, mutedUntil: string | null) => ({
      show: false,
      items: [],
      placedDate,
      mutedUntil,
    });

    // 라벨 비교 — 서비스 날짜 라벨은 `YYYY-MM-DD`라 문자열 순서가 날짜 순서다
    if (
      settings.dripFeedbackMutedUntil !== null &&
      today < settings.dripFeedbackMutedUntil
    ) {
      return hidden(null, settings.dripFeedbackMutedUntil);
    }

    // 가입 4일째부터 — 가입일(서비스 날짜)이 1일째다
    const user = await this.userService.getById(userId);
    if (
      today <
      shiftServiceDate(
        toServiceDate(user.createdAt),
        DRIP_FEEDBACK_SIGNUP_GRACE_DAYS,
      )
    ) {
      return hidden(null, null);
    }

    const latest = await this.libraryService.findLatestDripPlacedBefore(
      userId,
      toServiceDayRange(now).start,
    );

    if (!latest) {
      return hidden(null, null);
    }

    const placedDate = toServiceDate(latest.addedAt);

    // 7일에 한 번 — 지난번에 물은 편성분 날짜 + 7일보다 이른 편성분은 묻지 않는다(같은 편성분도 여기서 걸린다)
    if (
      settings.dripFeedbackLastPromptedDate !== null &&
      placedDate <
        shiftServiceDate(
          settings.dripFeedbackLastPromptedDate,
          DRIP_FEEDBACK_PROMPT_INTERVAL_DAYS,
        )
    ) {
      return hidden(placedDate, null);
    }

    // 받을 수 없는 별점은 묻지 않는다 — `rate`와 같은 기준이다
    if (latest.addedAt.getTime() < rateableSince(now)) {
      return hidden(placedDate, null);
    }

    const { start, end } = toServiceDayRange(latest.addedAt);
    const placed = (
      await this.libraryService.findPlacedBetween(userId, start, end)
    ).filter(
      (item) =>
        item.source === LibraryItemSource.DRIP &&
        item.algorithmVersion !== null,
    );
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
        language: item.content.language,
        source: item.source,
        placedDate,
        libraryStatus: item.status,
      }));

    return { show: items.length > 0, items, placedDate, mutedUntil: null };
  }

  /** 4.1 — 팝업을 닫음. 별점을 보낸 것과 같은 기록이다 — 그 편성분 날짜에서 7일 동안 다시 묻지 않는다 */
  async dismiss(command: DismissDripFeedbackCommand): Promise<void> {
    await this.markPrompted(command.userId, command.placedDate);
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
    const since = rateableSince(command.now);

    for (const contentId of contentIds) {
      const item = placedByContentId.get(contentId);

      if (!item || item.addedAt.getTime() < since) {
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

    // 평가한 편성분 중 가장 최근 날짜까지 "물었다"로 — 그 날짜에서 7일 동안 다시 묻지 않는다
    const latestPlacedDate = [...placedByContentId.values()]
      .map((item) => toServiceDate(item.addedAt))
      .sort()
      .at(-1);

    if (latestPlacedDate) {
      await this.markPrompted(command.userId, latestPlacedDate);
    }
  }

  /** 뒤로 가지 않는다 — 더 최근 편성분을 이미 물었으면 그대로 둔다 */
  private async markPrompted(
    userId: string,
    placedDate: string,
  ): Promise<void> {
    const settings = await this.userSettingService.getSettings(userId);

    if (
      settings.dripFeedbackLastPromptedDate !== null &&
      settings.dripFeedbackLastPromptedDate >= placedDate
    ) {
      return;
    }

    await this.userSettingService.updateSettings(userId, {
      dripFeedbackLastPromptedDate: placedDate,
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

/** 접수 기간의 시작 — 이보다 먼저 적립된 편성분은 별점을 받지도, 묻지도 않는다(`drip-feedback.md` 4.1-4 · 4.2) */
function rateableSince(now: Date): number {
  return now.getTime() - DRIP_FEEDBACK_RATEABLE_DAYS * MS_PER_DAY;
}
