import { AlertJudge } from './resource-alert.service';

/** 60초 틱 가정 — 지속 3틱 발보 · 30분 재알림 · 3틱 정상 복귀 해제 */
describe('AlertJudge', () => {
  const MIN = 60_000;
  let judge: AlertJudge;

  beforeEach(() => {
    judge = new AlertJudge({ cpu: 70, memory: 80 });
  });

  it('임계를 넘겨도 3틱 연속 전에는 발보하지 않는다 — 순간 스파이크 오탐 방지', () => {
    expect(judge.update({ cpu: 95, memory: 10 }, 0)).toEqual([]);
    expect(judge.update({ cpu: 95, memory: 10 }, MIN)).toEqual([]);
    expect(judge.update({ cpu: 95, memory: 10 }, 2 * MIN)).toEqual([
      { metric: 'cpu', kind: 'alert', value: 95 },
    ]);
  });

  it('중간에 정상 틱이 끼면 연속 카운트가 리셋된다', () => {
    judge.update({ cpu: 95, memory: 10 }, 0);
    judge.update({ cpu: 30, memory: 10 }, MIN);
    judge.update({ cpu: 95, memory: 10 }, 2 * MIN);
    expect(judge.update({ cpu: 95, memory: 10 }, 3 * MIN)).toEqual([]);
  });

  it('발보 후 지속되는 동안은 30분에 한 번만 재알림한다', () => {
    for (let i = 0; i < 3; i += 1)
      judge.update({ cpu: 95, memory: 10 }, i * MIN);
    // 3틱째에 발보됨 — 이후 29분까지는 조용하다
    expect(judge.update({ cpu: 95, memory: 10 }, 10 * MIN)).toEqual([]);
    expect(judge.update({ cpu: 95, memory: 10 }, 2 * MIN + 30 * MIN)).toEqual([
      { metric: 'cpu', kind: 'realert', value: 95 },
    ]);
  });

  it('3틱 연속 정상으로 돌아오면 해제 알림을 한 번 보낸다', () => {
    for (let i = 0; i < 3; i += 1)
      judge.update({ cpu: 95, memory: 10 }, i * MIN);
    judge.update({ cpu: 30, memory: 10 }, 3 * MIN);
    judge.update({ cpu: 30, memory: 10 }, 4 * MIN);
    expect(judge.update({ cpu: 30, memory: 10 }, 5 * MIN)).toEqual([
      { metric: 'cpu', kind: 'recovered', value: 30 },
    ]);
    // 해제 후에는 더 보내지 않는다
    expect(judge.update({ cpu: 30, memory: 10 }, 6 * MIN)).toEqual([]);
  });

  it('CPU와 메모리는 독립적으로 판정된다', () => {
    for (let i = 0; i < 2; i += 1)
      judge.update({ cpu: 95, memory: 90 }, i * MIN);
    const events = judge.update({ cpu: 95, memory: 90 }, 2 * MIN);
    expect(events).toEqual([
      { metric: 'cpu', kind: 'alert', value: 95 },
      { metric: 'memory', kind: 'alert', value: 90 },
    ]);
  });

  it('값을 못 읽은 틱(null)은 연속 카운트를 건드리지 않는다', () => {
    judge.update({ cpu: 95, memory: 10 }, 0);
    judge.update({ cpu: null, memory: 10 }, MIN);
    judge.update({ cpu: 95, memory: 10 }, 2 * MIN);
    expect(judge.update({ cpu: 95, memory: 10 }, 3 * MIN)).toEqual([
      { metric: 'cpu', kind: 'alert', value: 95 },
    ]);
  });
});
