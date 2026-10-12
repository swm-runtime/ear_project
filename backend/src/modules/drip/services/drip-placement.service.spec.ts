import { DataSource, EntityManager } from 'typeorm';

import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { DRIP_ALGORITHM_VERSION } from '../drip.constant';
import { DripExclusionReason } from '../drip.enum';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';
import { DripPlacementService } from './drip-placement.service';

const USER_ID = 'user-1';
const NOW = new Date('2026-10-10T06:00:00Z');
const MANAGER = { tx: true } as unknown as EntityManager;

interface PlacedItem {
  userId: string;
  contentId: string;
  source: LibraryItemSource;
  addedAt: Date;
  algorithmVersion: string | null;
  manager: EntityManager | undefined;
}

interface Exclusion {
  userId: string;
  contentId: string;
  reason: DripExclusionReason;
  excludedAt: Date;
  manager: EntityManager | undefined;
}

/**
 * 라이브러리·제외 목록을 메모리로 두고, 트랜잭션은 **콜백이 던지면 둘 다 시작 전으로** 되돌린다.
 * 원자성(4.6-4)을 "롤백되었는가"로 확인하기 위해서다.
 */
class PlacementWorld {
  libraryItems: PlacedItem[] = [];
  exclusions: Exclusion[] = [];
  transactions = 0;
  failExclusionInsert = false;

  readonly libraryService = {
    addItems: (
      userId: string,
      contentIds: string[],
      source: LibraryItemSource,
      now: Date,
      manager?: EntityManager,
      algorithmVersion: string | null = null,
    ) => {
      for (const contentId of contentIds) {
        this.libraryItems.push({
          userId,
          contentId,
          source,
          addedAt: now,
          algorithmVersion,
          manager,
        });
      }
      return Promise.resolve(contentIds);
    },
  };

  readonly exclusionRepository = {
    insertIgnoringConflicts: (
      rows: Array<Omit<Exclusion, 'manager'>>,
      manager?: EntityManager,
    ) => {
      if (this.failExclusionInsert) {
        return Promise.reject(new Error('connection reset'));
      }
      for (const row of rows) {
        this.exclusions.push({ ...row, manager });
      }
      return Promise.resolve();
    },
  };

  readonly dataSource = {
    transaction: async <T>(
      work: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => {
      this.transactions += 1;
      const libraryItems = [...this.libraryItems];
      const exclusions = [...this.exclusions];
      try {
        return await work(MANAGER);
      } catch (error) {
        this.libraryItems = libraryItems;
        this.exclusions = exclusions;
        throw error;
      }
    },
  };
}

function setup() {
  const world = new PlacementWorld();
  const service = new DripPlacementService(
    world.libraryService as unknown as LibraryService,
    world.exclusionRepository as unknown as DripExcludedContentRepository,
    world.dataSource as unknown as DataSource,
  );
  return { world, service };
}

describe('DripPlacementService', () => {
  describe('placeItems', () => {
    it('정규 편성 2편을 드립 출처·알고리즘 버전과 함께 라이브러리에 적립한다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.placeItems(
        USER_ID,
        ['c-1', 'c-2'],
        LibraryItemSource.DRIP,
        NOW,
      );

      // then
      expect(world.libraryItems).toEqual([
        expect.objectContaining({
          contentId: 'c-1',
          source: LibraryItemSource.DRIP,
          algorithmVersion: DRIP_ALGORITHM_VERSION,
        }),
        expect.objectContaining({
          contentId: 'c-2',
          source: LibraryItemSource.DRIP,
          algorithmVersion: DRIP_ALGORITHM_VERSION,
        }),
      ]);
    });

    it('적립한 콘텐츠를 dripped 사유로 영구 제외 목록에 같은 시각으로 남긴다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.placeItems(
        USER_ID,
        ['c-1', 'c-2'],
        LibraryItemSource.DRIP,
        NOW,
      );

      // then
      expect(
        world.exclusions.map(({ userId, contentId, reason, excludedAt }) => ({
          userId,
          contentId,
          reason,
          excludedAt,
        })),
      ).toEqual([
        {
          userId: USER_ID,
          contentId: 'c-1',
          reason: DripExclusionReason.DRIPPED,
          excludedAt: NOW,
        },
        {
          userId: USER_ID,
          contentId: 'c-2',
          reason: DripExclusionReason.DRIPPED,
          excludedAt: NOW,
        },
      ]);
    });

    it('탐험 편도 출처만 discovery 로 남기고 제외 사유는 dripped 를 그대로 쓴다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.placeItems(
        USER_ID,
        ['c-9'],
        LibraryItemSource.DISCOVERY,
        NOW,
      );

      // then
      expect(world.libraryItems[0].source).toBe(LibraryItemSource.DISCOVERY);
      expect(world.exclusions[0].reason).toBe(DripExclusionReason.DRIPPED);
    });

    it('적립과 제외 기록을 같은 트랜잭션 매니저로 실행한다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.placeItems(USER_ID, ['c-1'], LibraryItemSource.DRIP, NOW);

      // then
      expect(world.transactions).toBe(1);
      expect(world.libraryItems[0].manager).toBe(MANAGER);
      expect(world.exclusions[0].manager).toBe(MANAGER);
    });

    it('제외 기록이 실패하면 적립도 함께 롤백되어 1편만 남는 상태가 없다', async () => {
      // given
      const { world, service } = setup();
      world.failExclusionInsert = true;

      // when
      const work = service.placeItems(
        USER_ID,
        ['c-1', 'c-2'],
        LibraryItemSource.DRIP,
        NOW,
      );

      // then
      await expect(work).rejects.toThrow('connection reset');
      expect(world.libraryItems).toHaveLength(0);
      expect(world.exclusions).toHaveLength(0);
    });

    it('탐험 편 적립이 실패해도 앞서 끝난 정규 적립은 롤백하지 않는다', async () => {
      // given
      const { world, service } = setup();
      await service.placeItems(
        USER_ID,
        ['c-1', 'c-2'],
        LibraryItemSource.DRIP,
        NOW,
      );
      world.failExclusionInsert = true;

      // when
      await service
        .placeItems(USER_ID, ['c-9'], LibraryItemSource.DISCOVERY, NOW)
        .catch(() => undefined);

      // then
      expect(world.libraryItems.map((item) => item.contentId)).toEqual([
        'c-1',
        'c-2',
      ]);
    });

    it('편성할 콘텐츠가 없으면 트랜잭션을 열지 않고 끝난다', async () => {
      // given
      const { world, service } = setup();

      // when
      await service.placeItems(USER_ID, [], LibraryItemSource.DRIP, NOW);

      // then
      expect(world.transactions).toBe(0);
      expect(world.libraryItems).toHaveLength(0);
    });
  });
});
