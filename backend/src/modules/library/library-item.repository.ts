import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { ContentStatus } from '@/modules/content/content.enum';

import { LibraryItem } from './library-item.entity';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSource,
  LibraryItemStatus,
} from './library.enum';
import { LibraryPageQuery } from './library.types';

/** 목록·복원 조회가 공유하는 노출 조건 — 회수된 콘텐츠는 어느 쪽에도 나타나지 않는다 */
const VISIBLE_CONTENT_CONDITION = 'content.status = :publishedStatus';

@Injectable()
export class LibraryItemRepository {
  constructor(
    @InjectRepository(LibraryItem)
    private readonly repository: Repository<LibraryItem>,
  ) {}

  private scoped(manager?: EntityManager): Repository<LibraryItem> {
    return manager ? manager.getRepository(LibraryItem) : this.repository;
  }

  /**
   * architecture.md 8.4 — **유니크 위반을 예외로 만들지 않고 정상 흐름으로 흡수한다.**
   * `ON CONFLICT DO NOTHING`으로 넣고, 실제로 존재하는 행은 호출부가 다시 조회해 확인한다.
   */
  async insertIgnoringConflicts(
    items: Partial<LibraryItem>[],
    manager?: EntityManager,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(LibraryItem)
      .values(items)
      .orIgnore()
      .execute();
  }

  /** 소프트 삭제분을 포함해 조회한다 — 드립 후보 필터가 `deleted_at` 여부를 보지 않는다 */
  async findAllByUserIdAndContentIds(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<LibraryItem[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager).find({
      where: { userId, contentId: In(contentIds) },
      withDeleted: true,
    });
  }

  /** 드립 후보 필터의 첫 줄 — `library_items`에 행이 존재하면 제외한다 */
  async findAllContentIdsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .select('item.content_id', 'content_id')
      .where('item.user_id = :userId', { userId })
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  async countByUserIdAndSource(
    userId: string,
    source: LibraryItemSource,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({ userId, source });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }

  /**
   * library-api.md 4.1 — 목록 한 페이지.
   *
   * **`contents`를 조인으로 붙인다.** 회수된 콘텐츠를 응답에서 빼야 하고(`library.md` 4.7)
   * 카드에 제목·길이·썸네일이 함께 나가므로, 나눠 조회하면 20건에 20번이 붙는다
   * (architecture.md 3.4 — N+1 회피). `contents`를 `id`로 조인하면 PK 조회에 `status`가
   * 딸려 오므로 별도 인덱스가 필요 없다(domain.md 6.1).
   *
   * **다음 페이지 존재 여부를 세지 않고 한 건 더 읽는다.** COUNT를 따로 돌리면 같은 조건을
   * 두 번 스캔하게 되고, 그 사이 적립된 드립 때문에 두 값이 어긋난다.
   * 판정은 호출부가 한다(Repository는 판정하지 않는다 — architecture.md 3.2).
   */
  async findPage(
    query: LibraryPageQuery,
    manager?: EntityManager,
  ): Promise<LibraryItem[]> {
    const isDescending = query.sort === LibraryItemSort.ADDED_DESC;

    const builder = this.scoped(manager)
      .createQueryBuilder('item')
      .innerJoinAndSelect(
        'item.content',
        'content',
        VISIBLE_CONTENT_CONDITION,
        {
          publishedStatus: ContentStatus.PUBLISHED,
        },
      )
      .where('item.user_id = :userId', { userId: query.userId });

    this.applyFilter(builder, query.filter);
    this.applyTopicFilter(builder, query.topicIds);

    if (query.cursor) {
      // Postgres 행 비교 — keyset 페이지네이션의 tie-break를 한 조건으로 표현한다
      builder.andWhere(
        `(item.added_at, item.id) ${isDescending ? '<' : '>'} (:cursorAddedAt, :cursorId)`,
        { cursorAddedAt: query.cursor.addedAt, cursorId: query.cursor.id },
      );
    }

    return builder
      .orderBy('item.added_at', isDescending ? 'DESC' : 'ASC')
      .addOrderBy('item.id', isDescending ? 'DESC' : 'ASC')
      .limit(query.limit + 1)
      .getMany();
  }

  /**
   * 주제 필터 팝업의 집계 대상(library-api.md 4.2) — 목록과 **같은 노출 조건**이되
   * **탭 선택과 무관하게 라이브러리 전체를 기준으로** 센다. 탭을 옮길 때마다 팝업의 주제
   * 구성이 흔들리면 두 필터를 조합할 수 없다.
   */
  async findAllVisibleContentIdsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .innerJoin('item.content', 'content', VISIBLE_CONTENT_CONDITION, {
        publishedStatus: ContentStatus.PUBLISHED,
      })
      .select('item.content_id', 'content_id')
      .where('item.user_id = :userId', { userId })
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  /**
   * 미니플레이어 복원 대상(library-api.md 4.3) — 주어진 후보 중 `last_played_at`이 가장
   * 최근인 1건. 정렬 축이 목록(`added_at`)과 달라 전용 인덱스를 쓴다(domain.md 6.1).
   *
   * `position_sec > 0` 조건은 `playback_progresses` 소유라 후보 목록으로 받아 적용한다.
   */
  async findLatestPlayedAmongContentIds(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    if (contentIds.length === 0) {
      return null;
    }

    return this.scoped(manager)
      .createQueryBuilder('item')
      .innerJoinAndSelect(
        'item.content',
        'content',
        VISIBLE_CONTENT_CONDITION,
        {
          publishedStatus: ContentStatus.PUBLISHED,
        },
      )
      .where('item.user_id = :userId', { userId })
      .andWhere('item.content_id IN (:...contentIds)', { contentIds })
      .andWhere('item.status != :completed', {
        completed: LibraryItemStatus.COMPLETED,
      })
      .andWhere('item.last_played_at IS NOT NULL')
      .orderBy('item.last_played_at', 'DESC')
      .limit(1)
      .getOne();
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.scoped(manager).findOne({
      where: { id, userId },
      relations: { content: true },
    });
  }

  /** 삭제분까지 읽는다 — 복구(library-api.md 4.7)의 대상은 삭제된 항목이다 */
  async findByIdAndUserIdWithDeleted(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.scoped(manager).findOne({
      where: { id, userId },
      relations: { content: true },
      withDeleted: true,
    });
  }

  async findByUserIdAndContentId(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.scoped(manager).findOneBy({ userId, contentId });
  }

  async save(item: LibraryItem, manager?: EntityManager): Promise<LibraryItem> {
    return this.scoped(manager).save(item);
  }

  /**
   * 소프트 삭제. **행을 지우지 않는다**(domain.md 6.1) — 재생 이력과 드립 영구 제외
   * 판정이 남아야 한다.
   *
   * 삭제 시각을 인자로 받는 이유는 테스트에서 시각을 고정하기 위해서다
   * (convention.md 7.3 — `Date.now()`를 직접 쓰지 않는다).
   */
  async softDeleteById(
    id: string,
    deletedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update({ id }, { deletedAt });
  }

  async restoreById(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).update({ id }, { deletedAt: null });
  }

  private applyFilter(
    builder: SelectQueryBuilder<LibraryItem>,
    filter: LibraryItemFilter,
  ): void {
    switch (filter) {
      case LibraryItemFilter.UNPLAYED:
        // 듣다 만 것도 사용자 입장에서는 아직 안 들은 것이다 (`library.md` 4.1-1)
        builder.andWhere('item.status IN (:...unplayedStatuses)', {
          unplayedStatuses: [
            LibraryItemStatus.UNPLAYED,
            LibraryItemStatus.IN_PROGRESS,
          ],
        });
        break;
      case LibraryItemFilter.COMPLETED:
        builder.andWhere('item.status = :completedStatus', {
          completedStatus: LibraryItemStatus.COMPLETED,
        });
        break;
      case LibraryItemFilter.DRIP:
        // [이어 PICK] 탭 — **상태를 가리지 않는다**
        builder.andWhere('item.source = :dripSource', {
          dripSource: LibraryItemSource.DRIP,
        });
        break;
      case LibraryItemFilter.ALL:
        break;
    }
  }

  /**
   * **탭과는 AND, 선택한 주제끼리는 OR다**(library-api.md 4.1).
   * 주제 사이를 AND로 걸면 선택한 주제를 모두 가진 콘텐츠만 남아 두 개만 골라도 대부분
   * 빈 목록이 된다 — 다중 선택의 의도는 "이 중 아무거나"다.
   */
  private applyTopicFilter(
    builder: SelectQueryBuilder<LibraryItem>,
    topicIds: string[],
  ): void {
    if (topicIds.length === 0) {
      return;
    }

    builder.andWhere(
      `EXISTS (
         SELECT 1 FROM content_topics filtered
         WHERE filtered.content_id = item.content_id
           AND filtered.topic_id IN (:...topicIds)
       )`,
      { topicIds },
    );
  }
}
