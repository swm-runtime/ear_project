import { jamoEditSimilarity } from '@/common/utils/search-text.util';

import {
  SEARCH_CORRECTION_MAX_LENGTH_DIFF,
  SEARCH_CORRECTION_MIN_SCORE,
} from './content.constant';
import { SearchCorrectionCandidate } from './content.types';

/** 부동소수 비교 여유 — 1 − 3/10 같은 경계값이 하한에서 떨어지지 않게 */
const SCORE_EPSILON = 1e-9;

type ScoredCandidate = SearchCorrectionCandidate & {
  score: number;
  lengthDiff: number;
};

/**
 * 교정어 후보 중 하나를 고른다(KAN-238 — `explore.md` 4.5-5). 없으면 `null`.
 *
 * - **점수** = 자모 편집 유사도(`jamoEditSimilarity`, 대칭) — 하한 `SEARCH_CORRECTION_MIN_SCORE` 이상만.
 * - **길이 가드** = 글자 수(공백 포함) 차이 ±`SEARCH_CORRECTION_MAX_LENGTH_DIFF` — SQL이 이미 걸렀어도 여기서 다시 본다
 *   (이 함수만으로 규칙이 닫히게).
 * - **동점** = 태그·주제명 우선 → 빈도 → 글자 수 차이가 작은 말 → 코드포인트순(결정적이게).
 * - 원문과 같은 말은 교정어가 아니다.
 */
export function pickSearchCorrection(
  normalizedQuery: string,
  candidates: readonly SearchCorrectionCandidate[],
): string | null {
  const queryLength = Array.from(normalizedQuery).length;
  let best: ScoredCandidate | null = null;

  for (const candidate of candidates) {
    if (candidate.term === normalizedQuery) {
      continue;
    }

    const lengthDiff = Math.abs(
      Array.from(candidate.term).length - queryLength,
    );
    if (lengthDiff > SEARCH_CORRECTION_MAX_LENGTH_DIFF) {
      continue;
    }

    const score = jamoEditSimilarity(normalizedQuery, candidate.term);
    if (score < SEARCH_CORRECTION_MIN_SCORE - SCORE_EPSILON) {
      continue;
    }

    const scored: ScoredCandidate = { ...candidate, score, lengthDiff };
    if (best === null || isBetter(scored, best)) {
      best = scored;
    }
  }

  return best?.term ?? null;
}

function isBetter(a: ScoredCandidate, b: ScoredCandidate): boolean {
  if (Math.abs(a.score - b.score) > SCORE_EPSILON) {
    return a.score > b.score;
  }
  if (a.priority !== b.priority) {
    return a.priority < b.priority;
  }
  if (a.frequency !== b.frequency) {
    return a.frequency > b.frequency;
  }
  if (a.lengthDiff !== b.lengthDiff) {
    return a.lengthDiff < b.lengthDiff;
  }
  return a.term < b.term;
}
