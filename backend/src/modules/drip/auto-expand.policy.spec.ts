import { decideAutoExpand } from './auto-expand.policy';
import { PreferenceSignalAction } from './drip.enum';
import { PreferenceSignalInput } from './drip.types';

const NOW = new Date('2026-09-30T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const IT = 'topic-it';
const BRAIN = 'topic-brain';
const RELATION = 'topic-relation';

const topics = new Map([
  ['b1', [BRAIN]],
  ['b2', [BRAIN]],
  ['b3', [BRAIN]],
  ['r1', [RELATION]],
  ['r2', [RELATION]],
  ['i1', [IT]],
]);

const sig = (
  contentId: string,
  action: PreferenceSignalAction,
  days: number,
): PreferenceSignalInput => ({ contentId, action, createdAt: daysAgo(days) });
const complete = (contentId: string, days: number) =>
  sig(contentId, PreferenceSignalAction.COMPLETE, days);

const declared = (topicId: string) => ({
  topicId,
  isAutoExpand: false,
  activatedAt: daysAgo(100),
});
const auto = (topicId: string, days: number) => ({
  topicId,
  isAutoExpand: true,
  activatedAt: daysAgo(days),
});

const base = {
  now: NOW,
  topicIdsByContentId: topics,
  userRemovedTopicIds: [] as string[],
};

describe('decideAutoExpand', () => {
  it('관심 밖 주제를 최근 30일에 2편 완청하면 빈 자동 슬롯에 그 주제를 넣는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 3)],
      topicWeights: { [BRAIN]: 1.8 },
      activeInterests: [declared(IT)],
    });

    expect(decision).toMatchObject({
      action: 'add',
      reason: 'slot_free',
      addTopicId: BRAIN,
      removeTopicId: null,
    });
    expect(decision.candidates).toEqual([
      { topicId: BRAIN, completes: 2, weight: 1.8 },
    ]);
  });

  it('1편 완청은 트리거가 아니다 — 같은 콘텐츠의 완청 신호가 두 번이어도 1편으로 센다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b1', 2)],
      topicWeights: { [BRAIN]: 1.9 },
      activeInterests: [declared(IT)],
    });

    expect(decision).toMatchObject({ action: 'none', reason: 'no_candidate' });
  });

  it('관찰 창(30일) 밖의 완청은 세지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 40)],
      topicWeights: { [BRAIN]: 1.1 },
      activeInterests: [declared(IT)],
    });

    expect(decision.action).toBe('none');
  });

  it('이미 관심 주제인 주제와 사용자가 직접 해제한 주제는 후보가 아니다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [
        complete('i1', 1),
        complete('b1', 1),
        complete('b2', 2),
        complete('r1', 1),
        complete('r2', 2),
      ],
      topicWeights: { [IT]: 1, [BRAIN]: 2, [RELATION]: 1.5 },
      activeInterests: [declared(IT)],
      userRemovedTopicIds: [BRAIN],
    });

    expect(decision).toMatchObject({ action: 'add', addTopicId: RELATION });
    expect(decision.candidates.map((c) => c.topicId)).toEqual([RELATION]);
  });

  it('완청 뒤 삭제·해제로 가중치가 0 이하가 된 주제는 넣지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 2)],
      topicWeights: { [BRAIN]: -0.2 },
      activeInterests: [declared(IT)],
    });

    expect(decision.action).toBe('none');
  });

  it('고를 수 없는 주제(숨김)는 호출자가 넘긴 목록으로 걸러진다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 2)],
      topicWeights: { [BRAIN]: 2 },
      activeInterests: [declared(IT)],
      unavailableTopicIds: [BRAIN],
    });

    expect(decision.action).toBe('none');
  });

  it('슬롯이 찼을 때 후보가 교체 여유(1.2배)를 넘으면 슬롯을 바꾼다 — 직접 고른 주제는 그대로다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('r1', 1), complete('r2', 2), complete('b1', 20)],
      topicWeights: { [BRAIN]: 0.5, [RELATION]: 1.8 },
      activeInterests: [declared(IT), auto(BRAIN, 10)],
    });

    expect(decision).toMatchObject({
      action: 'replace',
      reason: 'stronger_candidate',
      addTopicId: RELATION,
      removeTopicId: BRAIN,
    });
  });

  it('후보가 슬롯보다 조금만 센 정도면 유지한다 — 배치마다 뒤집히지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('r1', 1), complete('r2', 2), complete('b1', 3)],
      topicWeights: { [BRAIN]: 1.6, [RELATION]: 1.8 },
      activeInterests: [declared(IT), auto(BRAIN, 10)],
    });

    expect(decision).toMatchObject({ action: 'none', reason: 'slot_kept' });
  });

  it('자동 슬롯 주제에 30일간 긍정 신호가 없으면 슬롯을 비운다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 45)],
      topicWeights: { [BRAIN]: 0.1 },
      activeInterests: [declared(IT), auto(BRAIN, 40)],
    });

    expect(decision).toMatchObject({
      action: 'expire',
      reason: 'slot_expired',
      removeTopicId: BRAIN,
      addTopicId: null,
    });
  });

  it('방금 추가된 슬롯은 신호가 오래됐어도 만료하지 않는다 — 추가 직후 바로 빠지지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 45)],
      topicWeights: { [BRAIN]: 0.1 },
      activeInterests: [declared(IT), auto(BRAIN, 3)],
    });

    expect(decision.action).toBe('none');
  });

  it('슬롯 주제를 계속 듣고 있으면(담기 포함) 만료하지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [sig('b3', PreferenceSignalAction.SAVE, 5)],
      topicWeights: { [BRAIN]: 0.4 },
      activeInterests: [declared(IT), auto(BRAIN, 60)],
    });

    expect(decision.action).toBe('none');
  });

  it('만료와 동시에 새 후보가 있으면 같은 판정에서 슬롯을 채운다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('r1', 1), complete('r2', 2)],
      topicWeights: { [RELATION]: 1.8 },
      activeInterests: [declared(IT), auto(BRAIN, 40)],
    });

    expect(decision).toMatchObject({
      action: 'replace',
      reason: 'slot_expired',
      addTopicId: RELATION,
      removeTopicId: BRAIN,
    });
  });

  it('숨김 주제가 차지한 슬롯은 비우고, 후보가 있으면 같은 판정에서 채운다', () => {
    // 숨김 슬롯은 노출 중 관심사(`activeInterests`)에 없다 — 호출자가 따로 넘긴다
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('r1', 1), complete('r2', 2)],
      topicWeights: { [RELATION]: 1.8 },
      activeInterests: [declared(IT)],
      hiddenSlotTopicIds: [BRAIN],
    });

    expect(decision).toMatchObject({
      action: 'replace',
      reason: 'slot_hidden',
      addTopicId: RELATION,
      removeTopicId: BRAIN,
    });
  });

  it('숨김 슬롯을 대신할 후보가 없으면 슬롯만 비운다 — 자동 주제 없이 간다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('r1', 1)],
      topicWeights: { [RELATION]: 0.9 },
      activeInterests: [declared(IT)],
      hiddenSlotTopicIds: [BRAIN],
    });

    expect(decision).toMatchObject({
      action: 'expire',
      reason: 'slot_hidden',
      addTopicId: null,
      removeTopicId: BRAIN,
    });
  });

  it('숨김 슬롯 주제를 요즘 듣고 있어도 그 자리에 다시 넣지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 2)],
      topicWeights: { [BRAIN]: 1.8 },
      activeInterests: [declared(IT)],
      hiddenSlotTopicIds: [BRAIN],
    });

    expect(decision).toMatchObject({
      action: 'expire',
      reason: 'slot_hidden',
      addTopicId: null,
      removeTopicId: BRAIN,
    });
    expect(decision.candidates).toEqual([]);
  });

  it('숨김 슬롯이 없으면 종전 판정 그대로다 — 빈 목록은 아무것도 바꾸지 않는다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [complete('b1', 1), complete('b2', 3)],
      topicWeights: { [BRAIN]: 1.8 },
      activeInterests: [declared(IT)],
      hiddenSlotTopicIds: [],
    });

    expect(decision).toMatchObject({ action: 'add', reason: 'slot_free' });
  });

  it('후보가 여럿이면 주제 가중치가 가장 큰 것을 고른다', () => {
    const decision = decideAutoExpand({
      ...base,
      signals: [
        complete('b1', 1),
        complete('b2', 2),
        complete('r1', 1),
        complete('r2', 2),
      ],
      topicWeights: { [BRAIN]: 1.2, [RELATION]: 1.9 },
      activeInterests: [declared(IT)],
    });

    expect(decision.addTopicId).toBe(RELATION);
    expect(decision.candidates.map((c) => c.topicId)).toEqual([
      RELATION,
      BRAIN,
    ]);
  });
});
