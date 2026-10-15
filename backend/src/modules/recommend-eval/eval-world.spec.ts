import { LibraryItemSource } from '@/modules/library/library.enum';

import { EvalWorld } from './eval-world';
import { buildSyntheticSnapshot } from './synthetic-catalog';
import { EvalSnapshot } from './recommend-eval.types';
import { UserMarket } from '@/modules/user/user.enum';

const NOW = new Date('2026-09-30T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function snapshotWithUser(): EvalSnapshot {
  const snapshot = buildSyntheticSnapshot(NOW);
  const [c1, c2, c3] = snapshot.contents;

  snapshot.users.push({
    key: 'u1',
    tier: 'light',
    job_category: null,
    years_of_experience: null,
    auto_expand_enabled: true,
    interests: [
      {
        topic_id: c1.topic_ids[0],
        source: 'onboarding',
        is_active: true,
        is_user_removed: false,
        updated_at: NOW.toISOString(),
      },
    ],
    signals: [
      {
        content_id: c1.id,
        action: 'complete',
        created_at: new Date(NOW.getTime() - 5 * DAY).toISOString(),
      },
      {
        content_id: c2.id,
        action: 'complete',
        created_at: new Date(NOW.getTime() - 1 * DAY).toISOString(),
      },
    ],
    library: [
      {
        content_id: c1.id,
        source: 'save',
        status: 'completed',
        added_at: new Date(NOW.getTime() - 6 * DAY).toISOString(),
        completed_at: new Date(NOW.getTime() - 5 * DAY).toISOString(),
        deleted_at: null,
      },
      {
        content_id: c2.id,
        source: 'drip',
        status: 'completed',
        added_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
        completed_at: new Date(NOW.getTime() - 1 * DAY).toISOString(),
        deleted_at: null,
      },
      {
        content_id: c3.id,
        source: 'drip',
        status: 'unplayed',
        added_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
        completed_at: null,
        deleted_at: null,
      },
    ],
    excluded: [
      {
        content_id: c2.id,
        created_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      },
      {
        content_id: c3.id,
        created_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      },
    ],
  });

  return snapshot;
}

describe('EvalWorld', () => {
  it('후보 필터는 제품 SQL과 같다 — 라이브러리(삭제분 포함)·영구 제외·관심 밖·시리즈 중간 편을 뺀다', async () => {
    const snapshot = snapshotWithUser();
    const world = EvalWorld.fromSnapshot(snapshot);
    const [c1, c2, c3] = snapshot.contents;
    const topic = c1.topic_ids[0];
    world.remove('u1', c3.id, NOW);

    const pool = await world['contentService']().findCandidates({
      market: UserMarket.KR,
      includeTopicIds: [topic],
      excludeSeenByUserId: 'u1',
      seriesStartOnly: true,
      limit: 100,
      now: NOW,
    });
    const ids = pool.map((content) => content.id);

    expect(ids).not.toContain(c1.id);
    expect(ids).not.toContain(c2.id);
    expect(ids).not.toContain(c3.id);
    expect(
      pool.every(
        (content) => content.episodeNo === null || content.episodeNo === 1,
      ),
    ).toBe(true);
    expect(
      pool.every((content) =>
        world.contents.get(content.id)?.topicIds.includes(topic),
      ),
    ).toBe(true);
  });

  it('시간 되감기 — cutoff 이후의 신호·라이브러리·제외·발행 콘텐츠가 사라지고 완청 전 상태로 돌아간다', () => {
    const snapshot = snapshotWithUser();
    const world = EvalWorld.fromSnapshot(snapshot);
    const [c1, c2] = snapshot.contents;
    const past = world.at(new Date(NOW.getTime() - 3 * DAY));
    const user = past.user('u1');

    expect(user.signals.map((signal) => signal.contentId)).toEqual([c1.id]);
    expect(user.library.map((item) => item.contentId)).toEqual([c1.id]);
    expect(user.excluded).toEqual([]);
    expect(past.contents.size).toBeLessThan(world.contents.size);
    expect(
      past.contents.has(c2.id) ||
        snapshot.contents.find((c) => c.id === c2.id)!.published_at >
          new Date(NOW.getTime() - 3 * DAY).toISOString(),
    ).toBe(true);
  });

  it('노출 수는 전 사용자의 드립·탐험 라이브러리 행(삭제분 포함)을 센다', () => {
    const snapshot = snapshotWithUser();
    const world = EvalWorld.fromSnapshot(snapshot);
    const [, c2, c3] = snapshot.contents;
    world.remove('u1', c3.id, NOW);
    world.place('u1', ['does-not-matter'], LibraryItemSource.DISCOVERY, NOW);

    expect(world.exposureCount(c2.id)).toBe(1);
    expect(world.exposureCount(c3.id)).toBe(1);
    expect(world.exposureCount('does-not-matter')).toBe(1);
  });

  it('완청은 라이브러리에 없으면 자동 적립하고 play·complete 신호를 남기며 집계를 올린다', () => {
    const snapshot = buildSyntheticSnapshot(NOW);
    const world = EvalWorld.fromSnapshot(snapshot);
    const target = snapshot.contents[10];
    world.users.set('u', {
      key: 'u',
      tier: 'light',
      market: UserMarket.KR,
      jobCategory: null,
      yearsOfExperience: null,
      autoExpandEnabled: true,
      interests: [],
      signals: [],
      library: [],
      excluded: [],
    });
    const before = world.contents.get(target.id)!.completeCount;

    world.complete('u', target.id, NOW);
    world.complete('u', target.id, NOW);

    const user = world.user('u');
    expect(user.library).toHaveLength(1);
    expect(user.library[0].status).toBe('completed');
    expect(user.signals.map((signal) => signal.action)).toEqual([
      'play',
      'complete',
      'play',
    ]);
    expect(world.contents.get(target.id)!.completeCount).toBe(before + 1);
  });
});

describe('EvalWorld — 시장 격리(global-api 4.5·4.7)', () => {
  /** 합성 카탈로그의 주제 순서 — 0~5 는 KR, 6~8 은 GLOBAL */
  const KR_TOPIC_INDEX = 0;
  const GLOBAL_TOPIC_INDEX = 6;

  const marketsOfPicks = async (
    market: 'kr' | 'global',
    topicIndex: number,
  ) => {
    const snapshot = buildSyntheticSnapshot(NOW);
    snapshot.users.push({
      key: 'u',
      tier: 'light',
      market,
      job_category: null,
      years_of_experience: null,
      auto_expand_enabled: true,
      interests: [
        {
          topic_id: snapshot.topics[topicIndex].id,
          source: 'onboarding',
          is_active: true,
          is_user_removed: false,
          updated_at: NOW.toISOString(),
        },
      ],
      signals: [],
      library: [],
      excluded: [],
    });
    const plan = await EvalWorld.fromSnapshot(snapshot).plan('u', NOW, {
      commit: false,
      autoExpandFeature: true,
    });

    return [
      ...(plan.regular?.picks ?? []),
      ...(plan.discovery?.picks ?? []),
    ].map((pick) => pick.content.market);
  };

  it('KR 사용자의 정규·탐험 편성에는 GLOBAL 콘텐츠가 없다', async () => {
    // given / when — KR 주제 하나를 고른 KR 사용자의 하루 편성
    const markets = await marketsOfPicks(UserMarket.KR, KR_TOPIC_INDEX);

    // then
    expect(markets.length).toBeGreaterThan(0);
    expect(new Set(markets)).toEqual(new Set([UserMarket.KR]));
  });

  it('GLOBAL 사용자의 정규·탐험 편성에는 KR 콘텐츠가 없다', async () => {
    // given / when — GLOBAL 주제 하나를 고른 GLOBAL 사용자의 하루 편성
    const markets = await marketsOfPicks(UserMarket.GLOBAL, GLOBAL_TOPIC_INDEX);

    // then
    expect(markets.length).toBeGreaterThan(0);
    expect(new Set(markets)).toEqual(new Set([UserMarket.GLOBAL]));
  });
});

describe('자동 확장 토글 — 끄고 다시 켜도 자동 슬롯 주제가 그대로 남는다', () => {
  const PSYCHOLOGY = 3;

  it('자동 슬롯이 "심리학"인 사용자가 토글을 껐다 켜면 심리학이 auto_expand 그대로 선택돼 있다', async () => {
    // given — 관심 주제 0번만 고른 사용자가 관심 밖 "심리학"(3번)을 2편 완청했다
    const snapshot = buildSyntheticSnapshot(NOW);
    const psychologyId = snapshot.topics[PSYCHOLOGY].id;
    snapshot.topics[PSYCHOLOGY].name = '심리학';
    snapshot.users.push({
      key: 'u1',
      tier: 'light',
      job_category: null,
      years_of_experience: null,
      auto_expand_enabled: true,
      interests: [
        {
          topic_id: snapshot.topics[0].id,
          source: 'onboarding',
          is_active: true,
          is_user_removed: false,
          updated_at: NOW.toISOString(),
        },
      ],
      signals: [],
      library: [],
      excluded: [],
    });
    const world = EvalWorld.fromSnapshot(snapshot);
    const psychologyContents = snapshot.contents
      .filter((content) => content.topic_ids.length === 1)
      .filter((content) => content.topic_ids[0] === psychologyId)
      .slice(0, 2);
    for (const content of psychologyContents) {
      world.complete('u1', content.id, new Date(NOW.getTime() - DAY));
    }
    const options = { commit: true, autoExpandFeature: true };
    const psychologySlot = () =>
      world
        .user('u1')
        .interests.find((interest) => interest.topicId === psychologyId);

    // 1일차 — 켜진 상태에서 심리학이 자동 슬롯으로 붙는다
    const day1 = await world.plan('u1', NOW, options);
    expect(day1.autoExpand?.action).toBe('add');
    expect(psychologySlot()).toMatchObject({
      source: 'auto_expand',
      isActive: true,
    });

    // 2~4일차 — 끈 동안 배치가 돌아도 넣지도 빼지도 않는다
    world.user('u1').autoExpandEnabled = false;
    for (let day = 1; day <= 3; day += 1) {
      const plan = await world.plan(
        'u1',
        new Date(NOW.getTime() + day * DAY),
        options,
      );
      expect(plan.activeTopicIds).toContain(psychologyId);
    }
    expect(psychologySlot()).toMatchObject({
      source: 'auto_expand',
      isActive: true,
      isUserRemoved: false,
    });

    // 5일차 — 다시 켜면 심리학이 그대로 자동 슬롯이고, 정규 편성 주제에 들어간다
    world.user('u1').autoExpandEnabled = true;
    const day5 = await world.plan(
      'u1',
      new Date(NOW.getTime() + 4 * DAY),
      options,
    );
    expect(day5.autoExpand?.action).toBe('none');
    expect(day5.activeTopicIds).toEqual(
      expect.arrayContaining([snapshot.topics[0].id, psychologyId]),
    );
    expect(psychologySlot()).toMatchObject({
      source: 'auto_expand',
      isActive: true,
      isUserRemoved: false,
    });
  });
});
