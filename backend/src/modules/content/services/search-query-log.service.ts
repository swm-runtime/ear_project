import { Injectable, Logger } from '@nestjs/common';

import {
  SEARCH_QUERY_LOG_MERGE_WINDOW_MS,
  SEARCH_QUERY_LOG_SUMMARY_MAX_DAYS,
} from '../content.constant';
import { SearchQueryLogSummary } from '../content.types';
import { SearchQueryLogRepository } from '../repositories/search-query-log.repository';

export interface SearchQueryLogEntry {
  userId: string;
  /** 정규화된 질의 — 조회가 본 그 문자열(`explore.md` 4.5-5) */
  normalizedQuery: string;
  /** 첫 페이지에 실린 건수 */
  resultCount: number;
  hasNext: boolean;
  topicFilterCount: number;
  /** 첫 페이지 결과의 콘텐츠 id — 결과 반응 추정의 열쇠(domain.md 5.7) */
  resultContentIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 검색 질의 로그(`search_query_logs` — domain.md 5.7)의 유일한 적재 경로.
 *
 * **한 행은 타이핑 묶음 하나다.** 디바운스 자동 검색은 "커" → "커리" → "커리어"를 전부 보내는데,
 * 그걸 전부 행으로 두면 미스율이 중간 입력에 끌려간다("커"는 거의 항상 0건이 아니고 "커리ㅇ"은
 * 거의 항상 0건이다). 같은 사용자의 직전 행이 묶음 창 안에 있고 두 질의가 **같은 타이핑으로 보이면**
 * 그 행을 마지막 질의로 덮어쓴다 — 남는 것은 사용자가 마지막으로 보고 멈춘 질의다(`isSameTyping`).
 * 접두사 관계("커리" → "커리어", 지운 "커리어" → "커")와 한 글자 고침("커리오" → "커리어",
 * "면저" → "면접")이 같은 묶음이고, "면접" → "커리어"처럼 다른 말이면 새 행이다.
 *
 * **실패해도 검색을 깨뜨리지 않는다.** 로그는 분석 재료이지 응답의 일부가 아니라서, 적재 오류는 경고
 * 한 줄로 끝내고 호출부에는 아무것도 던지지 않는다. 호출부(탐색 Orchestrator)는 결과를 조립한 뒤
 * 이 메서드를 기다리기만 하면 된다 — 조회 한 번·쓰기 한 번이라 지연은 밀리초 단위다.
 */
@Injectable()
export class SearchQueryLogService {
  private readonly logger = new Logger(SearchQueryLogService.name);

  constructor(
    private readonly searchQueryLogRepository: SearchQueryLogRepository,
  ) {}

  async record(entry: SearchQueryLogEntry, now: Date): Promise<void> {
    try {
      const latest = await this.searchQueryLogRepository.findLatestByUserId(
        entry.userId,
      );
      const draft = {
        query: entry.normalizedQuery,
        resultCount: entry.resultCount,
        hasNext: entry.hasNext,
        topicFilterCount: entry.topicFilterCount,
        resultContentIds: entry.resultContentIds,
      };

      if (
        latest &&
        now.getTime() - latest.updatedAt.getTime() <=
          SEARCH_QUERY_LOG_MERGE_WINDOW_MS &&
        isSameTyping(latest.query, entry.normalizedQuery)
      ) {
        await this.searchQueryLogRepository.overwrite(latest.id, draft);
        return;
      }

      await this.searchQueryLogRepository.insert({
        userId: entry.userId,
        ...draft,
      });
    } catch (error) {
      // 질의 본문은 남기지 않는다 — 경고 로그는 CloudWatch로 나가고 거기엔 보관 사유가 없다
      this.logger.warn('search query log write failed', {
        user_id: entry.userId,
        result_count: entry.resultCount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** 어드민 요약 — `days`는 호출부(DTO)가 1~상한으로 검증한다. 창의 시작은 `now - days` */
  async summarize(days: number, now: Date): Promise<SearchQueryLogSummary> {
    const clamped = Math.min(
      Math.max(1, days),
      SEARCH_QUERY_LOG_SUMMARY_MAX_DAYS,
    );
    const since = new Date(now.getTime() - clamped * DAY_MS);

    return this.searchQueryLogRepository.summarize(since);
  }
}

/**
 * 두 질의가 **같은 타이핑의 앞뒤 모습**인가 — 한쪽이 다른 쪽의 접두사이거나("커리" ↔ "커리어", 같은 질의의
 * 재검색 포함), 편집 거리가 1 이하다("커리오" → "커리어" 오타 고침, "커리ㅇ" → "커리어" 조합 중). 편집 거리를
 * 1로 묶는 이유: 2 이상이면 "면접" ↔ "면담"처럼 다른 말이 섞이기 시작한다
 */
export function isSameTyping(previous: string, next: string): boolean {
  if (next.startsWith(previous) || previous.startsWith(next)) {
    return true;
  }

  return editDistanceAtMostOne(previous, next);
}

/** 레벤슈타인 거리 ≤ 1 — 한 글자 바꿈·끼움·뺌. 코드포인트 단위라 NFC 정규화된 한글은 음절 하나가 한 글자다 */
function editDistanceAtMostOne(a: string, b: string): boolean {
  const left = Array.from(a);
  const right = Array.from(b);
  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (left.length > right.length) {
      i += 1; // 뺌
    } else if (left.length < right.length) {
      j += 1; // 끼움
    } else {
      i += 1; // 바꿈
      j += 1;
    }
  }

  return edits + (left.length - i) + (right.length - j) <= 1;
}
