import { UserInterestSource } from '@/modules/interest/interest.enum';
import { LibraryItemSource } from '@/modules/library/library.enum';

import { EvalWorld, WorldContent } from './eval-world';
import { InvariantResult } from './recommend-eval.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 하루치 편성 결과 — 페르소나 검사가 읽는 최소한 */
export interface PersonaDay {
  day: number;
  activeTopicIds: string[];
  autoExpandAction: string;
  autoExpandAddTopicId: string | null;
  regularTarget: number;
  regular: { contentId: string; topicIds: string[] }[];
  discovery: { contentId: string; topicIds: string[] }[];
}

export type PersonaReaction = 'complete' | 'ignore' | 'delete';

export interface PersonaSetup {
  key: string;
  /** 이 페르소나가 "좋아한다"고 정한 주제 — 합성 사용자의 적중률 분모 */
  likedTopicIds: string[];
  react: (content: WorldContent) => PersonaReaction;
  check: (
    days: PersonaDay[],
    options: PersonaCheckOptions,
  ) => InvariantResult[];
}

export interface PersonaCheckOptions {
  autoExpandFeature: boolean;
}

export interface PersonaContext {
  world: EvalWorld;
  /** 시뮬레이션 첫날 — 과거 이력은 이보다 앞에 놓는다 */
  start: Date;
  /** 발행 콘텐츠가 많은 순의 주제 id */
  topics: string[];
  /** 주제의 발행 콘텐츠 — 재생 수 많은 순(결정적) */
  contentsOf: (topicId: string) => WorldContent[];
}

export interface Persona {
  name: string;
  description: string;
  /** 카탈로그에 재료가 없으면 사유 문자열을 돌려준다(건너뜀) */
  setup: (context: PersonaContext) => PersonaSetup | string;
}

const ok = (
  name: string,
  passed: boolean,
  detail: string,
  severity: 'hard' | 'soft' = 'hard',
): InvariantResult => ({
  name,
  passed,
  detail: passed ? '' : detail,
  severity,
});

const hasTopic = (content: WorldContent, topicIds: string[]) =>
  content.topicIds.some((topicId) => topicIds.includes(topicId));

function addUser(
  context: PersonaContext,
  key: string,
  interestTopicIds: string[],
  overrides: { jobCategory?: string; yearsOfExperience?: number } = {},
): void {
  context.world.users.set(key, {
    key,
    tier: 'light',
    jobCategory: overrides.jobCategory ?? null,
    yearsOfExperience: overrides.yearsOfExperience ?? null,
    autoExpandEnabled: true,
    interests: interestTopicIds.map((topicId) => ({
      topicId,
      source: UserInterestSource.ONBOARDING,
      isActive: true,
      isUserRemoved: false,
      updatedAt: new Date(context.start.getTime() - 60 * MS_PER_DAY),
    })),
    signals: [],
    library: [],
    excluded: [],
  });
}

const daysBefore = (context: PersonaContext, days: number) =>
  new Date(context.start.getTime() - days * MS_PER_DAY);

/**
 * **샘플 사용자 셋** — 추천이 달라져야 하는 전형적인 행동을 한 가지씩 담은 합성 사용자다
 * (`docs/backend/recommendation-evaluation.md` 3.2).
 *
 * 주제·콘텐츠를 이름으로 박지 않고 **카탈로그의 구조에서 고른다**(콘텐츠가 많은 주제 순) — 어떤 스냅샷 위에서도,
 * 합성 카탈로그 위에서도 같은 정의가 돈다. 재료가 부족하면(주제 수·시리즈 없음) 그 페르소나만 건너뛴다.
 */
export const PERSONAS: Persona[] = [
  {
    name: 'cold-start',
    description: '관심 주제 3개만 고른 신규 가입자. 받은 편은 다 듣는다',
    setup: (context) => {
      if (context.topics.length < 3) {
        return '주제가 3개 미만';
      }

      const interests = context.topics.slice(0, 3);
      addUser(context, 'p-cold-start', interests);

      return {
        key: 'p-cold-start',
        likedTopicIds: interests,
        react: () => 'complete',
        check: (days) => [
          ok(
            '신규 가입자도 첫날 정규 편성이 목표 편수를 채운다',
            days[0].regular.length >= days[0].regularTarget,
            `첫날 정규 ${days[0].regular.length}/${days[0].regularTarget}`,
          ),
        ],
      };
    },
  },
  {
    name: 'focused',
    description:
      '관심 주제 3개 중 하나만 꾸준히 완청한다. 그 주제만 듣고 나머지는 열지 않는다',
    setup: (context) => {
      if (context.topics.length < 3) {
        return '주제가 3개 미만';
      }

      const interests = context.topics.slice(0, 3);
      const liked = interests[0];
      const history = context.contentsOf(liked).slice(0, 5);

      if (history.length < 5) {
        return '좋아하는 주제의 콘텐츠가 5편 미만';
      }

      addUser(context, 'p-focused', interests);
      history.forEach((entry, index) =>
        context.world.complete(
          'p-focused',
          entry.content.id,
          daysBefore(context, 10 - index * 2),
        ),
      );

      return {
        key: 'p-focused',
        likedTopicIds: [liked],
        react: (content) =>
          hasTopic(content, [liked]) ? 'complete' : 'ignore',
        check: (days) => {
          const first = days[0].regular[0];

          return [
            ok(
              '한 주제만 완청해 온 사용자의 첫날 정규 1순위는 그 주제다',
              first !== undefined && first.topicIds.includes(liked),
              `첫날 1순위 주제 ${first?.topicIds.join(',') ?? '없음'}`,
            ),
          ];
        },
      };
    },
  },
  {
    name: 'negative',
    description: '관심 주제 둘 중 하나는 완청하고 다른 하나는 받는 족족 지운다',
    setup: (context) => {
      if (context.topics.length < 2) {
        return '주제가 2개 미만';
      }

      const [liked, disliked] = context.topics;
      // 두 주제에 함께 걸친 콘텐츠는 신호가 섞이므로 이력에서 뺀다
      const likedOnly = context
        .contentsOf(liked)
        .filter((entry) => !entry.topicIds.includes(disliked))
        .slice(0, 3);
      const dislikedOnly = context
        .contentsOf(disliked)
        .filter((entry) => !entry.topicIds.includes(liked))
        .slice(0, 3);

      if (likedOnly.length < 3 || dislikedOnly.length < 3) {
        return '주제별 단독 콘텐츠가 3편 미만';
      }

      addUser(context, 'p-negative', [liked, disliked]);
      likedOnly.forEach((entry, index) =>
        context.world.complete(
          'p-negative',
          entry.content.id,
          daysBefore(context, 9 - index * 3),
        ),
      );
      dislikedOnly.forEach((entry, index) => {
        const placedAt = daysBefore(context, 9 - index * 3);
        context.world.place(
          'p-negative',
          [entry.content.id],
          LibraryItemSource.DRIP,
          placedAt,
        );
        context.world.remove(
          'p-negative',
          entry.content.id,
          new Date(placedAt.getTime() + MS_PER_DAY / 2),
        );
      });

      return {
        key: 'p-negative',
        likedTopicIds: [liked],
        react: (content) =>
          hasTopic(content, [liked]) ? 'complete' : 'delete',
        check: (days) => {
          const picks = days.slice(0, 3).flatMap((day) => day.regular);
          const likedCount = picks.filter((pick) =>
            pick.topicIds.includes(liked),
          ).length;
          const dislikedCount = picks.filter(
            (pick) =>
              pick.topicIds.includes(disliked) &&
              !pick.topicIds.includes(liked),
          ).length;

          return [
            ok(
              '지우기만 한 주제가 완청한 주제보다 많이 편성되지 않는다(첫 3일)',
              likedCount >= dislikedCount,
              `좋아하는 주제 ${likedCount}편 < 지운 주제 ${dislikedCount}편`,
            ),
          ];
        },
      };
    },
  },
  {
    name: 'outside-listener',
    description:
      '관심 주제 3개를 채웠지만 관심 밖 주제를 스스로 찾아 3편 완청했다 (자동 확장의 대상)',
    setup: (context) => {
      if (context.topics.length < 4) {
        return '주제가 4개 미만';
      }

      const interests = context.topics.slice(0, 3);
      const outside = context.topics[3];
      const history = context
        .contentsOf(outside)
        .filter((entry) => !hasTopic(entry, interests))
        .slice(0, 3);

      if (history.length < 3 || context.contentsOf(outside).length < 6) {
        return '관심 밖 주제의 콘텐츠가 부족';
      }

      addUser(context, 'p-outside', interests);
      history.forEach((entry, index) =>
        context.world.complete(
          'p-outside',
          entry.content.id,
          daysBefore(context, 6 - index * 2),
        ),
      );

      return {
        key: 'p-outside',
        likedTopicIds: [outside],
        react: (content) =>
          hasTopic(content, [outside]) ? 'complete' : 'ignore',
        check: (days, options) => {
          if (!options.autoExpandFeature) {
            return [
              ok(
                '자동 확장 스위치가 꺼져 있으면 관심 주제가 바뀌지 않는다',
                days.every((day) => !day.activeTopicIds.includes(outside)),
                '스위치가 꺼졌는데 관심 밖 주제가 붙었다',
              ),
            ];
          }

          const pickedOutside = days
            .slice(0, 3)
            .some((day) =>
              day.regular.some((pick) => pick.topicIds.includes(outside)),
            );

          return [
            ok(
              '관심 밖 주제를 반복 완청한 사용자는 첫 배치에서 그 주제가 자동 슬롯으로 붙는다',
              days[0].autoExpandAddTopicId === outside &&
                days[0].activeTopicIds.includes(outside),
              `첫날 판정 ${days[0].autoExpandAction}, 추가 ${days[0].autoExpandAddTopicId ?? '없음'}`,
            ),
            ok(
              '자동 슬롯 주제의 콘텐츠가 3일 안에 정규 편성에 들어온다',
              pickedOutside,
              '3일간 정규 편성에 그 주제가 한 편도 없다',
            ),
            ok(
              '자동 확장은 직접 고른 관심 주제를 빼지 않는다',
              days.every((day) =>
                interests.every((topicId) =>
                  day.activeTopicIds.includes(topicId),
                ),
              ),
              '직접 고른 주제가 관심 주제에서 사라졌다',
            ),
          ];
        },
      };
    },
  },
  {
    name: 'series-follower',
    description: '시리즈 1편을 완청했다. 다음 편을 기다린다',
    setup: (context) => {
      const episodes = [...context.world.contents.values()]
        .filter(
          (entry) =>
            entry.content.seriesId !== null && entry.content.episodeNo !== null,
        )
        .sort(
          (a, b) =>
            a.content.seriesId!.localeCompare(b.content.seriesId!) ||
            a.content.episodeNo! - b.content.episodeNo!,
        );
      const first = episodes.find((entry) => entry.content.episodeNo === 1);
      const second = episodes.find(
        (entry) =>
          entry.content.seriesId === first?.content.seriesId &&
          entry.content.episodeNo === 2,
      );

      if (!first || !second) {
        return '2편 이상인 시리즈가 없다';
      }

      const interests = [
        ...new Set([...second.topicIds, ...context.topics]),
      ].slice(0, 3);
      addUser(context, 'p-series', interests);
      context.world.complete(
        'p-series',
        first.content.id,
        daysBefore(context, 2),
      );

      return {
        key: 'p-series',
        likedTopicIds: second.topicIds,
        react: () => 'complete',
        check: (days) => [
          // 4.2-3 시리즈 연속 우선 선정(2026-09-30) — 평가기 첫 실행이 잡은 19위 문제를 고친 뒤 hard 로 올렸다
          ok(
            '시리즈 1편을 완청한 사용자는 첫날 정규 편성에 2편을 받는다',
            days[0].regular.some(
              (pick) => pick.contentId === second.content.id,
            ),
            '첫날 정규 편성에 다음 편이 없다',
          ),
        ],
      };
    },
  },
  {
    name: 'heavy',
    description:
      '관심 주제가 하나뿐이고 그 주제의 콘텐츠를 이미 70% 완청했다 (고갈 직전)',
    setup: (context) => {
      if (context.topics.length < 1) {
        return '주제가 없다';
      }

      // 가장 콘텐츠가 적은 주제로 고갈을 빨리 만든다
      const topic = context.topics[context.topics.length - 1];
      const pool = context.contentsOf(topic);

      if (pool.length < 5) {
        return '주제의 콘텐츠가 5편 미만';
      }

      addUser(context, 'p-heavy', [topic]);
      pool
        .slice(0, Math.floor(pool.length * 0.7))
        .forEach((entry, index) =>
          context.world.complete(
            'p-heavy',
            entry.content.id,
            daysBefore(context, 40 - index),
          ),
        );

      return {
        key: 'p-heavy',
        likedTopicIds: [topic],
        react: () => 'complete',
        // 고갈은 이 페르소나의 예상된 결과다 — 고갈되는 날을 리포트에 싣는 것이 목적이고,
        // 고갈 시 관심 밖 콘텐츠가 정규에 섞이지 않는지는 전역 불변식이 본다
        check: () => [],
      };
    },
  },
  {
    name: 'remover',
    description:
      '주제 하나를 직접 해제한 뒤에도 그 주제를 2편 완청했다 (해제한 주제는 다시 들어오면 안 된다)',
    setup: (context) => {
      if (context.topics.length < 3) {
        return '주제가 3개 미만';
      }

      const interests = context.topics.slice(0, 2);
      const removed = context.topics[2];
      const history = context
        .contentsOf(removed)
        .filter((entry) => !hasTopic(entry, interests))
        .slice(0, 2);

      if (history.length < 2) {
        return '해제한 주제의 단독 콘텐츠가 2편 미만';
      }

      addUser(context, 'p-remover', interests);
      context.world.user('p-remover').interests.push({
        topicId: removed,
        source: UserInterestSource.MANUAL,
        isActive: false,
        isUserRemoved: true,
        updatedAt: daysBefore(context, 20),
      });
      history.forEach((entry, index) =>
        context.world.complete(
          'p-remover',
          entry.content.id,
          daysBefore(context, 4 - index * 2),
        ),
      );

      return {
        key: 'p-remover',
        likedTopicIds: interests,
        react: () => 'complete',
        check: (days) => [
          ok(
            '사용자가 직접 해제한 주제는 다시 완청해도 자동으로 붙지 않는다',
            days.every((day) => !day.activeTopicIds.includes(removed)),
            '해제한 주제가 관심 주제에 다시 들어왔다',
          ),
          ok(
            '직접 해제한 주제의 콘텐츠는 탐험 편으로도 오지 않는다',
            days.every((day) =>
              day.discovery.every((pick) => !pick.topicIds.includes(removed)),
            ),
            '해제한 주제의 콘텐츠가 탐험 편으로 편성됐다',
          ),
        ],
      };
    },
  },
];
