import { UserDripPlan } from '@/modules/drip-batch/drip-batch.types';
import { ScoredCandidate } from '@/modules/drip/drip.types';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { LibraryItemSource } from '@/modules/library/library.enum';

import {
  HIT_KS,
  ListAccumulator,
  PickedItem,
  randomRankingMetrics,
  rankingMetrics,
} from './eval-metrics';
import {
  PERSONAS,
  PersonaContext,
  PersonaDay,
  PersonaSetup,
} from './eval-personas';
import { buildVerdict } from './eval-report';
import { EvalWorld, WorldContent } from './eval-world';
import {
  BacktestReport,
  EvalReport,
  EvalSnapshot,
  InvariantResult,
  ListMetrics,
  PersonaReport,
} from './recommend-eval.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 사용자 한 명에게서 뽑는 백테스트 사례 상한 — 헤비 유저 한 명이 결과를 끌고 가지 않게 한다 */
const BACKTEST_CASES_PER_USER = 5;

/** 사용자가 **스스로 고른** 라이브러리 출처 — 드립·탐험으로 받은 것은 추천기가 고른 것이라 백테스트 정답이 못 된다 */
const SELF_CHOSEN_SOURCES: string[] = [
  LibraryItemSource.SAVE,
  LibraryItemSource.ONBOARDING,
];

export interface EvalOptions {
  /** 페르소나 시뮬레이션 일수 */
  simulationDays: number;
  /** 자동 확장 서버 스위치를 켠 것으로 평가할지 — 운영 스위치와 무관하게 "켜면 어떻게 되는가"를 본다 */
  autoExpandFeature: boolean;
  gitSha: string | null;
  baseline: EvalReport | null;
}

export const DEFAULT_EVAL_OPTIONS: EvalOptions = {
  simulationDays: 7,
  autoExpandFeature: true,
  gitSha: null,
  baseline: null,
};

/**
 * 추천 평가 한 번(`docs/backend/recommendation-evaluation.md`).
 *
 * 세 가지를 같은 스냅샷 위에서 돌린다:
 * 1. **백테스트** — 실사용자가 스스로 고르고 완청한 콘텐츠를, 고르기 직전 시점으로 되감은 세계에서 정규 편성
 *    순위가 몇 위에 세웠는가(적중률·MRR). 인기순·무작위와 같은 후보 위에서 비교한다.
 * 2. **편성분 지표** — 실사용자 전원에게 "지금 배치를 돌리면" 나오는 편성분의 다양성·신규·저노출·커버리지.
 * 3. **페르소나 시뮬레이션** — 합성 사용자들이 며칠간 받고 반응하는 것을 돌려 기대 동작(검사)과 고갈·커버리지를 본다.
 *
 * 그리고 셋 모두의 편성 계산마다 **불변식**을 검사한다 — 숫자가 아니라 "일어나면 안 되는 일"이다.
 */
export async function runEvaluation(
  snapshot: EvalSnapshot,
  options: EvalOptions = DEFAULT_EVAL_OPTIONS,
): Promise<EvalReport> {
  const exportedAt = new Date(snapshot.exported_at);
  const world = EvalWorld.fromSnapshot(snapshot);
  const invariants = new InvariantCollector();
  const hasUsers = world.users.size > 0;

  const backtest = hasUsers
    ? await runBacktest(world, options, invariants)
    : null;
  const lists = hasUsers
    ? await runLists(world, exportedAt, options, invariants)
    : null;
  const { metrics: simulation, personas } = await runSimulation(
    world,
    exportedAt,
    options,
    invariants,
  );

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    gitSha: options.gitSha,
    snapshot: {
      exportedAt: snapshot.exported_at,
      environment: snapshot.environment,
      contents: snapshot.contents.length,
      topics: snapshot.topics.length,
      users: snapshot.users.length,
    },
    options: {
      simulationDays: options.simulationDays,
      autoExpandFeature: options.autoExpandFeature,
    },
    backtest,
    lists,
    simulation,
    personas,
    invariants: invariants.results(),
    verdict: { passed: true, failures: [], warnings: [] },
  };
  report.verdict = buildVerdict(report, options.baseline);

  return report;
}

// ── 1. 백테스트 ──────────────────────────────────────────────────────────────

async function runBacktest(
  world: EvalWorld,
  options: EvalOptions,
  invariants: InvariantCollector,
): Promise<BacktestReport> {
  const modelRanks: (number | null)[] = [];
  const popularityRanks: (number | null)[] = [];
  const poolSizes: (number | null)[] = [];
  const usersWithCases = new Set<string>();
  let reachable = 0;

  for (const user of world.users.values()) {
    const cases = user.library
      .filter(
        (item) =>
          SELF_CHOSEN_SOURCES.includes(item.source) &&
          item.completedAt !== null &&
          world.contents.has(item.contentId),
      )
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, BACKTEST_CASES_PER_USER);

    for (const item of cases) {
      // 고르기 직전 — 그 콘텐츠가 아직 라이브러리에 없고, 이후의 신호도 없는 세계
      const past = world.at(item.addedAt);

      if (!past.contents.has(item.contentId)) {
        continue;
      }

      const plan = await past.plan(user.key, item.addedAt, {
        commit: false,
        autoExpandFeature: options.autoExpandFeature,
      });

      if (plan.skipReason === 'no_interests') {
        continue;
      }

      invariants.check(past, user.key, plan, `backtest:${user.key}`);
      usersWithCases.add(user.key);

      const scored = plan.regular?.scored ?? [];
      const index = scored.findIndex(
        (candidate) => candidate.content.id === item.contentId,
      );

      if (index === -1) {
        // 관심 밖 주제(또는 시리즈 게이트)라 정규 후보에 없었다 — 어떤 순위 방법으로도 맞힐 수 없다
        modelRanks.push(null);
        popularityRanks.push(null);
        poolSizes.push(null);
        continue;
      }

      reachable += 1;
      modelRanks.push(index + 1);
      poolSizes.push(scored.length);

      const byPopularity = [...scored].sort(
        (a, b) =>
          b.playCount - a.playCount ||
          b.content.publishedAt.getTime() - a.content.publishedAt.getTime() ||
          a.content.id.localeCompare(b.content.id),
      );
      popularityRanks.push(
        byPopularity.findIndex(
          (candidate) => candidate.content.id === item.contentId,
        ) + 1,
      );
    }
  }

  return {
    cases: modelRanks.length,
    users: usersWithCases.size,
    reachableShare: modelRanks.length === 0 ? 0 : reachable / modelRanks.length,
    model: rankingMetrics(modelRanks, HIT_KS),
    popularity: rankingMetrics(popularityRanks, HIT_KS),
    random: randomRankingMetrics(poolSizes, HIT_KS),
  };
}

// ── 2. 실사용자 편성분 지표 ───────────────────────────────────────────────────

async function runLists(
  world: EvalWorld,
  now: Date,
  options: EvalOptions,
  invariants: InvariantCollector,
): Promise<ListMetrics> {
  const accumulator = new ListAccumulator();

  for (const user of world.users.values()) {
    const plan = await world.plan(user.key, now, {
      commit: false,
      autoExpandFeature: options.autoExpandFeature,
    });

    if (plan.skipReason === 'no_interests') {
      continue;
    }

    invariants.check(world, user.key, plan, `lists:${user.key}`);
    accumulator.add({
      userKey: user.key,
      now,
      regularTarget: plan.dripCount ?? 0,
      regularPicks: plan.regular?.picks.length ?? 0,
      picks: pickedItems(world, plan),
      autoExpandAction: plan.autoExpand?.action ?? null,
    });
  }

  return accumulator.finish(world.visibleContents(now).length);
}

// ── 3. 페르소나 시뮬레이션 ────────────────────────────────────────────────────

async function runSimulation(
  source: EvalWorld,
  start: Date,
  options: EvalOptions,
  invariants: InvariantCollector,
): Promise<{ metrics: ListMetrics; personas: PersonaReport[] }> {
  // 실사용자의 편성 이력(노출 수)은 그대로 두고 그 위에 합성 사용자를 얹는다
  const world = source.clone();
  const context = buildPersonaContext(world, start);
  const accumulator = new ListAccumulator();
  const active: {
    persona: (typeof PERSONAS)[number];
    setup: PersonaSetup;
    days: PersonaDay[];
  }[] = [];
  const reports: PersonaReport[] = [];

  for (const persona of PERSONAS) {
    const setup = persona.setup(context);

    if (typeof setup === 'string') {
      reports.push({
        name: persona.name,
        description: persona.description,
        skipped: setup,
        days: 0,
        picks: 0,
        likedTopicShare: null,
        exhaustedOnDay: null,
        autoExpandOnDay: null,
        checks: [],
      });
      continue;
    }

    active.push({ persona, setup, days: [] });
  }

  for (let day = 1; day <= options.simulationDays; day += 1) {
    const now = new Date(start.getTime() + (day - 1) * MS_PER_DAY);

    for (const entry of active) {
      const { key } = entry.setup;
      const plan = await world.plan(key, now, {
        commit: true,
        autoExpandFeature: options.autoExpandFeature,
      });
      invariants.check(world, key, plan, `sim:${entry.persona.name}:day${day}`);

      const regular = plan.regular?.picks ?? [];
      const discovery = plan.discovery?.picks ?? [];
      accumulator.add({
        userKey: key,
        now,
        regularTarget: plan.dripCount ?? 0,
        regularPicks: regular.length,
        picks: pickedItems(world, plan),
        autoExpandAction: plan.autoExpand?.action ?? null,
      });
      entry.days.push({
        day,
        activeTopicIds: [...plan.activeTopicIds],
        autoExpandAction: plan.autoExpand?.action ?? 'none',
        autoExpandAddTopicId: plan.autoExpand?.addTopicId ?? null,
        regularTarget: plan.dripCount ?? 0,
        regular: regular.map(toPersonaPick),
        discovery: discovery.map(toPersonaPick),
      });

      // 적립 → 반응. 반응 시각을 편성 뒤로 조금 밀어 신호 순서를 실제와 같게 둔다
      world.place(
        key,
        regular.map((pick) => pick.content.id),
        LibraryItemSource.DRIP,
        now,
      );
      world.place(
        key,
        discovery.map((pick) => pick.content.id),
        LibraryItemSource.DISCOVERY,
        now,
      );

      for (const pick of [...regular, ...discovery]) {
        const content = world.contents.get(pick.content.id);

        if (!content) {
          continue;
        }

        const reaction = entry.setup.react(content);
        const at = new Date(now.getTime() + MS_PER_DAY / 4);

        if (reaction === 'complete') {
          world.complete(key, pick.content.id, at);
        } else if (reaction === 'delete') {
          world.remove(key, pick.content.id, at);
        }
      }
    }
  }

  for (const entry of active) {
    const regularPicks = entry.days.flatMap((day) => day.regular);
    const liked = regularPicks.filter((pick) =>
      pick.topicIds.some((topicId) =>
        entry.setup.likedTopicIds.includes(topicId),
      ),
    ).length;
    const autoSlotDay = entry.days.find((day) =>
      world
        .user(entry.setup.key)
        .interests.some(
          (interest) =>
            interest.source === (UserInterestSource.AUTO_EXPAND as string) &&
            day.activeTopicIds.includes(interest.topicId),
        ),
    );

    reports.push({
      name: entry.persona.name,
      description: entry.persona.description,
      skipped: null,
      days: entry.days.length,
      picks:
        regularPicks.length +
        entry.days.reduce((sum, day) => sum + day.discovery.length, 0),
      likedTopicShare:
        regularPicks.length === 0 ? null : liked / regularPicks.length,
      exhaustedOnDay:
        entry.days.find((day) => day.regular.length < day.regularTarget)?.day ??
        null,
      autoExpandOnDay: autoSlotDay?.day ?? null,
      checks: entry.setup.check(entry.days, {
        autoExpandFeature: options.autoExpandFeature,
      }),
    });
  }

  // 정의한 순서대로 싣는다(건너뛴 것 포함)
  reports.sort(
    (a, b) =>
      PERSONAS.findIndex((persona) => persona.name === a.name) -
      PERSONAS.findIndex((persona) => persona.name === b.name),
  );

  return {
    metrics: accumulator.finish(world.visibleContents(start).length),
    personas: reports,
  };
}

function buildPersonaContext(world: EvalWorld, start: Date): PersonaContext {
  const visible = world.visibleContents(start);
  const byTopic = new Map<string, WorldContent[]>();

  for (const entry of visible) {
    for (const topicId of entry.topicIds) {
      if (world.topics.get(topicId)?.isVisible !== true) {
        continue;
      }

      const list = byTopic.get(topicId) ?? [];
      list.push(entry);
      byTopic.set(topicId, list);
    }
  }

  for (const list of byTopic.values()) {
    list.sort(
      (a, b) =>
        b.playCount - a.playCount || a.content.id.localeCompare(b.content.id),
    );
  }

  return {
    world,
    start,
    topics: [...byTopic.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([topicId]) => topicId),
    contentsOf: (topicId) => byTopic.get(topicId) ?? [],
  };
}

const toPersonaPick = (pick: ScoredCandidate) => ({
  contentId: pick.content.id,
  topicIds: [...pick.topicIds],
});

function pickedItems(world: EvalWorld, plan: UserDripPlan): PickedItem[] {
  return [...(plan.regular?.picks ?? []), ...(plan.discovery?.picks ?? [])].map(
    (pick) => ({
      contentId: pick.content.id,
      topicIds: pick.topicIds,
      embedding: pick.embedding,
      publishedAt: pick.content.publishedAt,
      exposureCount: world.exposureCount(pick.content.id),
    }),
  );
}

// ── 불변식 ───────────────────────────────────────────────────────────────────

const INVARIANTS = [
  'regular-within-interests',
  'no-seen-content',
  'no-duplicate-picks',
  'series-order',
  'within-plan-counts',
  'discovery-respects-removed-topics',
  'auto-expand-keeps-declared-interests',
] as const;

type InvariantName = (typeof INVARIANTS)[number];

const INVARIANT_LABEL: Record<InvariantName, string> = {
  'regular-within-interests':
    '정규 편성분은 (자동 슬롯 포함) 관심 주제 안의 콘텐츠다',
  'no-seen-content':
    '라이브러리에 있었거나 영구 제외된 콘텐츠를 다시 편성하지 않는다',
  'no-duplicate-picks': '같은 날 같은 콘텐츠가 두 번 편성되지 않는다',
  'series-order':
    '시리즈는 직전 편을 완청한 다음 편만 정규로 가고, 탐험은 1편(또는 단편)만 간다',
  'within-plan-counts': '편성 편수가 플랜 편수를 넘지 않는다',
  'discovery-respects-removed-topics':
    '사용자가 직접 해제한 주제의 콘텐츠는 탐험 편으로 가지 않는다',
  'auto-expand-keeps-declared-interests':
    '자동 확장은 직접 고른 관심 주제를 빼지 않고 자동 슬롯은 1개를 넘지 않는다',
};

/**
 * **불변식** — 점수식을 어떻게 바꾸든 일어나면 안 되는 일. 평가가 만든 편성 계산 전부에 대해 검사하고,
 * 하나라도 어기면 평가는 실패다(`docs/backend/recommendation-evaluation.md` 5.1).
 */
class InvariantCollector {
  private readonly violations = new Map<InvariantName, string[]>();

  check(
    world: EvalWorld,
    key: string,
    plan: UserDripPlan,
    where: string,
  ): void {
    const user = world.user(key);
    const regular = plan.regular?.picks ?? [];
    const discovery = plan.discovery?.picks ?? [];
    const active = new Set(plan.activeTopicIds);
    const seen = new Set([
      ...user.library.map((item) => item.contentId),
      ...user.excluded.map((row) => row.contentId),
    ]);
    const fail = (name: InvariantName, detail: string) => {
      const list = this.violations.get(name) ?? [];
      list.push(`${where} — ${detail}`);
      this.violations.set(name, list);
    };

    for (const pick of regular) {
      if (!pick.topicIds.some((topicId) => active.has(topicId))) {
        fail('regular-within-interests', pick.content.title);
      }
    }

    for (const pick of [...regular, ...discovery]) {
      if (seen.has(pick.content.id)) {
        fail('no-seen-content', pick.content.title);
      }
    }

    const ids = [...regular, ...discovery].map((pick) => pick.content.id);

    if (new Set(ids).size !== ids.length) {
      fail('no-duplicate-picks', ids.join(','));
    }

    for (const pick of regular) {
      const { seriesId, episodeNo } = pick.content;

      if (
        seriesId !== null &&
        episodeNo !== null &&
        episodeNo > 1 &&
        (plan.completedEpisodesBySeries.get(seriesId) ?? 0) < episodeNo - 1
      ) {
        fail('series-order', `${pick.content.title} (${episodeNo}편)`);
      }
    }

    for (const pick of discovery) {
      if (pick.content.episodeNo !== null && pick.content.episodeNo > 1) {
        fail('series-order', `탐험 ${pick.content.title}`);
      }
    }

    if (
      regular.length > (plan.dripCount ?? 0) ||
      discovery.length > (plan.discoveryCount ?? 0)
    ) {
      fail(
        'within-plan-counts',
        `정규 ${regular.length}/${plan.dripCount ?? 0} · 탐험 ${discovery.length}/${plan.discoveryCount ?? 0}`,
      );
    }

    const removed = new Set(
      user.interests
        .filter((interest) => interest.isUserRemoved)
        .map((interest) => interest.topicId),
    );

    for (const pick of discovery) {
      if (pick.topicIds.some((topicId) => removed.has(topicId))) {
        fail('discovery-respects-removed-topics', pick.content.title);
      }
    }

    const declared = user.interests.filter(
      (interest) =>
        interest.isActive &&
        interest.source !== (UserInterestSource.AUTO_EXPAND as string) &&
        world.topics.get(interest.topicId)?.isVisible === true,
    );
    const autoSlots = user.interests.filter(
      (interest) =>
        interest.isActive &&
        interest.source === (UserInterestSource.AUTO_EXPAND as string),
    );

    if (
      declared.some((interest) => !active.has(interest.topicId)) ||
      autoSlots.length > 1
    ) {
      fail(
        'auto-expand-keeps-declared-interests',
        `직접 고른 ${declared.length}개 · 자동 슬롯 ${autoSlots.length}개`,
      );
    }
  }

  results(): InvariantResult[] {
    return INVARIANTS.map((name) => {
      const list = this.violations.get(name) ?? [];

      return {
        name: INVARIANT_LABEL[name],
        passed: list.length === 0,
        detail: list.length === 0 ? '' : `${list.length}건 — 예: ${list[0]}`,
      };
    });
  }
}
