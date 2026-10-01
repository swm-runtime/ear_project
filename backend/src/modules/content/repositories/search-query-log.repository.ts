import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { SearchQueryLog } from '../entities/search-query-log.entity';

export type SearchQueryLogDraft = Pick<
  SearchQueryLog,
  'userId' | 'query' | 'resultCount' | 'hasNext' | 'topicFilterCount'
>;

@Injectable()
export class SearchQueryLogRepository {
  constructor(
    @InjectRepository(SearchQueryLog)
    private readonly repository: Repository<SearchQueryLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<SearchQueryLog> {
    return manager ? manager.getRepository(SearchQueryLog) : this.repository;
  }

  /** 행 하나를 더한다. 읽어서 돌려줄 일이 없어 `insert`만 한다(엔티티 재조회 없음) */
  async insert(
    draft: SearchQueryLogDraft,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert(draft);
  }
}
