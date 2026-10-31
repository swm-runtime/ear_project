import { dripArrivalBucketOf } from '@/modules/drip/drip-group.policy';
import { MessageLanguage } from '@/modules/user/user.enum';

import {
  isMorningPushHoldout,
  isWithinAdHours,
  morningListenedSince,
  morningLogType,
  MORNING_PUSH_COPY,
  MorningUserFacts,
  planMorningPush,
} from './morning-push.policy';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WEEK = '2026-10-26';
/** 2026-10-30 08:00 KST */
const AT_0800_KST = new Date('2026-10-29T23:00:00.000Z');

function facts(overrides: Partial<MorningUserFacts> = {}): MorningUserFacts {
  return {
    userId: USER_ID,
    language: MessageLanguage.KO,
    unplayedCount: 3,
    single: null,
    listenedRecently: false,
    placedToday: false,
    arrivalSentToday: false,
    morningSentRecently: false,
    withinAdHours: true,
    ...overrides,
  };
}

describe('planMorningPush — 아침 알림 판정(KAN-288)', () => {
  it('안 들은 편이 1편이면 그 콘텐츠로 가고 본문이 제목이다 — (광고) 머리말과 수신거부 안내가 붙는다', () => {
    const plan = planMorningPush(
      facts({
        unplayedCount: 1,
        single: { contentId: 'c1', title: '연봉 협상의 기술' },
      }),
      WEEK,
    );

    expect(plan).toMatchObject({
      userId: USER_ID,
      deepLink: 'ear://contents/c1',
    });
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.title.startsWith('(광고) ')).toBe(true);
    expect(plan.body).toBe('연봉 협상의 기술\n수신거부: 설정 > 알림');
  });

  it('여러 편이면 라이브러리로 가고 편수를 말한다', () => {
    const plan = planMorningPush(facts({ unplayedCount: 3 }), WEEK);

    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.deepLink).toBe('ear://library');
    expect(plan.title).toMatch(/^\(광고\) .*3편/);
    expect(plan.body.endsWith('\n수신거부: 설정 > 알림')).toBe(true);
  });

  it('영어 사용자는 (Ad) 머리말과 영어 수신거부 안내다', () => {
    const plan = planMorningPush(
      facts({ language: MessageLanguage.EN, unplayedCount: 2 }),
      WEEK,
    );

    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.title).toBe('(Ad) 2 episodes are waiting for you');
    expect(plan.body).toBe(
      'Start your morning with one\nOpt out: Settings > Notifications',
    );
  });

  it.each([
    ['placed_today', { placedToday: true }],
    ['arrival_sent', { arrivalSentToday: true }],
    ['already_sent', { morningSentRecently: true }],
    ['listened', { listenedRecently: true }],
    ['no_unplayed', { unplayedCount: 0 }],
    ['ad_hours', { withinAdHours: false }],
  ] as const)(
    '%s — 보내지 않는다(드립이 있는 날·이미 받음·들음·없음·야간)',
    (reason, overrides) => {
      expect(planMorningPush(facts(overrides), WEEK)).toBe(reason);
    },
  );

  it('변형은 사용자·주마다 고정이고 모든 변형의 변수가 채워진다', () => {
    const first = planMorningPush(facts(), WEEK);

    expect(planMorningPush(facts(), WEEK)).toEqual(first);
    for (const language of Object.values(MessageLanguage)) {
      for (const copy of [
        ...MORNING_PUSH_COPY[language].single,
        ...MORNING_PUSH_COPY[language].multiple,
      ]) {
        const filled = `${copy.title} ${copy.body}`
          .replace('{count}', '2')
          .replace('{title}', 't');
        expect(filled).not.toContain('{');
      }
    }
  });

  it('기록 종류는 retention.morning.<변형> 이다 — 40자 컬럼 안이다', () => {
    expect(morningLogType(0)).toBe('retention.morning.a');
    expect(morningLogType(1)).toBe('retention.morning.b');
  });
});

describe('isWithinAdHours — 광고성 알림 야간 금지(21~08시, 사용자 현지)', () => {
  it('한국 08:00 은 허용이다(시간대 없음 → 그룹 기준 시간대)', () => {
    expect(isWithinAdHours(null, 'Asia/Seoul', AT_0800_KST)).toBe(true);
    expect(isWithinAdHours('Asia/Seoul', 'Asia/Seoul', AT_0800_KST)).toBe(true);
  });

  it('한국 07:59 · 07:30 은 금지다', () => {
    expect(
      isWithinAdHours(
        null,
        'Asia/Seoul',
        new Date(AT_0800_KST.getTime() - 60_000),
      ),
    ).toBe(false);
    expect(
      isWithinAdHours(
        null,
        'Asia/Seoul',
        new Date(AT_0800_KST.getTime() - 30 * 60_000),
      ),
    ).toBe(false);
  });

  it('같은 그룹이라도 사용자 현지가 08시 전이면 금지다 — 싱가포르 08:00 의 방콕(07:00)', () => {
    /** 2026-10-30 08:00 SGT */
    const sg0800 = new Date('2026-10-30T00:00:00.000Z');

    expect(isWithinAdHours('Asia/Singapore', 'Asia/Singapore', sg0800)).toBe(
      true,
    );
    expect(isWithinAdHours('Asia/Bangkok', 'Asia/Singapore', sg0800)).toBe(
      false,
    );
  });

  it('21시부터는 금지다', () => {
    /** 2026-10-30 21:00 KST */
    expect(
      isWithinAdHours(
        'Asia/Seoul',
        'Asia/Seoul',
        new Date('2026-10-30T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('morningListenedSince — "오늘 이미 들었다"의 시작 = 그룹 기준 시간대의 오늘 05:00', () => {
  it('08:00 크론이면 3시간 전(05:00 KST)이다', () => {
    expect(
      morningListenedSince(new Date('2026-10-30T08:00:12+09:00'), 'Asia/Seoul'),
    ).toEqual(new Date('2026-10-30T05:00:00+09:00'));
  });

  it('배치가 늦게 끝나 11:00에 보내도 05:00부터 센다 — 06:30에 들은 사용자는 "들음"이다', () => {
    expect(
      morningListenedSince(new Date('2026-10-30T11:07:45+09:00'), 'Asia/Seoul'),
    ).toEqual(new Date('2026-10-30T05:00:00+09:00'));
  });

  it('다른 그룹은 그 기준 시간대의 05:00이다(서머타임 포함)', () => {
    expect(
      morningListenedSince(
        new Date('2026-07-15T08:00:00-05:00'),
        'America/Chicago',
      ),
    ).toEqual(new Date('2026-07-15T05:00:00-05:00'));
  });
});

describe('isMorningPushHoldout — 아침 알림 비교 그룹(2026-10-31)', () => {
  const ids = Array.from(
    { length: 4000 },
    (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
  );

  it('사용자를 반(50:50)에 가깝게 나눈다', () => {
    const held = ids.filter((id) => isMorningPushHoldout(id)).length;

    expect(held / ids.length).toBeGreaterThan(0.45);
    expect(held / ids.length).toBeLessThan(0.55);
  });

  it('같은 사용자는 늘 같은 쪽이다', () => {
    for (const id of ids.slice(0, 50)) {
      expect(isMorningPushHoldout(id)).toBe(isMorningPushHoldout(id));
    }
  });

  it('도착 알림 시각 A/B 그룹과 독립이다 — 네 칸이 고르게 나뉜다', () => {
    const cells = [0, 0, 0, 0];
    for (const id of ids) {
      cells[dripArrivalBucketOf(id) * 2 + (isMorningPushHoldout(id) ? 1 : 0)]++;
    }
    for (const count of cells) {
      expect(count / ids.length).toBeGreaterThan(0.2);
      expect(count / ids.length).toBeLessThan(0.3);
    }
  });
});
