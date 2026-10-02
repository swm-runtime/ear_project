import { Injectable, Logger } from '@nestjs/common';

import {
  SEARCH_QUERY_LOG_MERGE_WINDOW_MS,
  SEARCH_QUERY_LOG_REFETCH_WINDOW_MS,
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
 * 자모 단위 접두사 관계("커리" → "커리어", 조합 중인 "커링" → "커리어", 지운 "커리어" → "커")가 같은
 * 묶음이고, 다른 말("면접" → "면담")과 오타를 고친 질의("커리오" → "커리어")는 새 행이다 — 오타 0건이
 * 남아야 오타 허용 도입을 판단할 수 있다.
 *
 * **같은 질의의 재조회는 기록하지 않는다.** 앱은 재생이 시작되거나 포그라운드로 돌아오면 탐색 쿼리를 통째로
 * 다시 불러 같은 검색의 첫 페이지가 한 번 더 온다. 그걸 쓰면 `updated_at`이 방금의 재생보다 뒤로 밀려
 * 결과 반응이 사라지거나(묶음 창 안), 반응 없는 중복 행이 생겨 검색 수가 부푼다(묶음 창 밖).
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

      const sinceLatestMs = latest
        ? now.getTime() - latest.updatedAt.getTime()
        : Infinity;

      // 같은 검색의 재조회 — 쓰지 않는다. 주제 필터 수가 달라졌으면 결과가 다른 검색이라 아래로 내려간다
      if (
        latest &&
        sinceLatestMs <= SEARCH_QUERY_LOG_REFETCH_WINDOW_MS &&
        latest.query === entry.normalizedQuery &&
        latest.topicFilterCount === entry.topicFilterCount
      ) {
        return;
      }

      if (
        latest &&
        sinceLatestMs <= SEARCH_QUERY_LOG_MERGE_WINDOW_MS &&
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
 * 두 질의가 **같은 타이핑의 앞뒤 모습**인가 — 자모 단위로 풀었을 때 한쪽이 다른 쪽의 접두사다(domain.md 5.7).
 *
 * 음절이 아니라 자모로 보는 이유: 한글 조합은 받침이 다음 글자의 초성으로 넘어간다. "커리어"를 치는 중간
 * 모습은 "커링"인데 음절 단위로는 "커리어"의 접두사가 아니다 — 자모로 풀면 `ㅋㅓㄹㅣㅇ` ⊂ `ㅋㅓㄹㅣㅇㅓ`다.
 *
 * 한 글자 차이(편집 거리 1)는 묶지 않는다(2026-10-02 폐기) — "면접" ↔ "면담"처럼 다른 말이 합쳐지고,
 * 오타 0건("커리오")이 고친 질의("커리어")에 덮여 사라졌다.
 */
export function isSameTyping(previous: string, next: string): boolean {
  const before = toJamo(previous);
  const after = toJamo(next);

  return after.startsWith(before) || before.startsWith(after);
}

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;

/* 겹모음·겹받침은 **치는 순서대로** 푼다 — "과"는 "고" 다음에, "닭"은 "달" 다음에 나온다 */
const CHOSEONG = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];
const JUNGSEONG = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅗㅏ',
  'ㅗㅐ',
  'ㅗㅣ',
  'ㅛ',
  'ㅜ',
  'ㅜㅓ',
  'ㅜㅔ',
  'ㅜㅣ',
  'ㅠ',
  'ㅡ',
  'ㅡㅣ',
  'ㅣ',
];
const JONGSEONG = [
  '',
  'ㄱ',
  'ㄲ',
  'ㄱㅅ',
  'ㄴ',
  'ㄴㅈ',
  'ㄴㅎ',
  'ㄷ',
  'ㄹ',
  'ㄹㄱ',
  'ㄹㅁ',
  'ㄹㅂ',
  'ㄹㅅ',
  'ㄹㅌ',
  'ㄹㅍ',
  'ㄹㅎ',
  'ㅁ',
  'ㅂ',
  'ㅂㅅ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];
/** 음절로 묶이지 않고 홀로 온 겹자모(조합 중인 "ㅘ"·"ㄳ")도 같은 방식으로 푼다 */
const COMPOUND_JAMO: Record<string, string> = {
  ㅘ: 'ㅗㅏ',
  ㅙ: 'ㅗㅐ',
  ㅚ: 'ㅗㅣ',
  ㅝ: 'ㅜㅓ',
  ㅞ: 'ㅜㅔ',
  ㅟ: 'ㅜㅣ',
  ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ',
};

/** 한글 음절을 호환 자모 열로 푼다. 한글이 아닌 글자는 그대로 둔다 — 질의는 이미 NFC다(`explore.md` 4.5-5) */
function toJamo(text: string): string {
  let jamo = '';

  for (const char of text) {
    const code = char.codePointAt(0)!;

    if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) {
      jamo += COMPOUND_JAMO[char] ?? char;
      continue;
    }

    const offset = code - HANGUL_SYLLABLE_START;
    jamo +=
      CHOSEONG[Math.floor(offset / (JUNGSEONG_COUNT * JONGSEONG_COUNT))] +
      JUNGSEONG[Math.floor(offset / JONGSEONG_COUNT) % JUNGSEONG_COUNT] +
      JONGSEONG[offset % JONGSEONG_COUNT];
  }

  return jamo;
}
