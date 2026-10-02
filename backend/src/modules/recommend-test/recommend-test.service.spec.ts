import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { SaveReason } from '@/modules/explore/explore.enum';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { PlayEntryPoint } from '@/modules/playback/playback.enum';

import { RecommendTestAction } from './recommend-test.enum';
import { RecommendTestService } from './recommend-test.service';

const NOW = new Date('2026-09-29T08:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const EMAIL = 'recommend-test@example.com';

const config = (values: Record<string, string | undefined>) =>
  ({ get: jest.fn((key: string) => values[key]) }) as never;

type Deps = {
  userService: { findByEmail: jest.Mock };
  libraryService: { findItemByContentId: jest.Mock; findPage: jest.Mock };
  contentService: { getById: jest.Mock };
  playService: { startPlay: jest.Mock };
  playbackProgressService: { saveProgress: jest.Mock };
  playbackSignalService: { recordReplay: jest.Mock };
  exploreOrchestrator: {
    saveContent: jest.Mock;
    unsaveContent: jest.Mock;
    getFeed: jest.Mock;
  };
  libraryScreenOrchestrator: { deleteItem: jest.Mock; completeItem: jest.Mock };
  dripBatchOrchestrator: { refreshDerivedState: jest.Mock };
  dataSource: { transaction: jest.Mock };
};

function build(env: Record<string, string | undefined>) {
  const deps: Deps = {
    userService: {
      findByEmail: jest.fn().mockResolvedValue({ id: USER_ID, email: EMAIL }),
    },
    libraryService: {
      findItemByContentId: jest.fn().mockResolvedValue(null),
      findPage: jest.fn().mockResolvedValue({ items: [], hasNext: false }),
    },
    contentService: {
      getById: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        durationSec: 600,
        contentVersion: 3,
      }),
    },
    playService: {
      startPlay: jest.fn().mockResolvedValue({ counted: true }),
    },
    playbackProgressService: {
      saveProgress: jest.fn().mockResolvedValue({
        libraryItem: { status: LibraryItemStatus.COMPLETED },
      }),
    },
    playbackSignalService: {
      recordReplay: jest.fn().mockResolvedValue(undefined),
    },
    exploreOrchestrator: {
      saveContent: jest.fn().mockResolvedValue({ created: true }),
      unsaveContent: jest.fn().mockResolvedValue(undefined),
      getFeed: jest.fn(),
    },
    libraryScreenOrchestrator: {
      deleteItem: jest.fn().mockResolvedValue(undefined),
      completeItem: jest.fn().mockResolvedValue(undefined),
    },
    dripBatchOrchestrator: {
      refreshDerivedState: jest
        .fn()
        .mockResolvedValue({ action: 'none', reason: 'no_candidate' }),
    },
    dataSource: {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<void>) =>
        fn({ delete: jest.fn() }),
      ),
    },
  };
  const service = new RecommendTestService(
    config(env),
    deps.dataSource as never,
    deps.userService as never,
    { findAllActive: jest.fn().mockResolvedValue([]) } as never,
    { replaceCareer: jest.fn() } as never,
    { findAllByIds: jest.fn().mockResolvedValue([]) } as never,
    deps.contentService as never,
    deps.libraryService as never,
    deps.playService as never,
    deps.playbackProgressService as never,
    deps.playbackSignalService as never,
    deps.exploreOrchestrator as never,
    deps.libraryScreenOrchestrator as never,
    deps.dripBatchOrchestrator as never,
  );

  return { service, deps };
}

const DEV = { RECOMMEND_TEST_EMAIL: EMAIL, SENTRY_ENVIRONMENT: 'development' };

describe('RecommendTestService', () => {
  describe('잠금 — 개발계 전용', () => {
    it('운영 환경이면 이메일이 있어도 409 ADMIN_RECOMMEND_TEST_DISABLED 다', async () => {
      // given
      const { service, deps } = build({
        RECOMMEND_TEST_EMAIL: EMAIL,
        SENTRY_ENVIRONMENT: 'production',
      });

      // when · then
      expect(service.enabled).toBe(false);
      await expect(
        service.perform(RecommendTestAction.SAVE, CONTENT_ID, NOW),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_RECOMMEND_TEST_DISABLED,
      });
      expect(deps.exploreOrchestrator.saveContent).not.toHaveBeenCalled();
    });

    it('이메일이 비어 있으면 꺼진다', async () => {
      const { service } = build({ SENTRY_ENVIRONMENT: 'development' });

      expect(service.enabled).toBe(false);
      await expect(service.reset()).rejects.toBeInstanceOf(BusinessException);
    });

    it('테스트 계정이 DB 에 없으면 404 다 — 개발계 앱에서 먼저 가입해야 한다', async () => {
      const { service, deps } = build(DEV);
      deps.userService.findByEmail.mockResolvedValue(null);

      await expect(service.getAccount(NOW)).rejects.toMatchObject({
        errorCode: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('행동 — 앱과 같은 서비스 경로를 부른다', () => {
    it('play: 라이브러리에 없으면 auto_play 로 자동 적립한 뒤 재생 시작하고, 취향 캐시를 재계산한다', async () => {
      // given
      const { service, deps } = build(DEV);

      // when
      const result = await service.perform(
        RecommendTestAction.PLAY,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(deps.exploreOrchestrator.saveContent).toHaveBeenCalledWith({
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.AUTO_PLAY,
        now: NOW,
      });
      expect(deps.playService.startPlay).toHaveBeenCalledWith({
        userId: USER_ID,
        contentId: CONTENT_ID,
        entryPoint: PlayEntryPoint.EXPLORE,
        now: NOW,
      });
      expect(
        deps.dripBatchOrchestrator.refreshDerivedState,
      ).toHaveBeenCalledWith(USER_ID, NOW);
      expect(result.preferenceRebuilt).toBe(true);
      expect(result.effects).toHaveLength(2);
    });

    it('play: 이미 담긴 콘텐츠는 자동 적립 없이 재생만 시작한다', async () => {
      const { service, deps } = build(DEV);
      deps.libraryService.findItemByContentId.mockResolvedValue({
        id: 'item',
        status: LibraryItemStatus.UNPLAYED,
      });

      await service.perform(RecommendTestAction.PLAY, CONTENT_ID, NOW);

      expect(deps.exploreOrchestrator.saveContent).not.toHaveBeenCalled();
      expect(deps.playService.startPlay).toHaveBeenCalledTimes(1);
    });

    it('complete: 재생 시작 뒤 위치를 길이 끝까지 저장한다 — 완청 판정은 progress 서비스가 한다', async () => {
      const { service, deps } = build(DEV);

      const result = await service.perform(
        RecommendTestAction.COMPLETE,
        CONTENT_ID,
        NOW,
      );

      expect(deps.playService.startPlay).toHaveBeenCalledTimes(1);
      expect(deps.playbackProgressService.saveProgress).toHaveBeenCalledWith({
        userId: USER_ID,
        contentId: CONTENT_ID,
        positionSec: 600,
        maxReachedSec: 600,
        listenedSecDelta: 600,
        contentVersion: 3,
        now: NOW,
      });
      expect(result.effects.at(-1)).toContain('완청');
    });

    it('complete: 길이가 0 인 콘텐츠는 수동 완료 경로를 쓴다', async () => {
      const { service, deps } = build(DEV);
      deps.contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        durationSec: 0,
        contentVersion: 1,
      });
      deps.libraryService.findItemByContentId
        .mockResolvedValueOnce(null) // play 단계 — 자동 적립
        .mockResolvedValue({ id: 'item-1' });

      await service.perform(RecommendTestAction.COMPLETE, CONTENT_ID, NOW);

      expect(deps.playbackProgressService.saveProgress).not.toHaveBeenCalled();
      expect(deps.libraryScreenOrchestrator.completeItem).toHaveBeenCalledWith(
        USER_ID,
        'item-1',
        NOW,
      );
    });

    it('delete: 라이브러리에 없으면 404 이고 삭제를 부르지 않는다', async () => {
      const { service, deps } = build(DEV);

      await expect(
        service.perform(RecommendTestAction.DELETE, CONTENT_ID, NOW),
      ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
      expect(deps.libraryScreenOrchestrator.deleteItem).not.toHaveBeenCalled();
      expect(
        deps.dripBatchOrchestrator.refreshDerivedState,
      ).not.toHaveBeenCalled();
    });

    it('replay: 완료 상태가 아니면 앱과 같이 신호 없음을 알려준다(호출은 그대로 위임)', async () => {
      const { service, deps } = build(DEV);
      deps.libraryService.findItemByContentId.mockResolvedValue({
        status: LibraryItemStatus.IN_PROGRESS,
      });

      const result = await service.perform(
        RecommendTestAction.REPLAY,
        CONTENT_ID,
        NOW,
      );

      expect(deps.playbackSignalService.recordReplay).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
      );
      expect(result.effects[0]).toContain('무시');
    });
  });

  describe('reset', () => {
    it('사용자 종속 10개 표와 자동 확장으로 붙은 관심 주제를 한 트랜잭션에서 지운다 — 계정·직접 고른 관심 주제는 건드리지 않는다', async () => {
      const { service, deps } = build(DEV);
      const del = jest.fn<
        void,
        [{ name: string }, { userId: string; source?: string }]
      >();
      const update = jest.fn<
        void,
        [{ name: string }, { userId: string }, Record<string, unknown>]
      >();
      deps.dataSource.transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<void>) =>
          fn({ delete: del, update }),
      );

      await service.reset();

      expect(del).toHaveBeenCalledTimes(11);
      // 별점 팝업 상태만 비운다 — 설정 행을 지우면 재생 속도 같은 다른 설정까지 사라진다
      expect(update).toHaveBeenCalledTimes(1);
      const [entity, where, changes] = update.mock.calls[0];
      expect(entity.name).toBe('UserSetting');
      expect(where).toEqual({ userId: USER_ID });
      expect(changes).toEqual({
        dripFeedbackMutedUntil: null,
        dripFeedbackLastPromptedDate: null,
      });
      const byTable = new Map(del.mock.calls.map((c) => [c[0].name, c[1]]));
      expect(byTable.has('User')).toBe(false);
      // 관심 주제는 자동 확장 출처만 지운다 — 조건 없이 지우면 직접 고른 주제까지 사라진다
      expect(byTable.get('UserInterest')).toEqual({
        userId: USER_ID,
        source: 'auto_expand',
      });
      for (const [table, where] of byTable) {
        if (table !== 'UserInterest') {
          expect(where).toEqual({ userId: USER_ID });
        }
      }
    });
  });
});
