import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';
import { ContentService } from '@/modules/content/services/content.service';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { DripExcludedContent } from '@/modules/drip/entities/drip-excluded-content.entity';
import { FirstDripJob } from '@/modules/drip/entities/first-drip-job.entity';
import { UserPreferenceVector } from '@/modules/drip/entities/user-preference-vector.entity';
import { SaveReason } from '@/modules/explore/explore.enum';
import { ExploreOrchestrator } from '@/modules/explore/explore.orchestrator';
import { ExploreFeedResult } from '@/modules/explore/explore.types';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryScreenOrchestrator } from '@/modules/library-screen/library-screen.orchestrator';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { AudioAccessLog } from '@/modules/playback/entities/audio-access-log.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { PlaybackProgress } from '@/modules/playback/entities/playback-progress.entity';
import { SourceLinkClick } from '@/modules/playback/entities/source-link-click.entity';
import { UserSignal } from '@/modules/playback/entities/user-signal.entity';
import { PlayEntryPoint } from '@/modules/playback/playback.enum';
import { PlayService } from '@/modules/playback/services/play.service';
import { PlaybackProgressService } from '@/modules/playback/services/playback-progress.service';
import { PlaybackSignalService } from '@/modules/playback/services/playback-signal.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserCareerService } from '@/modules/user/services/user-career.service';
import { UserService } from '@/modules/user/services/user.service';
import { ReplaceCareerCommand } from '@/modules/user/user.types';

import { RecommendTestAction } from './recommend-test.enum';
import {
  RecommendTestAccountView,
  RecommendTestActionResult,
} from './recommend-test.types';

/** 라이브러리 전체를 한 번에 본다 — 테스트 계정은 수십 편을 넘지 않는다 */
const LIBRARY_LIST_LIMIT = 200;

/**
 * 추천 테스트 콘솔(admin 웹 "추천 검증 > 추천 테스트", 요청 2026-09-29)의 서버 몫.
 *
 * **테스트 계정 한 명(`RECOMMEND_TEST_EMAIL`)에 대해 앱이 하는 행동을 대신 수행한다** — 재생·완청·담기·해제·
 * 삭제·재청취·관심 주제·커리어. 각 행동은 **앱의 같은 서비스 메서드**를 부른다. 신호를 여기서 직접 적재하면
 * "이 행동을 하면 추천이 어떻게 바뀌나"라는 질문에 앱과 다른 답을 내게 된다. 행동 직후에는 배치가 하는
 * 파생 상태 갱신(`DripBatchOrchestrator.refreshDerivedState` — 취향 캐시 재계산 + 자동 확장 슬롯 판정·적용)을
 * 앞당겨, 같은 캐시를 읽는 탐색 피드와 관심 주제가 바로 바뀌게 한다.
 *
 * **개발계 전용이다.** 행동은 실제 `user_signals`·`library_items`·`play_records`를 쓰므로 운영에서는
 * `SENTRY_ENVIRONMENT=production` 하나로 전부 잠근다 — 이메일이 있어도 열리지 않는다. 결과 표시(편성분·점수)는
 * 편성 미리보기(`GET /admin/drip/preview`)가 그대로 담당하고, 이 서비스는 행동·계정 상태·피드·초기화만 소유한다.
 */
@Injectable()
export class RecommendTestService {
  private readonly logger = new Logger(RecommendTestService.name);
  private readonly email: string;
  private readonly environment: string;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly userInterestService: UserInterestService,
    private readonly userCareerService: UserCareerService,
    private readonly topicService: TopicService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playService: PlayService,
    private readonly playbackProgressService: PlaybackProgressService,
    private readonly playbackSignalService: PlaybackSignalService,
    private readonly exploreOrchestrator: ExploreOrchestrator,
    private readonly libraryScreenOrchestrator: LibraryScreenOrchestrator,
    private readonly dripBatchOrchestrator: DripBatchOrchestrator,
  ) {
    this.email =
      configService.get('RECOMMEND_TEST_EMAIL', { infer: true })?.trim() ?? '';
    this.environment =
      configService.get('SENTRY_ENVIRONMENT', { infer: true }) ?? '';
  }

  /** 운영이면 이메일이 있어도 꺼진다 — 행동이 실제 신호를 쓰기 때문이다 */
  get enabled(): boolean {
    return this.email !== '' && this.environment !== 'production';
  }

  async getAccount(now: Date): Promise<RecommendTestAccountView> {
    const user = await this.getTestUser();
    const [interests, page] = await Promise.all([
      this.userInterestService.findAllActive(user.id),
      this.libraryService.findPage(
        {
          userId: user.id,
          filter: LibraryItemFilter.ALL,
          sourceFilter: null,
          topicIds: [],
          sort: LibraryItemSort.ADDED_DESC,
          cursor: null,
          limit: LIBRARY_LIST_LIMIT,
        },
        now,
      ),
    ]);
    const topics = await this.topicService.findAllByIds(
      interests.map((interest) => interest.topicId),
    );
    const topicNames = new Map(topics.map((topic) => [topic.id, topic.name]));

    return {
      environment: this.environment,
      user,
      interests: interests.map((interest) => ({
        topicId: interest.topicId,
        name: topicNames.get(interest.topicId) ?? null,
        source: interest.source,
      })),
      library: page.items,
    };
  }

  /** 탐색 피드 — 앱이 보는 것과 같은 조립(`ExploreOrchestrator.getFeed`) */
  async getFeed(now: Date): Promise<ExploreFeedResult> {
    const user = await this.getTestUser();

    return this.exploreOrchestrator.getFeed(user.id, now);
  }

  async perform(
    action: RecommendTestAction,
    contentId: string,
    now: Date,
  ): Promise<RecommendTestActionResult> {
    const user = await this.getTestUser();
    const effects = await this.performAction(user, action, contentId, now);

    // 다음 배치가 할 일을 지금 한다 — 취향 캐시(탐색 피드가 읽는다)와 자동 확장 슬롯(drip-scheduling 4.5)
    const autoExpand = await this.dripBatchOrchestrator.refreshDerivedState(
      user.id,
      now,
    );

    if (autoExpand.action !== 'none') {
      effects.push(
        `자동 확장 ${autoExpand.action} (${autoExpand.reason}) — 관심 주제가 바뀌었다`,
      );
    }

    this.logger.log('recommend test action', {
      user_id: user.id,
      content_id: contentId,
      action,
    });

    return {
      action,
      contentId,
      performedAt: now,
      effects,
      preferenceRebuilt: true,
    };
  }

  async replaceInterests(topicIds: string[], now: Date): Promise<void> {
    const user = await this.getTestUser();
    await this.userInterestService.replaceManagedSelection(
      user.id,
      topicIds,
      now,
    );
  }

  async replaceCareer(command: ReplaceCareerCommand): Promise<void> {
    const user = await this.getTestUser();
    await this.userCareerService.replaceCareer(user.id, command);
  }

  /**
   * 테스트 계정의 소비 이력을 전부 지운다 — 가입 직후(관심 주제·커리어만 있는 상태)로 되돌린다.
   *
   * 지우는 것: 신호·재생 기록(오늘 한도도 함께 풀린다)·위치·오디오 발급 로그·원문 클릭·라이브러리(삭제분 포함)·
   * 취향 캐시·드립 영구 제외·첫 드립 작업·**자동 확장으로 붙은 관심 주제**(행동에서 파생된 것이라 행동과 함께
   * 지운다). **직접 고른 관심 주제·커리어·계정은 남긴다** — 그건 버튼으로 바꾸는 입력이다.
   * 탈퇴 경로(`UserWithdrawalService`)는 `users` 행 삭제의 CASCADE 에 맡기지만 여기는 계정을 남겨야 해서
   * 표를 하나씩 지운다. 이 목록은 `domain.md` 6·7장의 `user_id` FK 표와 같아야 한다.
   */
  async reset(): Promise<void> {
    const user = await this.getTestUser();

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const where = { userId: user.id };
      await manager.delete(UserSignal, where);
      await manager.delete(PlayRecord, where);
      await manager.delete(PlaybackProgress, where);
      await manager.delete(AudioAccessLog, where);
      await manager.delete(SourceLinkClick, where);
      await manager.delete(LibraryItem, where);
      await manager.delete(UserPreferenceVector, where);
      await manager.delete(DripExcludedContent, where);
      await manager.delete(FirstDripJob, where);
      await manager.delete(UserInterest, {
        ...where,
        source: UserInterestSource.AUTO_EXPAND,
      });
    });

    this.logger.log('recommend test account reset', { user_id: user.id });
  }

  private async performAction(
    user: User,
    action: RecommendTestAction,
    contentId: string,
    now: Date,
  ): Promise<string[]> {
    switch (action) {
      case RecommendTestAction.PLAY:
        return this.play(user, contentId, now);
      case RecommendTestAction.COMPLETE:
        return this.complete(user, contentId, now);
      case RecommendTestAction.SAVE: {
        const result = await this.exploreOrchestrator.saveContent({
          userId: user.id,
          contentId,
          reason: SaveReason.USER_SAVE,
          now,
        });

        return [
          result.created
            ? '라이브러리에 담김 (save 신호)'
            : '이미 담겨 있음 — 변화 없음',
        ];
      }
      case RecommendTestAction.UNSAVE:
        await this.exploreOrchestrator.unsaveContent(user.id, contentId, now);

        return ['담기 해제 (unsave 신호 · 드립 영구 제외)'];
      case RecommendTestAction.DELETE: {
        const item = await this.requireLibraryItem(user, contentId);
        await this.libraryScreenOrchestrator.deleteItem(user.id, item.id, now);

        return ['라이브러리에서 삭제 (delete 신호 · 드립 영구 제외)'];
      }
      case RecommendTestAction.REPLAY: {
        const item = await this.libraryService.findItemByContentId(
          user.id,
          contentId,
        );
        await this.playbackSignalService.recordReplay(user.id, contentId);

        return [
          item?.status === LibraryItemStatus.COMPLETED
            ? '재청취 (replay 신호)'
            : '완료 상태가 아니라 앱과 같이 무시됨 — 신호 없음',
        ];
      }
    }
  }

  /** 탐색에서 재생하는 것과 같다 — 라이브러리에 없으면 자동 적립(`auto_play`) 후 재생 시작 */
  private async play(
    user: User,
    contentId: string,
    now: Date,
  ): Promise<string[]> {
    const effects: string[] = [];
    const existing = await this.libraryService.findItemByContentId(
      user.id,
      contentId,
    );

    if (!existing) {
      await this.exploreOrchestrator.saveContent({
        userId: user.id,
        contentId,
        reason: SaveReason.AUTO_PLAY,
        now,
      });
      effects.push('탐색 재생 자동 적립 (auto_play — 신호 없음)');
    }

    const started = await this.playService.startPlay({
      userId: user.id,
      contentId,
      entryPoint: PlayEntryPoint.EXPLORE,
      now,
    });
    effects.push(
      `재생 시작 (play 신호 · 드립 영구 제외${started.counted ? ' · 오늘 한도 1 차감' : ''})`,
    );

    return effects;
  }

  /** 재생 시작 뒤 위치를 끝까지 저장한다 — 앱의 완청 판정(90%)이 그대로 돈다 */
  private async complete(
    user: User,
    contentId: string,
    now: Date,
  ): Promise<string[]> {
    const content = await this.contentService.getById(contentId);
    const effects = await this.play(user, contentId, now);

    if (content.durationSec <= 0) {
      // 길이가 없는 콘텐츠는 위치 기준 판정이 불가능하다(`library.md` 7) — 앱과 같이 수동 완료 경로를 쓴다
      const item = await this.requireLibraryItem(user, contentId);
      await this.libraryScreenOrchestrator.completeItem(user.id, item.id, now);
      effects.push('길이 미상 — 수동 완료 경로 (complete 신호 없음)');

      return effects;
    }

    const saved = await this.playbackProgressService.saveProgress({
      userId: user.id,
      contentId,
      positionSec: content.durationSec,
      maxReachedSec: content.durationSec,
      listenedSecDelta: content.durationSec,
      contentVersion: content.contentVersion,
      now,
    });
    effects.push(
      saved.libraryItem?.status === LibraryItemStatus.COMPLETED
        ? '끝까지 들음 → 완청 (complete 신호)'
        : '위치 저장됨 — 완청 전이 없음(이미 완료였거나 라이브러리 행 없음)',
    );

    return effects;
  }

  private async requireLibraryItem(
    user: User,
    contentId: string,
  ): Promise<LibraryItem> {
    const item = await this.libraryService.findItemByContentId(
      user.id,
      contentId,
    );

    if (!item) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message:
          '테스트 계정의 라이브러리에 없는 콘텐츠예요 — 먼저 담거나 재생하세요',
      });
    }

    return item;
  }

  private async getTestUser(): Promise<User> {
    if (!this.enabled) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.ADMIN_RECOMMEND_TEST_DISABLED,
        message:
          this.environment === 'production'
            ? '추천 테스트는 운영 서버에서 쓸 수 없어요 — 개발계에 연결하세요'
            : '추천 테스트 계정(RECOMMEND_TEST_EMAIL)이 서버에 설정되지 않았어요',
      });
    }

    const user = await this.userService.findByEmail(this.email);

    if (!user) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message:
          '테스트 계정이 이 서버에 가입돼 있지 않아요 — 개발계 앱에서 먼저 가입하세요',
      });
    }

    return user;
  }
}
