import { LibraryItemSource } from '@/modules/library/library.enum';

import { EvalWorld } from './eval-world';
import { buildSyntheticSnapshot } from './synthetic-catalog';
import { EvalSnapshot } from './recommend-eval.types';

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
