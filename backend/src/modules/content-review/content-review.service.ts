import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { toServiceDate } from '@/common/utils/service-date.util';
import { EnvironmentVariables } from '@/config/env.validation';
import { isContentVisibleAt } from '@/modules/content/content.visibility';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { UserMarket } from '@/modules/user/user.enum';

import { ContentReviewRepository } from './content-review.repository';
import {
  AdminContentReviewCursorPosition,
  AdminContentReviewListFilter,
  AdminContentReviewPage,
  AdminContentReviewSummary,
  AdminContentReviewSummaryFilter,
  ContentReviewPromptView,
  ContentReviewSheetView,
  ContentReviewView,
  RewardProgressView,
  SaveContentReviewCommand,
} from './content-review.types';
import { ContentReview } from './entities/content-review.entity';
import { Promotion } from './entities/promotion.entity';
import {
  nextLastPromptedDate,
  normalizeReviewText,
  promptCompletedSince,
  resolveMutedUntil,
  resolvePromptGate,
  resolveUnreviewableReason,
} from './policies/content-review.policy';
import {
  hasReachedReward,
  isRewardEligibleReview,
  toRewardProgress,
} from './policies/promotion.policy';
import { PromotionService } from './promotion.service';

/** 4.2 저장 결과 */
export interface SaveContentReviewResult {
  review: ContentReviewView;
  rewardProgress: RewardProgressView | null;
  /**
   * **이번 저장으로** 발급된 프로모션 행 — 없으면 `null`. 화면용 모양(쓸 수 있는지 · 요금제 이름)은 구독 상태가 필요해
   * `billing`이 조립한다(이 모듈은 `subscription`을 모른다)
   */
  issuedPromotion: Promotion | null;
}

/**
 * 콘텐츠 후기(`content-review.md` · `content-review-api.md` 4.1~4.5 · 4.8 · 4.9 — KAN-279).
 *
 * 판정은 전부 서버다 — 쓸 수 있는 편(재생 시작 · 노출 · 시장) · 저장 시점 완청 여부 · 먼저 묻기(그만 보기 · 2일 간격 · 최근
 * 14일 완청). 후기는 **추천 입력이 아니다** — 어떤 추천 모듈도 이 모듈을 의존하지 않고, 이 모듈도 `user_signals`를 쓰지 않는다.
 * 글 원문은 로그에 남기지 않는다(convention.md 8.4) — 남기는 것은 별점 · 글 유무 · 완청 여부뿐이다.
 */
@Injectable()
export class ContentReviewService {
  private readonly logger = new Logger(ContentReviewService.name);

  constructor(
    private readonly contentReviewRepository: ContentReviewRepository,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly userService: UserService,
    private readonly userSettingService: UserSettingService,
    private readonly promotionService: PromotionService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
  ) {}

  /** 후기 기능 스위치(2.1) — 값이 정확히 `true`일 때만 켜진다. 요청마다 읽는다 */
  isEnabled(): boolean {
    return (
      this.configService
        .get('CONTENT_REVIEW_ENABLED', { infer: true })
        ?.trim() === 'true'
    );
  }

  /**
   * 4.1 — 후기 시트 열기. 없는 편 · 다른 시장 편은 404. 그 밖에는 200 으로 `reviewable`과 사유를 준다 —
   * **회수된 편이어도 이미 쓴 후기는 싣는다.**
   */
  async getSheet(
    userId: string,
    contentId: string,
    market: UserMarket,
    now: Date,
  ): Promise<ContentReviewSheetView> {
    const content = await this.getContentInMarket(contentId, market);
    const enabled = this.isEnabled();
    const visible = isContentVisibleAt(content, now);
    const review = await this.contentReviewRepository.findByUserIdAndContentId(
      userId,
      contentId,
    );
    // 재생 여부는 앞 사유가 없을 때만 본다 — 판정 순서가 곧 사유 우선순위다
    const played =
      enabled && visible
        ? await this.playbackService.hasStartedPlaying(userId, contentId)
        : false;
    const reason = resolveUnreviewableReason({ enabled, visible, played });

    return {
      enabled,
      reviewable: reason === null,
      reason,
      review: review ? toReviewView(review) : null,
      rewardProgress: await this.getRewardProgress(userId),
    };
  }

  /**
   * 4.2 — 후기 저장(덮어쓰기). 에러 순서: 스위치 꺼짐(409) → 없는 편 · 다른 시장(404) → 회수 · 만료(403) → 재생 시작 안 함(409).
   * 형식 검증(400)은 DTO 가 먼저 한다.
   *
   * `is_completed` · `content_version` · `market`은 **이 저장 시점의 값으로** 서버가 다시 적는다. 사용자 행을 잠그고 저장한다 —
   * 같은 계정의 두 기기 저장이 직렬로 돌아, "서로 다른 편 3개" 셈이 둘 다 2로 보고 지나치지 않게 한다.
   *
   * **발급**(4.4): 발급 스위치가 켜져 있고 받은 적 없는 계정이면, 같은 트랜잭션에서 보상으로 치는 후기를 세어 3개가 되는
   * 저장에서 1장을 만든다. 발급 뒤 후기를 고치거나 글을 지워도 거두지 않는다.
   */
  async save(
    command: SaveContentReviewCommand,
  ): Promise<SaveContentReviewResult> {
    const { userId, contentId, market, now } = command;

    if (!this.isEnabled()) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.CONTENT_REVIEW_DISABLED,
        message: '지금은 후기를 받지 않아요',
        logLevel: 'info',
      });
    }

    const content = await this.contentService.getPublishedById(
      contentId,
      undefined,
      now,
      market,
    );

    if (!(await this.playbackService.hasStartedPlaying(userId, contentId))) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.CONTENT_REVIEW_NOT_PLAYED,
        message: '들어 본 편에만 후기를 남길 수 있어요',
        logLevel: 'info',
      });
    }

    const text = normalizeReviewText(command.text);
    const { saved, issued } = await this.dataSource.transaction(
      async (manager) => {
        await this.userService.getByIdForUpdate(userId, manager);
        const isCompleted = (
          await this.libraryService.findCompletedContentIds(
            userId,
            [contentId],
            manager,
          )
        ).has(contentId);

        const review = await this.contentReviewRepository.upsert(
          {
            userId,
            contentId,
            stars: command.stars,
            text,
            isCompleted,
            contentVersion: content.contentVersion,
            market,
          },
          manager,
        );

        return {
          saved: review,
          issued: await this.issueRewardIfReached(userId, now, manager),
        };
      },
    );

    // 글 원문은 남기지 않는다 — 유무만
    this.logger.log('content review saved', {
      user_id: userId,
      content_id: contentId,
      stars: saved.stars,
      has_text: saved.text !== null,
      is_completed: saved.isCompleted,
      content_version: saved.contentVersion,
    });

    if (issued !== null) {
      this.logger.log('review reward promotion issued', {
        user_id: userId,
        promotion_id: issued.id,
        expires_at: issued.expiresAt.toISOString(),
      });
    }

    return {
      review: toReviewView(saved),
      // 이번에 발급됐으면 받은 계정이라 null 이다
      rewardProgress: await this.getRewardProgress(userId),
      issuedPromotion: issued,
    };
  }

  /**
   * 4.3 — 먼저 묻기 판정 + 켜짐 여부. **상태를 바꾸지 않는다**("물었다"는 dismiss · mute 가 적는다).
   * 판정 순서: 스위치 → 그만 보기 → 2일 간격 → 최근 14일 완청 · 후기 없음 편.
   */
  async getPrompt(
    userId: string,
    market: UserMarket,
    now: Date,
  ): Promise<ContentReviewPromptView> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        show: false,
        item: null,
        rewardProgress: null,
        mutedUntil: null,
      };
    }

    const settings = await this.userSettingService.getSettings(userId);
    const rewardProgress = await this.getRewardProgress(userId);
    const gate = resolvePromptGate({
      today: toServiceDate(now),
      mutedUntil: settings.contentReviewMutedUntil,
      lastPromptedDate: settings.contentReviewLastPromptedDate,
    });

    if (!gate.open) {
      return {
        enabled: true,
        show: false,
        item: null,
        rewardProgress,
        mutedUntil: gate.mutedUntil,
      };
    }

    const candidate = await this.contentReviewRepository.findPromptCandidate({
      userId,
      market,
      since: promptCompletedSince(now),
      now,
    });

    return {
      enabled: true,
      show: candidate !== null,
      item: candidate
        ? {
            contentId: candidate.contentId,
            title: candidate.title,
            thumbnailUrl: candidate.thumbnailUrl,
            language: candidate.language,
            completedDate: toServiceDate(candidate.completedAt),
          }
        : null,
      rewardProgress,
      mutedUntil: null,
    };
  }

  /** 4.4 — 시트를 닫음. 오늘 서비스 날짜를 "마지막으로 물은 날"로 적는다(뒤로 가지 않는다 · 같은 날 재전송은 무해) */
  async dismissPrompt(userId: string, now: Date): Promise<void> {
    const settings = await this.userSettingService.getSettings(userId);
    const next = nextLastPromptedDate(
      settings.contentReviewLastPromptedDate,
      toServiceDate(now),
    );

    if (next !== null) {
      await this.userSettingService.updateSettings(userId, {
        contentReviewLastPromptedDate: next,
      });
    }
  }

  /** 4.5 — 이번 주 그만 보기. 다음 서비스 주 월요일까지 묻지 않고, **"물었다"도 함께 적는다**(dismiss 를 따로 부르지 않는다) */
  async mutePrompt(userId: string, now: Date): Promise<{ mutedUntil: string }> {
    const settings = await this.userSettingService.getSettings(userId);
    const mutedUntil = resolveMutedUntil(now);
    const lastPrompted = nextLastPromptedDate(
      settings.contentReviewLastPromptedDate,
      toServiceDate(now),
    );

    await this.userSettingService.updateSettings(userId, {
      contentReviewMutedUntil: mutedUntil,
      ...(lastPrompted !== null
        ? { contentReviewLastPromptedDate: lastPrompted }
        : {}),
    });

    return { mutedUntil };
  }

  /** 4.8 — 관리자 편별 집계. 전체 평균은 편 평균의 평균이 아니라 후기 단위 가중 평균이다 */
  async getAdminSummary(
    filter: AdminContentReviewSummaryFilter,
    now: Date,
  ): Promise<AdminContentReviewSummary> {
    const items = await this.contentReviewRepository.summarizeByContent(filter);
    const reviews = items.reduce((sum, item) => sum + item.reviews, 0);
    const starsSum = items.reduce((sum, item) => sum + item.starsSum, 0);

    return {
      totals: {
        reviews,
        averageStars:
          reviews === 0 ? null : Math.round((starsSum / reviews) * 100) / 100,
        textReviews: items.reduce((sum, item) => sum + item.textReviews, 0),
        reviewedContents: items.length,
      },
      promotions: await this.promotionService.countReviewRewards(now),
      items,
    };
  }

  /** 4.9 — 관리자 글 목록. 작성자 계정은 Repository 가 읽지도 않는다 */
  async getAdminPage(
    filter: AdminContentReviewListFilter,
    cursor: AdminContentReviewCursorPosition | null,
    limit: number,
  ): Promise<AdminContentReviewPage> {
    return this.contentReviewRepository.findAdminPage(filter, cursor, limit);
  }

  /**
   * 발급까지의 진행(2.2) — **`null`이면 보상 줄을 그리지 않는다**: 후기 스위치 꺼짐 · 발급 스위치 꺼짐 · 이미 받은 계정(사용 ·
   * 소멸 포함). 그 밖에는 보상으로 치는 후기 수를 `required`로 잘라 준다. S12(`billing`)도 이 값을 그대로 싣는다.
   */
  async getRewardProgress(
    userId: string,
    manager?: EntityManager,
  ): Promise<RewardProgressView | null> {
    if (
      !this.isEnabled() ||
      !this.promotionService.isRewardEnabled() ||
      (await this.promotionService.hasIssued(userId, manager))
    ) {
      return null;
    }

    return toRewardProgress(await this.countRewardEligible(userId, manager));
  }

  /** 4.4 — 3개가 찼으면 1장 발급. 스위치 꺼짐 · 이미 받음 · 덜 참이면 `null` */
  private async issueRewardIfReached(
    userId: string,
    now: Date,
    manager: EntityManager,
  ): Promise<Promotion | null> {
    if (
      !this.promotionService.isRewardEnabled() ||
      (await this.promotionService.hasIssued(userId, manager)) ||
      !hasReachedReward(await this.countRewardEligible(userId, manager))
    ) {
      return null;
    }

    return this.promotionService.issueReviewReward(userId, now, manager);
  }

  private async countRewardEligible(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return (
      await this.contentReviewRepository.findCompletedWithTextByUserId(
        userId,
        manager,
      )
    ).filter(isRewardEligibleReview).length;
  }

  /** 없는 편 · 다른 시장 편은 같은 404 다 — 존재 여부를 시장 밖으로 알리지 않는다(`global-api.md` 4.7). 회수는 여기서 가르지 않는다 */
  private async getContentInMarket(
    contentId: string,
    market: UserMarket,
  ): Promise<Content> {
    const content = await this.contentService.getById(contentId);

    if (content.market !== market) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.CONTENT_NOT_FOUND,
        message: '콘텐츠를 찾을 수 없어요',
      });
    }

    return content;
  }
}

function toReviewView(review: ContentReview): ContentReviewView {
  return {
    stars: review.stars,
    text: review.text,
    isCompleted: review.isCompleted,
    contentVersion: review.contentVersion,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}
