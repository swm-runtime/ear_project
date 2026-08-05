import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { LibraryItem } from './library-item.entity';
import { LibraryItemSource } from './library.enum';

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
}
