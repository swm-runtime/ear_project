import { normalizeIssue } from './sentry-issue.client';

describe('normalizeIssue — Issue API 응답에서 쓰는 것만', () => {
  it('substatus 를 state 로, 없으면 status. 건수는 문자열이어도 숫자로. 사용자 식별값은 꺼내지 않는다', () => {
    const summary = normalizeIssue({
      shortId: 'EAR-APP-3',
      status: 'unresolved',
      substatus: 'regressed',
      firstSeen: '2026-10-07T08:00:00Z',
      lastSeen: '2026-10-07T09:00:00Z',
      count: '12',
      userCount: 4,
      assignedTo: { email: 'no@example.com' },
    });

    expect(summary).toEqual({
      shortId: 'EAR-APP-3',
      state: 'regressed',
      firstSeen: new Date('2026-10-07T08:00:00Z'),
      lastSeen: new Date('2026-10-07T09:00:00Z'),
      count: 12,
      userCount: 4,
    });
    expect(JSON.stringify(summary)).not.toContain('example.com');
  });

  it('모양이 어긋난 값은 그 값만 null, 객체가 아니면 전체가 null', () => {
    expect(
      normalizeIssue({
        status: 'unresolved',
        firstSeen: 'not a date',
        count: -1,
      }),
    ).toEqual({
      shortId: null,
      state: 'unresolved',
      firstSeen: null,
      lastSeen: null,
      count: null,
      userCount: null,
    });
    expect(normalizeIssue('x')).toBeNull();
    expect(normalizeIssue(null)).toBeNull();
  });
});
