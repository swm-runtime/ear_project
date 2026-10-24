import { shiftServiceDate } from '@/common/utils/service-date.util';
import { ContentTopicView } from '@/modules/content/content.types';
import {
  ContentDailyListenedSecView,
  ContentListenedSecView,
} from '@/modules/playback/playback.types';

import {
  TOPIC_HIGHLIGHT_CONCENTRATED_RATIO,
  LISTENING_HIGHLIGHT_MIN_DIFF_SEC,
  LISTENING_TOP_PERCENT_MAX,
  TOPIC_DISTRIBUTION_TOP_LIMIT,
  TOPIC_DISTRIBUTION_TOTAL_RATIO,
  WEEKLY_LISTENING_DAY_COUNT,
} from './profile.constant';
import {
  DailyListeningHighlightView,
  ListeningHighlightView,
  TopicDistributionItemView,
  TopicDistributionView,
  TopicRefView,
} from './profile.types';

/**
 * 통계 판정 규칙을 **순수 함수로 모은다** — 값만 넣으면 결과가 정해져 DB 없이 검증할 수 있다.
 *
 * 규칙의 소유자가 프로필 화면이므로(`profile.md` 4.5~4.7) 원천을 가진 모듈이 아니라
 * 여기에 둔다. Repository·시각에 의존하지 않아야 05시 경계·오늘 미청취·동률 반올림 같은
 * 경계 케이스를 테스트로 고정할 수 있다(convention.md 7.3 — `Date.now()`를 직접 쓰지 않는다).
 */

/**
 * 연속 청취 일수(`profile.md` 4.5).
 *
 * - 그 서비스 날짜에 재생 기록이 **1건이라도** 있으면 "들은 날"이다. 최소 청취 시간 조건은
 *   두지 않는다(확정 2026-08-06).
 * - **오늘 아직 듣지 않았어도 어제까지 이어진 연속 기록을 그대로 돌려준다.** 오늘 들으면
 *   +1 되고, 어제도 오늘도 듣지 않았으면 0이다 — 하루가 지났다고 기록을 깎지 않는다.
 * - 기준 날짜(`today`)는 **서버가 05시 경계로 계산한 서비스 날짜**다. 기기 시각으로 다시
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
 * 주간 카드의 **그 주 분포 + 요일별 분포 7개**(`profile.md` 4.7 · KAN-113).
 *
 * 원천은 콘텐츠 × 서비스 날짜별 청취 시간이다. 주 분포는 7일을 콘텐츠별로 합친 뒤, 요일 분포는
 * 그 날짜의 행만으로 각각 `buildTopicDistribution`을 돌린다 — **규칙(상위 5 · 기타 · 합 100)이
 * 한 함수에만 있다.** 기록 없는 요일·아직 오지 않은 요일도 빈 분포로 자리를 지킨다(생략 없음).
 *
 * @param weekDates 그 주가 덮는 서비스 날짜 7개(월→일 순서)
 * @param listenedByContentAndDate 콘텐츠 × 날짜별 청취 시간(그 주 범위)
 * @param topicViews 등장한 콘텐츠들의 주제 매핑
 */
export function buildWeeklyTopicDistributions(
  weekDates: readonly string[],
  listenedByContentAndDate: readonly ContentDailyListenedSecView[],
  topicViews: readonly ContentTopicView[],
): {
  weekly: TopicDistributionView;
  daily: TopicDistributionView[];
} {
  const weeklyByContent = new Map<string, number>();
  const dailyByDate = new Map<string, ContentListenedSecView[]>();

  for (const row of listenedByContentAndDate) {
    weeklyByContent.set(
      row.contentId,
      (weeklyByContent.get(row.contentId) ?? 0) + row.listenedSec,
    );

    const rows = dailyByDate.get(row.playDate) ?? [];
    rows.push({ contentId: row.contentId, listenedSec: row.listenedSec });
    dailyByDate.set(row.playDate, rows);
  }

  const weekly = buildTopicDistribution(
    [...weeklyByContent.entries()].map(([contentId, listenedSec]) => ({
      contentId,
      listenedSec,
    })),
    topicViews,
  );

  const daily = weekDates
    .slice(0, WEEKLY_LISTENING_DAY_COUNT)
    .map((date) =>
      buildTopicDistribution(dailyByDate.get(date) ?? [], topicViews),
    );

  return { weekly, daily };
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

/**
 * 그 주 청취 시간 전체 상위 %(`profile-api.md` 4.1 `listening_top_percent`, KAN-168).
 *
 * - `순위 = 1 + 나보다 많이 들은 사용자 수` — 동점은 같은 순위(좋은 쪽)다.
 * - `상위 % = ceil(순위 / 모집단 × 100)` — 1등도 0%가 아니라 최소 1%다.
 * - 그 주 청취가 0초이거나 상한(`LISTENING_TOP_PERCENT_MAX`)보다 뒤면 `null` — 화면은 알약을 그리지 않는다.
 *
 * @param listenedSec 그 주 내 청취 시간 합(초)
 * @param listenedMoreCount 그 주 청취 시간 합이 나보다 많은 사용자 수
 * @param population 모집단 — 그 주가 끝나기 전에 가입한 전체 계정 수(0초 사용자 포함)
 */
export function calculateListeningTopPercent(
  listenedSec: number,
  listenedMoreCount: number,
  population: number,
): number | null {
  if (listenedSec <= 0 || population <= 0) {
    return null;
  }

  const rank = listenedMoreCount + 1;
  // 집계 사이에 가입·청취가 끼면 순위가 모집단을 넘을 수 있다 — 100%를 넘기지 않는다
  const percent = Math.min(Math.ceil((rank / population) * 100), 100);

  return percent > LISTENING_TOP_PERCENT_MAX ? null : percent;
}

/**
 * 주간 카드의 한 줄(`profile-api.md` 4.1 `listening_highlight`, KAN-170) — **첫 번째로 해당하는 하나**만 고른다.
 *
 * 1. 상위 % — `listening_top_percent`가 있으면(KAN-168 규칙 그대로)
 * 2. 전주보다 더 — 그 주 합이 비교 대상보다 `LISTENING_HIGHLIGHT_MIN_DIFF_SEC` 이상 많으면. **줄어든 쪽은 내려주지
 *    않는다**("N분 덜"은 기를 꺾는다). 비교 대상이 없으면(가입 주) 건너뛴다
 * 3. 들은 날 수 — 그 주 들은 날이 하루라도 있으면
 *
 * 그 주 0초면 `null`이다.
 *
 * @param dailyListenedSec 그 주 월~일 7개
 * @param topPercent `calculateListeningTopPercent`의 결과
 * @param previousSec 비교 대상 청취 합(초). 비교할 직전 주가 없으면 `null`
 */
export function pickListeningHighlight(
  dailyListenedSec: readonly number[],
  topPercent: number | null,
  previousSec: number | null,
): ListeningHighlightView | null {
  const weekSec = dailyListenedSec.reduce((sum, sec) => sum + sec, 0);

  if (weekSec <= 0) {
    return null;
  }

  if (topPercent !== null) {
    return { kind: 'top_percent', percent: topPercent };
  }

  if (
    previousSec !== null &&
    weekSec - previousSec >= LISTENING_HIGHLIGHT_MIN_DIFF_SEC
  ) {
    return { kind: 'more_than_previous', diffSec: weekSec - previousSec };
  }

  return {
    kind: 'listened_days',
    days: dailyListenedSec.filter((sec) => sec > 0).length,
  };
}

/**
 * 주간 카드의 **요일별** 한 줄(`profile-api.md` 4.1 `daily_listening_highlight`, KAN-171) — 요일 막대를 고르면
 * 주간 한 줄 자리에 그린다. 칸마다 **첫 번째로 해당하는 하나**만 고른다.
 *
 * 1. 지난주 같은 요일보다 더 — 그날이 직전 주 같은 요일보다 `LISTENING_HIGHLIGHT_MIN_DIFF_SEC` 이상 많으면.
 *    **줄어든 날은 내려주지 않는다**. 직전 주가 없으면(가입 주) 건너뛴다
 * 2. 가장 많이 들은 날 — 그 주 최댓값인 날(동률이면 모두). **그 주 들은 날이 2일 이상일 때만** — 하루만 들은 주의
 *    "가장 많이 들은 날"은 의미가 없다
 * 3. 들은 편 수 — 그날 들은 게 있으면 그날 청취 > 0 인 콘텐츠 수
 *
 * 그날 0초(진행 중인 주의 아직 안 온 요일 포함)면 `null`이다. 하루 순위(상위 %)는 넣지 않는다 — 사용자 수가 적어
 * 하루 순위는 크게 출렁인다(PM 2026-10-11).
 *
 * @param dailyListenedSec 그 주 월~일 7개
 * @param dailyContentCount 그 주 월~일 7개 — 그날 청취 > 0 인 콘텐츠 수
 * @param previousDailyListenedSec 직전 주 월~일 7개. 직전 주가 없으면 `null`
 */
export function pickDailyListeningHighlights(
  dailyListenedSec: readonly number[],
  dailyContentCount: readonly number[],
  previousDailyListenedSec: readonly number[] | null,
): (DailyListeningHighlightView | null)[] {
  const listenedDayCount = dailyListenedSec.filter((sec) => sec > 0).length;
  const bestSec = Math.max(...dailyListenedSec);

  return dailyListenedSec.map((sec, index) => {
    if (sec <= 0) {
      return null;
    }

    const diffSec =
      previousDailyListenedSec === null
        ? null
        : sec - previousDailyListenedSec[index];
    if (diffSec !== null && diffSec >= LISTENING_HIGHLIGHT_MIN_DIFF_SEC) {
      return { kind: 'more_than_last_week', diffSec };
    }

    if (listenedDayCount >= 2 && sec === bestSec) {
      return { kind: 'best_day' };
    }

    return { kind: 'listened_contents', count: dailyContentCount[index] };
  });
}

/**
 * 요일별 들은 콘텐츠 수(KAN-171 `listened_contents`) — 월~일 7개. 청취 0초 행(재생 시작만 하고 바로 끈 기록)은 세지 않는다.
 */
export function countDailyListenedContents(
  weekDates: readonly string[],
  listenedByContentAndDate: readonly ContentDailyListenedSecView[],
): number[] {
  return weekDates.map(
    (date) =>
      new Set(
        listenedByContentAndDate
          .filter((row) => row.playDate === date && row.listenedSec > 0)
          .map((row) => row.contentId),
      ).size,
  );
}

// --- 주제 한 줄(`profile.md` 4.7-1) ---

/** 주제별 청취 합(내림차순) — 여러 주제에 속한 콘텐츠는 각 주제에 그대로 더한다(4.7 분포와 같은 규칙) */
export function rankTopicsByListenedSec(
  listenedByContent: readonly ContentListenedSecView[],
  topicViews: readonly ContentTopicView[],
): (TopicRefView & { listenedSec: number })[] {
  const secByContent = new Map<string, number>();
  for (const row of listenedByContent) {
    secByContent.set(
      row.contentId,
      (secByContent.get(row.contentId) ?? 0) + row.listenedSec,
    );
  }

  const byTopic = new Map<string, TopicRefView & { listenedSec: number }>();
  for (const view of topicViews) {
    const sec = secByContent.get(view.contentId) ?? 0;
    if (sec <= 0) {
      continue;
    }
    const entry = byTopic.get(view.topicId) ?? {
      topicId: view.topicId,
      name: view.name,
      listenedSec: 0,
    };
    entry.listenedSec += sec;
    byTopic.set(view.topicId, entry);
  }

  // 동률은 topicId 순 — 같은 입력이면 같은 결과
  return [...byTopic.values()].sort(
    (a, b) =>
      b.listenedSec - a.listenedSec || a.topicId.localeCompare(b.topicId),
  );
}

/**
 * 그 주가 **한 주제에 쏠렸는지** — 들은 주제가 하나뿐이거나 1위 비율이 하한 이상이면.
 * 쏠린 사용자에게 먼저 "안 들어본 주제"를 권한다.
 */
export function isTopicConcentrated(
  weekly: TopicDistributionView,
  topicCount: number,
): boolean {
  const top = weekly.topics[0];
  if (top === undefined) {
    return false;
  }
  return topicCount <= 1 || top.ratio >= TOPIC_HIGHLIGHT_CONCENTRATED_RATIO;
}

/**
 * 안 들어본 주제 하나 — 후보(노출 주제 중 한 번도 안 들은 · 직접 해제하지 않은 것, 노출 순서대로) 가운데
 * 그 시장에서 최근 가장 많이 들린 주제. 시장 청취가 하나도 없으면 후보의 첫 번째(노출 순서)다.
 */
export function pickUnexploredTopic(
  candidates: readonly TopicRefView[],
  marketRanking: readonly (TopicRefView & { listenedSec: number })[],
): TopicRefView | null {
  if (candidates.length === 0) {
    return null;
  }
  const candidateIds = new Set(candidates.map((topic) => topic.topicId));
  const popular = marketRanking.find((topic) =>
    candidateIds.has(topic.topicId),
  );
  if (popular !== undefined) {
    return { topicId: popular.topicId, name: popular.name };
  }
  return candidates[0];
}

/**
 * 그 주 1위 주제가 **몇 주 연속** 1위였는지 — `weeklyTopTopicIds`는 이번 주부터 거슬러 간 주별 1위(기록 없는 주는 `null`).
 * 이번 주 1위가 없으면 0이다.
 */
export function countTopTopicStreak(
  weeklyTopTopicIds: readonly (string | null)[],
): number {
  const current = weeklyTopTopicIds[0];
  if (current === null || current === undefined) {
    return 0;
  }
  let weeks = 0;
  for (const topicId of weeklyTopTopicIds) {
    if (topicId !== current) {
      break;
    }
    weeks += 1;
  }
  return weeks;
}
