import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { ContentStatus } from '@/modules/content/content.enum';

import { LibraryItem } from './library-item.entity';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSource,
  LibraryItemSourceFilter,
  LibraryItemStatus,
} from './library.enum';
import { LibraryPageQuery } from './library.types';

/** 목록·복원 조회가 공유하는 노출 조건 — 회수된 콘텐츠는 어느 쪽에도 나타나지 않는다 */
const VISIBLE_CONTENT_CONDITION = 'content.status = :publishedStatus';

/**
 * 출처 필터 한 값이 덮는 `library_items.source` 값들(library-api.md 4.1).
 * **`save`는 `onboarding`을 포함한다** — 화면의 출처는 둘뿐이고 `onboarding`은 유입 경로다.
 */
const SOURCES_BY_SOURCE_FILTER: Record<
  LibraryItemSourceFilter,
  LibraryItemSource[]
> = {
  // 탐험 편(discovery)도 [이어 PICK]에 포함한다 (개정 2026-08-27 — `library-api.md` 4.1)
  [LibraryItemSourceFilter.DRIP]: [
    LibraryItemSource.DRIP,
    LibraryItemSource.DISCOVERY,
  ],
  [LibraryItemSourceFilter.SAVE]: [
    LibraryItemSource.SAVE,
    LibraryItemSource.ONBOARDING,
  ],
};

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

  /**
   * 담기 1건. **유니크 위반을 예외로 만들지 않는다**(architecture.md 8.4) — 동시에 도착한
   * 두 담기 요청 중 하나는 반드시 지고, 그 사용자에게는 성공으로 보여야 한다.
   *
   * @returns 이 요청으로 행이 **새로 생겼는지**. 응답 상태(201 / 200)가 이 값으로 갈린다.
   */
  async insertIfAbsent(
    item: Partial<LibraryItem>,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(LibraryItem)
      .values(item)
      .orIgnore()
      .returning('id')
      .execute();

    return (result.raw as unknown[]).length > 0;
  }

  /**
   * 담기 해제분을 되살린다(explore-api.md 4.3).
   *
   * **`added_at`을 새로 찍는다** — 재담기는 새 담기 조작이라 목록 맨 위에 오는 것이 맞다.
   * 삭제 실행 취소(4.7)가 `added_at`을 유지하는 것과 반대이며, 되돌린 대상이 다르기 때문이다.
   *
   * **`status`는 건드리지 않는다.** 지웠다 다시 담아도 듣던 위치가 살아 있어야 한다.
   */
  async reactivateById(
    id: string,
    addedAt: Date,
    source: LibraryItemSource,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update(
      { id },
      { deletedAt: null, addedAt, source },
    );
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

  /**
   * 드립 후보 필터의 첫 줄 — `library_items`에 행이 존재하면 제외한다.
   *
   * **`deleted_at` 여부를 보지 않는다**(`domain.md` 7 · `drip-scheduling.md` 4.2).
   * `@DeleteDateColumn` 때문에 기본 조회는 소프트 삭제분을 빼므로 `withDeleted`가 필요하다 —
   * 빠뜨리면 **한 번 들어왔다 지워진 콘텐츠가 다시 드립 후보가 된다.**
   *
   * 사용자가 직접 지운 경우는 `drip_excluded_contents`가 따로 막지만, **파트너 회수는
   * 제외 행을 만들지 않는다**(`domain.md` 7.1). 그래서 회수→복구를 거친 콘텐츠에서는
   * 이 조건이 유일한 방어선이다.
   */
  async findAllContentIdsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .withDeleted()
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

  /**
   * 미청취 재고 — 편성 스킵 판정의 입력이다(`drip-scheduling.md` 4.1 — 기준값 5편).
   * `in_progress`를 포함한다: 듣다 만 것도 사용자에게는 아직 안 들은 것이다
   * (`library-api.md` 4.1의 미청취 탭과 같은 해석).
   */
  async countUnfinishedByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({
      userId,
      status: In([LibraryItemStatus.UNPLAYED, LibraryItemStatus.IN_PROGRESS]),
    });
  }

  /**
   * 최근 편성분의 `content_id` — 노출 피로 감점의 입력이다(`drip-scheduling.md` 4.2 ③).
   * 삭제분도 포함한다(`withDeleted`) — 노출됐다는 사실은 삭제로 사라지지 않는다.
   */
  async findRecentContentIdsByUserIdAndSources(
    userId: string,
    sources: LibraryItemSource[],
    since: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .withDeleted()
      .select('item.content_id', 'content_id')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.source IN (:...sources)', { sources })
      .andWhere('item.added_at >= :since', { since })
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  /**
   * 콘텐츠별 **전 사용자 편성 이력 수** — 탐험 편성의 저노출 판정 입력이다
   * (`drip-scheduling.md` 4.8-2). 삭제분도 포함한다 — 한 번 나간 노출이다.
   */
  async countExposuresByContentIds(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (contentIds.length === 0) {
      return new Map();
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .withDeleted()
      .select('item.content_id', 'content_id')
      .addSelect('COUNT(*)', 'total')
      .where('item.content_id IN (:...contentIds)', { contentIds })
      .andWhere('item.source IN (:...sources)', {
        sources: [LibraryItemSource.DRIP, LibraryItemSource.DISCOVERY],
      })
      .groupBy('item.content_id')
      .getRawMany<{ content_id: string; total: string }>();

    return new Map(rows.map((row) => [row.content_id, Number(row.total)]));
  }

  /**
   * 완청한 시리즈의 최대 `episode_no` — 시리즈 연속성 가점과 다음 편 허용 판정의 입력이다
   * (`drip-scheduling.md` 4.2 ③·7장 "episode_no 순서를 지킨다").
   * 삭제분도 포함한다 — 들었다는 사실은 목록에서 지운다고 없어지지 않는다.
   */
  async findCompletedSeriesMaxEpisodes(
    userId: string,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .withDeleted()
      .innerJoin('item.content', 'content')
      .select('content.series_id', 'series_id')
      .addSelect('MAX(content.episode_no)', 'max_episode_no')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.status = :status', {
        status: LibraryItemStatus.COMPLETED,
      })
      .andWhere('content.series_id IS NOT NULL')
      .groupBy('content.series_id')
      .getRawMany<{ series_id: string; max_episode_no: number | null }>();

    return new Map(
      rows
        .filter((row) => row.max_episode_no !== null)
        .map((row) => [row.series_id, Number(row.max_episode_no)]),
    );
  }

  /**
   * 완청한 **고유 콘텐츠 수** — `profile-api.md` 4.1 `completed_content_count`.
   *
   * **`deleted_at`을 가리지 않는다**(`withDeleted`). 라이브러리에서 지웠다고 들었던 사실이
   * 사라지지는 않으므로 누적 지표에서 빼지 않는다(`profile-api.md` 8장 — "deleted_at 무관").
   *
   * `(user_id, content_id)`가 유니크라 행 수가 곧 고유 콘텐츠 수이지만, **`DISTINCT`를
   * 명시한다** — 제약이 바뀌면 조용히 중복이 세어지는 것보다 쿼리가 의도를 말하는 편이 낫다.
   */
  async countCompletedContentsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.scoped(manager)
      .createQueryBuilder('item')
      .withDeleted()
      .select('COUNT(DISTINCT item.content_id)', 'total')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.status = :status', {
        status: LibraryItemStatus.COMPLETED,
      })
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
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
    this.applySourceFilter(builder, query.sourceFilter);
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
  /**
   * 주제 필터 팝업의 주제별 담긴 건수(`library-api.md` 4.2).
   *
   * **집계를 SQL에서 끝낸다.** 종전에는 라이브러리의 `content_id`를 전부 읽어 주제 조인
   * 결과를 받은 뒤 애플리케이션에서 세었는데, 그 목록은 담은 만큼 자라고 팝업을 열 때마다
   * 만들어진다. `GROUP BY`가 하는 일을 두 번 왕복해서 대신하고 있었다.
   *
   * 정렬은 `topics.display_order`다 — 노출 순서를 응답 조립부가 다시 정하지 않는다.
   */
  async countByTopicForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<{ topicId: string; name: string; itemCount: number }[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('item')
      .innerJoin('item.content', 'content', VISIBLE_CONTENT_CONDITION, {
        publishedStatus: ContentStatus.PUBLISHED,
      })
      .innerJoin(
        'content_topics',
        'content_topic',
        'content_topic.content_id = item.content_id',
      )
      .innerJoin('topics', 'topic', 'topic.id = content_topic.topic_id')
      .select('topic.id', 'topic_id')
      .addSelect('topic.name', 'name')
      .addSelect('COUNT(*)', 'item_count')
      .where('item.user_id = :userId', { userId })
      .groupBy('topic.id')
      .addGroupBy('topic.name')
      .addGroupBy('topic.display_order')
      .orderBy('topic.display_order', 'ASC')
      .getRawMany<{ topic_id: string; name: string; item_count: string }>();

    return rows.map((row) => ({
      topicId: row.topic_id,
      name: row.name,
      itemCount: Number(row.item_count),
    }));
  }

  /**
   * 미니플레이어 복원 대상 1건(`library-api.md` 4.3) — 이어 들을 위치가 남아 있는 것 중
   * 가장 최근에 들은 항목.
   *
   * **"위치가 남아 있다"를 `EXISTS`로 본다.** 종전에는 사용자의 시작한 `content_id`를 전부
   * 읽어 `IN` 목록으로 넘겼는데, 그 목록은 청취 이력만큼 자라고 **앱을 켤 때마다** 만들어진다.
   * 여기서 필요한 것은 존재 여부 하나이고, `uq_playback_progresses_user_id_content_id`가
   * 그 검사를 인덱스로 받는다.
   */
  async findLatestResumable(
    userId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
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
      .andWhere(
        `EXISTS (
           SELECT 1 FROM playback_progresses progress
           WHERE progress.content_id = item.content_id
             AND progress.user_id = item.user_id
             AND progress.position_sec > 0
         )`,
      )
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

  /**
   * 콘텐츠 축으로 찾되 **`content` 관계를 함께 읽는다.**
   *
   * 플레이어의 위치 저장이 이 경로로 완청을 판정하는데(`player-api.md` 4.3), 판정에는
   * `contents.duration_sec`이 필요하다. 관계를 안 읽으면 `LibraryService.completeItem`이
   * 길이를 0으로 보고 **90% 검사를 건너뛴 채 완료 처리한다** — 가짜 완청이 된다.
   */
  async findByUserIdAndContentIdWithContent(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.scoped(manager).findOne({
      where: { userId, contentId },
      relations: { content: true },
    });
  }

  /**
   * 담기(explore-api.md 4.3)가 쓰는 조회 — **"행이 없음"과 "삭제된 행이 있음"을 갈라야 한다.**
   * 앞은 새로 만들어 201이고 뒤는 되살려 200이라, 삭제분을 감춘 조회로는 판정할 수 없다.
   */
  async findByUserIdAndContentIdWithDeleted(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<LibraryItem | null> {
    return this.scoped(manager).findOne({
      where: { userId, contentId },
      withDeleted: true,
    });
  }

  /**
   * 탐색 피드의 "담김" 표시용(explore-api.md 4.1) — **삭제분은 제외한다.**
   * 지운 콘텐츠는 사용자에게 담겨 있지 않으므로, 담기 시트도 [담기]가 떠야 한다.
   */
  async findAllActiveByUserIdAndContentIds(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<LibraryItem[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({
      userId,
      contentId: In(contentIds),
    });
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

  /**
   * 회수(FR-32) — 해당 콘텐츠를 가진 **전체 사용자**의 항목을 일괄 소프트 삭제한다
   * (partner-control.md 4.3 처리 순서 3). 이미 삭제된 행은 건드리지 않는다 —
   * 복구(restore) 때 "회수로 지운 것"만 판별할 수는 없지만, 복구는 어차피
   * `library_items`를 되살리지 않으므로(4.3) 구분이 필요 없다.
   */
  async softDeleteAllByContentId(
    contentId: string,
    deletedAt: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update()
      .set({ deletedAt })
      .where('content_id = :contentId AND deleted_at IS NULL', { contentId })
      .execute();

    return result.affected ?? 0;
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
      case LibraryItemFilter.ALL:
        break;
    }
  }

  /**
   * 출처 축(library-api.md 4.1). **상태·주제와는 AND다.**
   *
   * `SAVE`가 `onboarding`까지 포함하는 이유는 온보딩의 [담기]도 사용자가 직접 고른
   * 것이기 때문이다. `source`를 세 값으로 나눠 기록하는 것은 유입 경로 분석용이고,
   * 화면의 출처는 "이어가 보내준 것"과 "내가 담은 것" 둘뿐이다.
   */
  private applySourceFilter(
    builder: SelectQueryBuilder<LibraryItem>,
    sourceFilter: LibraryItemSourceFilter | null,
  ): void {
    if (sourceFilter === null) {
      return;
    }

    builder.andWhere('item.source IN (:...filteredSources)', {
      filteredSources: SOURCES_BY_SOURCE_FILTER[sourceFilter],
    });
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
