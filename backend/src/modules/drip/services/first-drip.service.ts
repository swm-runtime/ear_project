import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';

import {
  FIRST_DRIP_BACKOFF_JITTER_RATIO,
  FIRST_DRIP_BACKOFF_MS,
  FIRST_DRIP_MAX_RETRY_COUNT,
  FIRST_DRIP_MAX_TOTAL_ATTEMPT_COUNT,
} from '../drip.constant';
import { DripExclusionReason, FirstDripJobStatus } from '../drip.enum';
import { FirstDripState } from '../drip.types';
import { FirstDripJob } from '../entities/first-drip-job.entity';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';
import { FirstDripJobRepository } from '../repositories/first-drip-job.repository';

/**
 * 온보딩 완료 시점의 **첫 드립 편성**을 소유한다(`drip-scheduling.md` 2 — 온보딩 완료 트리거).
 *
 * 일일 편성 배치·스코어링·자동 확장은 이 Service의 책임이 아니다. 여기서 하는 것은
 * 신규 사용자(신호 0건)의 콜드스타트 편성(FR-17)뿐이며, 후보 필터(FR-16)와 원자적 적립은
 * 일일 배치와 같은 규칙을 쓴다.
 */
@Injectable()
export class FirstDripService {
  private readonly logger = new Logger(FirstDripService.name);

  constructor(
    private readonly firstDripJobRepository: FirstDripJobRepository,
    private readonly dripExcludedContentRepository: DripExcludedContentRepository,
    private readonly userService: UserService,
    private readonly planService: PlanService,
    private readonly userInterestService: UserInterestService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 편성 작업 행을 만든다. **온보딩 완료와 같은 트랜잭션에서 호출한다** —
   * 완료는 됐는데 추적할 행이 없으면 클라이언트가 폴링할 대상이 사라진다.
   */
  async createJob(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<FirstDripJob> {
    return this.firstDripJobRepository.createIfAbsent(userId, now, manager);
  }

  async findState(
    userId: string,
    manager?: EntityManager,
  ): Promise<FirstDripState | null> {
    const job = await this.firstDripJobRepository.findByUserId(userId, manager);

    if (!job) {
      return null;
    }

    return {
      status: job.status,
      itemCount: job.itemCount,
      completedAt: job.completedAt,
    };
  }

  /**
   * 완료 요청 커밋 **이후에** 호출하는 백그라운드 실행 경로다
   * (architecture.md 8.3·8.5 — DB를 먼저 커밋하고 나머지는 재시도 가능한 작업으로 남긴다).
   *
   * 절대 예외를 밖으로 던지지 않는다. 이 호출의 실패가 이미 커밋된 온보딩 완료를
   * 되돌리지 않아야 한다(onboarding.md 4 [완료] — 완료 처리는 롤백하지 않는다).
   */
  async runInBackground(userId: string, now: Date): Promise<void> {
    try {
      await this.runWithRetries(userId, now);
    } catch (error) {
      this.logger.error('first drip background run failed', {
        userId,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * 공통 재시도 규칙을 그대로 따른다 — **최대 2회 재시도(총 3회), 백오프 1초 → 3초**
   * (`common-error-handling.md` 4.2, onboarding.md 4 [완료]).
   *
   * 소진하면 `queued`로 넘기고 비동기 재시도 스케줄러가 이어받는다.
   * 클라이언트가 진행했다는 사실이 이 작업을 취소시키지 않는다.
   */
  async runWithRetries(userId: string, now: Date): Promise<void> {
    let elapsedMs = 0;

    for (let attempt = 0; attempt <= FIRST_DRIP_MAX_RETRY_COUNT; attempt++) {
      const attemptAt = new Date(now.getTime() + elapsedMs);

      try {
        await this.markAttemptStarted(userId, attemptAt);
        await this.schedule(userId, attemptAt);
        return;
      } catch (error) {
        this.logger.warn('first drip attempt failed', {
          userId,
          attempt: attempt + 1,
          error: toErrorMessage(error),
        });

        if (attempt >= FIRST_DRIP_MAX_RETRY_COUNT) {
          break;
        }

        const backoffMs = withJitter(FIRST_DRIP_BACKOFF_MS[attempt]);
        elapsedMs += backoffMs;
        await sleep(backoffMs);
      }
    }

    await this.markQueued(userId, new Date(now.getTime() + elapsedMs));
  }

  /**
   * 재시도 스케줄러가 선점한 작업 1건을 실행한다.
   * 선점 시점에 `attempt_count`가 이미 올라가 있으므로 여기서 다시 올리지 않는다.
   */
  async runClaimed(userId: string, now: Date): Promise<void> {
    try {
      await this.schedule(userId, now);
    } catch (error) {
      const job = await this.firstDripJobRepository.findByUserId(userId);

      if (!job) {
        return;
      }

      const exhausted = job.attemptCount >= FIRST_DRIP_MAX_TOTAL_ATTEMPT_COUNT;

      job.status = exhausted
        ? FirstDripJobStatus.FAILED
        : FirstDripJobStatus.QUEUED;
      await this.firstDripJobRepository.save(job);

      // 신규 사용자의 첫 편성 실패는 편성 배치 장애의 조기 신호다 — 조용히 넘기지 않는다
      this.logger.error('first drip retry failed', {
        userId,
        attemptCount: job.attemptCount,
        status: job.status,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * 편성 1회. 성공하면 `completed`, 후보가 없으면 `no_candidates`로 확정한다.
   * 실패는 예외로 던져 호출부의 재시도 정책에 맡긴다.
   */
  async schedule(userId: string, now: Date): Promise<void> {
    const job = await this.firstDripJobRepository.findByUserId(userId);

    if (!job || isSettled(job.status)) {
      return;
    }

    const contentIds = await this.selectContentIds(userId, now);

    if (contentIds.length === 0) {
      job.status = FirstDripJobStatus.NO_CANDIDATES;
      job.itemCount = 0;
      await this.firstDripJobRepository.save(job);

      // 후보 고갈은 실패가 아니지만, 신규 사용자에게 줄 것이 없다는 사실은 운영이 알아야 한다
      this.logger.error('first drip found no candidates', { userId });
      return;
    }

    // 적립은 원자적으로 처리한다 — 2편 중 1편만 적립되는 상태를 만들지 않는다
    // (`drip-scheduling.md` 4.6-4)
    await this.dataSource.transaction(async (manager) => {
      await this.libraryService.addItems(
        userId,
        contentIds,
        LibraryItemSource.DRIP,
        now,
        manager,
      );

      await this.dripExcludedContentRepository.insertIgnoringConflicts(
        contentIds.map((contentId) => ({
          userId,
          contentId,
          reason: DripExclusionReason.DRIPPED,
          excludedAt: now,
        })),
        manager,
      );
    });

    job.status = FirstDripJobStatus.COMPLETED;
    job.itemCount = contentIds.length;
    job.completedAt = now;
    await this.firstDripJobRepository.save(job);

    this.logger.log('first drip scheduled', {
      userId,
      scheduledCount: contentIds.length,
    });
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.firstDripJobRepository.deleteByUserId(userId, manager);
    await this.dripExcludedContentRepository.deleteByUserId(userId, manager);
  }

  /**
   * 후보 선정 — `drip-scheduling.md` 4.2의 필터를 그대로 적용한다.
   *
   * 신규 사용자는 소비 신호가 없으므로 스코어링 대신 콜드스타트 규칙(인기·신선도)만 쓴다
   * (FR-17). 관심 주제 안에서 편수를 채우지 못하면 **인기 콘텐츠로 대체 편성한다** —
   * 라이브러리가 비는 것보다 관련성이 조금 낮은 편이 낫다(`drip-scheduling.md` 7).
   */
  private async selectContentIds(userId: string, now: Date): Promise<string[]> {
    const user = await this.userService.getById(userId);
    const dripCount = await this.planService.getDailyDripCount(user.tier);

    if (dripCount <= 0) {
      return [];
    }

    const topicIds = await this.userInterestService.findActiveTopicIds(userId);

    if (topicIds.length === 0) {
      // 관심사가 없으면 편성하지 않는다 (`drip-scheduling.md` 4.1)
      return [];
    }

    const excludeContentIds = await this.findExcludedContentIds(userId);

    const byInterest = await this.contentService.findCandidates({
      includeTopicIds: topicIds,
      excludeContentIds,
      seriesStartOnly: true,
      limit: dripCount,
      now,
    });

    const selected = byInterest.map((content) => content.id);

    if (selected.length >= dripCount) {
      return selected;
    }

    const fallback = await this.contentService.findCandidates({
      excludeContentIds: [...excludeContentIds, ...selected],
      seriesStartOnly: true,
      limit: dripCount - selected.length,
      now,
    });

    // 두 조회의 결과가 겹치지 않도록 제외 목록을 넘기지만, 같은 콘텐츠를 두 번 적립하려는
    // 시도 자체를 남기지 않는다 — 편수가 부풀어 보이는 것을 막는다
    return [
      ...new Set([...selected, ...fallback.map((content) => content.id)]),
    ];
  }

  /**
   * 중복 방지 필터(FR-16) — 두 조건의 합집합이다.
   * `library_items`는 `deleted_at` 여부를 보지 않는다(삭제한 것도 재적립하지 않는다).
   */
  private async findExcludedContentIds(userId: string): Promise<string[]> {
    const [inLibrary, excluded] = await Promise.all([
      this.libraryService.findAllContentIds(userId),
      this.dripExcludedContentRepository.findAllContentIdsByUserId(userId),
    ]);

    return [...new Set([...inLibrary, ...excluded])];
  }

  private async markAttemptStarted(userId: string, now: Date): Promise<void> {
    const job = await this.firstDripJobRepository.findByUserId(userId);

    if (!job || isSettled(job.status)) {
      return;
    }

    job.attemptCount += 1;
    job.lastAttemptedAt = now;
    await this.firstDripJobRepository.save(job);
  }

  private async markQueued(userId: string, now: Date): Promise<void> {
    const job = await this.firstDripJobRepository.findByUserId(userId);

    if (!job || isSettled(job.status)) {
      return;
    }

    job.status = FirstDripJobStatus.QUEUED;
    job.lastAttemptedAt = now;
    await this.firstDripJobRepository.save(job);

    this.logger.error('first drip handed to retry queue', {
      userId,
      attemptCount: job.attemptCount,
    });
  }
}

/** 다시 시도해도 결과가 바뀌지 않는 확정 상태 */
function isSettled(status: FirstDripJobStatus): boolean {
  return (
    status === FirstDripJobStatus.COMPLETED ||
    status === FirstDripJobStatus.NO_CANDIDATES
  );
}

function withJitter(backoffMs: number): number {
  const spread = backoffMs * FIRST_DRIP_BACKOFF_JITTER_RATIO;
  return Math.round(backoffMs - spread + Math.random() * spread * 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
