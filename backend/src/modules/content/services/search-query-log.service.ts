import { Injectable, Logger } from '@nestjs/common';

import { SearchQueryLogRepository } from '../repositories/search-query-log.repository';

export interface SearchQueryLogEntry {
  userId: string;
  /** 정규화된 질의 — 조회가 본 그 문자열(`explore.md` 4.5-5) */
  normalizedQuery: string;
  /** 첫 페이지에 실린 건수 */
  resultCount: number;
  hasNext: boolean;
  topicFilterCount: number;
}

/**
 * 검색 질의 로그(`search_query_logs` — domain.md 5.7)의 유일한 적재 경로.
 *
 * **실패해도 검색을 깨뜨리지 않는다.** 로그는 분석 재료이지 응답의 일부가 아니라서, 적재
 * 오류는 경고 한 줄로 끝내고 호출부에는 아무것도 던지지 않는다. 호출부(탐색 Orchestrator)는
 * 결과를 조립한 뒤 이 메서드를 기다리기만 하면 된다 — 삽입 한 번이라 지연은 밀리초 단위다.
 */
@Injectable()
export class SearchQueryLogService {
  private readonly logger = new Logger(SearchQueryLogService.name);

  constructor(
    private readonly searchQueryLogRepository: SearchQueryLogRepository,
  ) {}

  async record(entry: SearchQueryLogEntry): Promise<void> {
    try {
      await this.searchQueryLogRepository.insert({
        userId: entry.userId,
        query: entry.normalizedQuery,
        resultCount: entry.resultCount,
        hasNext: entry.hasNext,
        topicFilterCount: entry.topicFilterCount,
      });
    } catch (error) {
      // 질의 본문은 남기지 않는다 — 경고 로그는 CloudWatch로 나가고 거기엔 보관 사유가 없다
      this.logger.warn('search query log insert failed', {
        user_id: entry.userId,
        result_count: entry.resultCount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
