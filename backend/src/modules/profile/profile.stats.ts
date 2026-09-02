import { ContentTopicView } from '@/modules/content/content.types';
import { ContentListenedSecView } from '@/modules/playback/playback.types';

import {
  TOPIC_DISTRIBUTION_TOP_LIMIT,
  TOPIC_DISTRIBUTION_TOTAL_RATIO,
} from './profile.constant';
import {
  TopicDistributionItemView,
  TopicDistributionView,
} from './profile.types';

/**
 * 통계 판정 규칙을 **순수 함수로 모은다**(`explore.ranking.ts`와 같은 형태).
 *
 * 규칙의 소유자가 프로필 화면이므로(`profile.md` 4.5~4.7) 원천을 가진 모듈이 아니라
 * 여기에 둔다. Repository·시각에 의존하지 않아야 04시 경계·오늘 미청취·동률 반올림 같은
 * 경계 케이스를 테스트로 고정할 수 있다(convention.md 7.3 — `Date.now()`를 직접 쓰지 않는다).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` 라벨을 UTC 필드에 담은 Date로. 계산 전용이며 저장하지 않는다 */
function parseServiceDate(label: string): Date {
  const [year, month, day] = label.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftServiceDate(label: string, days: number): string {
  const shifted = new Date(parseServiceDate(label).getTime() + days * DAY_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 연속 청취 일수(`profile.md` 4.5).
 *
 * - 그 서비스 날짜에 재생 기록이 **1건이라도** 있으면 "들은 날"이다. 최소 청취 시간 조건은
 *   두지 않는다(확정 2026-08-06).
 * - **오늘 아직 듣지 않았어도 어제까지 이어진 연속 기록을 그대로 돌려준다.** 오늘 들으면
 *   +1 되고, 어제도 오늘도 듣지 않았으면 0이다 — 하루가 지났다고 기록을 깎지 않는다.
 * - 기준 날짜(`today`)는 **서버가 04시 경계로 계산한 서비스 날짜**다. 기기 시각으로 다시
 *   판정하지 않기 위해 호출부가 계산해 넘긴다.
 *
 * @param playDates 재생 기록이 있는 서비스 날짜(중복 없음, 순서 무관)
 * @param today 오늘의 서비스 날짜(`YYYY-MM-DD`)
 */
export function calculateStreakDays(
  playDates: readonly string[],
  today: string,
): number {
  if (playDates.length === 0) {
    return 0;
  }

  const played = new Set(playDates);
  const yesterday = shiftServiceDate(today, -1);

  // 오늘 들었으면 오늘부터, 아니면 어제부터 거슬러 센다 — 오늘의 미청취가 기록을 끊지 않는다
  let cursor = played.has(today) ? today : yesterday;

  if (!played.has(cursor)) {
    return 0;
  }

  let streak = 0;

  while (played.has(cursor)) {
    streak += 1;
    cursor = shiftServiceDate(cursor, -1);
  }

  return streak;
}

/**
 * 주간 그래프의 요일별 막대(`profile.md` 4.6).
 *
 * **월~일 7개 고정 배열이며 값 생략이 없다.** 기록 없는 요일은 0으로 자리를 지킨다 —
 * 배열 길이가 요일 수와 다르면 화면이 인덱스로 요일을 셀 수 없다.
 *
 * @param weekDates 그 주가 덮는 서비스 날짜 7개(월→일 순서)
 * @param listenedSecByDate 날짜별 청취 시간 합
 */
export function buildWeeklyBuckets(
  weekDates: readonly string[],
  listenedSecByDate: ReadonlyMap<string, number>,
): number[] {
  return weekDates.map((date) => listenedSecByDate.get(date) ?? 0);
}

/**
 * 주제 분포(`profile.md` 4.7).
 *
 * - 원천은 콘텐츠별 청취 시간 × 콘텐츠의 주제다. **여러 주제에 속한 콘텐츠는 각 주제에
 *   청취 시간을 그대로 더한다** — 분할 배분하면 다주제 콘텐츠의 비중이 실제 청취보다 축소된다.
 * - 그렇게 만든 합계는 전체 청취 시간보다 클 수 있으므로 **주제 합계 총량 대비**로 정규화한다.
 * - 상위 5개만 개별 항목으로 내려주고 나머지는 `othersRatio`로 묶는다.
 * - **합이 정확히 100이 되도록 반올림 오차를 서버가 흡수한다**(`profile-api.md` 4.1 —
 *   클라이언트는 재정규화하지 않는다). 오차는 가장 큰 항목에 몰아 준다: 작은 조각에 얹으면
 *   순위가 뒤바뀌어 보인다.
 * - 숨김 주제(`topics.is_visible = false`)도 청취 기록이 있으면 포함한다. 거르는 판정은
 *   호출부가 하지 않는다 — 관심 주제 요약과 같은 기준이다.
 */
export function buildTopicDistribution(
  listenedByContent: readonly ContentListenedSecView[],
  topicViews: readonly ContentTopicView[],
): TopicDistributionView {
  const listenedByContentId = new Map(
    listenedByContent.map((row) => [row.contentId, row.listenedSec]),
  );

  const totals = new Map<string, { name: string; listenedSec: number }>();

  for (const view of topicViews) {
    const listenedSec = listenedByContentId.get(view.contentId) ?? 0;

    if (listenedSec <= 0) {
      continue;
    }

    const current = totals.get(view.topicId);

    if (current) {
      current.listenedSec += listenedSec;
      continue;
    }

    totals.set(view.topicId, { name: view.name, listenedSec });
  }

  const grandTotal = [...totals.values()].reduce(
    (sum, entry) => sum + entry.listenedSec,
    0,
  );

  if (grandTotal === 0) {
    return { topics: [], othersRatio: 0 };
  }

  const ranked = [...totals.entries()].sort(
    ([, a], [, b]) => b.listenedSec - a.listenedSec,
  );

  const top = ranked.slice(0, TOPIC_DISTRIBUTION_TOP_LIMIT);
  const rest = ranked.slice(TOPIC_DISTRIBUTION_TOP_LIMIT);

  const topics: TopicDistributionItemView[] = top.map(([topicId, entry]) => ({
    topicId,
    name: entry.name,
    ratio: Math.round(
      (entry.listenedSec / grandTotal) * TOPIC_DISTRIBUTION_TOTAL_RATIO,
    ),
  }));

  const othersListenedSec = rest.reduce(
    (sum, [, entry]) => sum + entry.listenedSec,
    0,
  );
  const othersRatio =
    othersListenedSec === 0
      ? 0
      : Math.round(
          (othersListenedSec / grandTotal) * TOPIC_DISTRIBUTION_TOTAL_RATIO,
        );

  return adjustToTotalRatio({ topics, othersRatio });
}

/**
 * 반올림으로 어긋난 합을 100에 맞춘다. **가장 큰 항목이 오차를 흡수한다.**
 *
 * `othersRatio`에 몰아주면 상위 5개가 작을 때 "기타"가 부풀어 보이고, 작은 조각에 얹으면
 * 정렬 순서가 화면에서 뒤집힌다. 가장 큰 항목은 ±1로 순위가 바뀌지 않는다.
 */
function adjustToTotalRatio(
  distribution: TopicDistributionView,
): TopicDistributionView {
  const sum =
    distribution.topics.reduce((total, topic) => total + topic.ratio, 0) +
    distribution.othersRatio;
  const gap = TOPIC_DISTRIBUTION_TOTAL_RATIO - sum;

  if (gap === 0 || distribution.topics.length === 0) {
    return gap === 0
      ? distribution
      : // 상위가 하나도 없으면 기타가 전부다 — 그때는 기타가 오차를 받는다
        { ...distribution, othersRatio: distribution.othersRatio + gap };
  }

  const [largest, ...others] = distribution.topics;

  return {
    topics: [{ ...largest, ratio: largest.ratio + gap }, ...others],
    othersRatio: distribution.othersRatio,
  };
}
