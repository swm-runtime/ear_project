import { calculateListeningTopPercent } from '@/modules/profile/profile.stats';
import { MessageLanguage, UserMarket } from '@/modules/user/user.enum';

import { RetentionRuleKey } from './retention-push.enum';
import {
  assignVariant,
  evaluateCandidates,
  fillTemplate,
  isCapped,
  parseRetentionLogType,
  pickCandidate,
  planRetentionPush,
  retentionLogType,
  secondsToTopPercent,
} from './retention-push.policy';
import { RETENTION_RULES } from './retention-push.rules';
import {
  RetentionMarketFacts,
  RetentionSentRecord,
  RetentionUserFacts,
} from './retention-push.types';

// 2026-10-26 18:00 KST
const NOW = new Date('2026-10-26T09:00:00.000Z');
const WEEK_START = '2026-10-26';
const HOUR = 60 * 60 * 1000;

function user(overrides: Partial<RetentionUserFacts> = {}): RetentionUserFacts {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    market: UserMarket.KR,
    listenedRecently: false,
    weekListenedSec: 0,
    streakDays: 0,
    resume: null,
    ...overrides,
  };
}

/** 이번 주 청취자 30명 — 3000초부터 100초씩 줄어든다. 모집단 100명 */
function market(
  overrides: Partial<RetentionMarketFacts> = {},
): RetentionMarketFacts {
  return {
    population: 100,
    weekListenedDesc: Array.from({ length: 30 }, (_, i) => 3000 - i * 100),
    listenersNow: 0,
    ...overrides,
  };
}

const sent = (
  ruleKey: RetentionRuleKey,
  hoursAgo: number,
): RetentionSentRecord => ({
  ruleKey,
  sentAt: new Date(NOW.getTime() - hoursAgo * HOUR),
});

describe('secondsToTopPercent', () => {
  it('남은 시간을 채우면 프로필 상위 % 공식으로도 그 %에 든다', () => {
    // given — 모집단 100, 상위 10% = 10등 이내. 나를 뺀 10번째 = 2100초
    const others = market().weekListenedDesc;
    const mine = 1500;

    // when
    const gap = secondsToTopPercent(mine, others, 100, 10);

    // then
    expect(gap).toBe(600);
    const listenedMore = others.filter(
      (sec) => sec > mine + (gap as number),
    ).length;
    expect(
      calculateListeningTopPercent(mine + (gap as number), listenedMore, 100),
    ).toBe(10);
    // 1초 모자라면 아직 아니다
    const short = mine + (gap as number) - 1;
    expect(
      calculateListeningTopPercent(
        short,
        others.filter((sec) => sec > short).length,
        100,
      ),
    ).toBe(11);
  });

  it('이미 그 % 안이면 null', () => {
    expect(
      secondsToTopPercent(2500, market().weekListenedDesc, 100, 10),
    ).toBeNull();
  });

  it('모집단이 작아 그 %가 1등보다 좁으면 null', () => {
    expect(secondsToTopPercent(100, [500], 5, 10)).toBeNull();
  });

  it('이번 주 0초인 사용자도 기준까지의 시간이 짧으면 권한다(모집단에 0초 계정이 들어 있다)', () => {
    expect(evaluateCandidates(user(), market()).map((c) => c.vars)).toEqual([
      { gap: 2, percent: 30 },
    ]);
  });

  it('기준 자리가 0초(그만큼 들은 사람이 없다)면 null — 아무나 들으면 드는 순위를 권하지 않는다', () => {
    expect(secondsToTopPercent(0, [300, 200], 100, 30)).toBeNull();
  });
});

describe('evaluateCandidates', () => {
  it('상위 10%까지 15분 안이면 주간 순위 규칙이 성립하고 분은 올림이다', () => {
    // given — 10번째 2100초, 내 1500초 → 600초 = 10분
    const candidates = evaluateCandidates(
      user({ weekListenedSec: 1500 }),
      market(),
    );

    // then
    expect(candidates[0]).toEqual({
      ruleKey: RetentionRuleKey.WEEKLY_RANK_GAP,
      vars: { gap: 10, percent: 10 },
      deepLink: 'ear://library',
    });
  });

  it('10%는 멀고 20%가 가까우면 20%로 권한다', () => {
    // given — 10%(2100초)까지 1500초, 20%(1100초)까지 300초
    const [first] = evaluateCandidates(
      user({ weekListenedSec: 800 }),
      market(),
    );

    // then
    expect(first.vars).toEqual({ gap: 5, percent: 20 });
  });

  it('이번 주 청취자가 20명 미만이면 순위 규칙은 성립하지 않는다(개인이 드러나는 소수 집단)', () => {
    const small = market({ weekListenedDesc: [900, 800, 700] });

    expect(
      evaluateCandidates(user({ weekListenedSec: 600 }), small).map(
        (c) => c.ruleKey,
      ),
    ).not.toContain(RetentionRuleKey.WEEKLY_RANK_GAP);
  });

  it('연속 기록·지금 듣는 사람은 오늘 이미 들은 사용자에게 성립하지 않는다', () => {
    // given
    const facts = { streakDays: 4, weekListenedSec: 0 };
    const busy = market({ listenersNow: 25, weekListenedDesc: [] });

    // when
    const notYet = evaluateCandidates(user(facts), busy).map((c) => c.ruleKey);
    const already = evaluateCandidates(
      user({ ...facts, listenedRecently: true }),
      busy,
    ).map((c) => c.ruleKey);

    // then
    expect(notYet).toEqual([
      RetentionRuleKey.STREAK_KEEP,
      RetentionRuleKey.PEERS_LISTENING,
    ]);
    expect(already).toEqual([]);
  });

  it('지금 듣는 사람이 10명 미만이면 보내지 않는다 — 숫자를 부풀리지 않는다', () => {
    expect(
      evaluateCandidates(user(), market({ listenersNow: 9 })).map(
        (c) => c.ruleKey,
      ),
    ).not.toContain(RetentionRuleKey.PEERS_LISTENING);
  });

  it('듣던 콘텐츠는 남은 1~20분일 때만, 딥링크는 그 콘텐츠다', () => {
    const resume = (remainingSec: number) =>
      evaluateCandidates(
        user({ resume: { contentId: 'c1', title: '연봉 협상', remainingSec } }),
        market({ weekListenedDesc: [] }),
      );

    expect(resume(59)).toEqual([]);
    expect(resume(21 * 60)).toEqual([]);
    expect(resume(7 * 60 + 1)).toEqual([
      {
        ruleKey: RetentionRuleKey.RESUME_CONTENT,
        vars: { minutes: 8, title: '연봉 협상' },
        deepLink: 'ear://contents/c1',
      },
    ]);
  });

  it('꺼진 규칙은 후보가 되지 않는다', () => {
    const rules = RETENTION_RULES.map((rule) =>
      rule.key === RetentionRuleKey.STREAK_KEEP
        ? { ...rule, enabled: false }
        : rule,
    );

    expect(
      evaluateCandidates(
        user({ streakDays: 5 }),
        market({ weekListenedDesc: [] }),
        rules,
      ),
    ).toEqual([]);
  });
});

describe('빈도 제한', () => {
  it('최근 20시간 안에 1건 보냈으면 막는다', () => {
    expect(isCapped([sent(RetentionRuleKey.STREAK_KEEP, 19)], NOW)).toBe(true);
    expect(isCapped([sent(RetentionRuleKey.STREAK_KEEP, 21)], NOW)).toBe(false);
  });

  it('최근 7일에 3건이면 막는다', () => {
    const history = [24, 48, 72].map((h) =>
      sent(RetentionRuleKey.STREAK_KEEP, h),
    );

    expect(isCapped(history, NOW)).toBe(true);
    expect(isCapped(history.slice(0, 2), NOW)).toBe(false);
  });

  it('쿨다운 안의 규칙은 건너뛰고 다음 규칙을 고른다', () => {
    // given — 주간 순위는 72시간 쿨다운, 48시간 전에 보냈다
    const candidates = evaluateCandidates(
      user({ weekListenedSec: 1500, streakDays: 3 }),
      market(),
    );

    // when
    const picked = pickCandidate(
      candidates,
      [sent(RetentionRuleKey.WEEKLY_RANK_GAP, 48)],
      NOW,
    );

    // then
    expect(picked?.ruleKey).toBe(RetentionRuleKey.STREAK_KEEP);
  });
});

describe('문구', () => {
  it('모든 규칙·언어·변형의 변수가 판정 값으로 다 채워진다', () => {
    // given — 규칙마다 성립하는 사실
    const vars: Record<RetentionRuleKey, Record<string, string | number>> = {
      [RetentionRuleKey.WEEKLY_RANK_GAP]: { gap: 5, percent: 20 },
      [RetentionRuleKey.STREAK_KEEP]: { days: 3, next: 4 },
      [RetentionRuleKey.RESUME_CONTENT]: { minutes: 8, title: '제목' },
      [RetentionRuleKey.PEERS_LISTENING]: { count: 12 },
    };

    for (const rule of RETENTION_RULES) {
      for (const language of Object.values(MessageLanguage)) {
        expect(rule.copy[language].length).toBeGreaterThan(0);

        for (const copy of rule.copy[language]) {
          expect(fillTemplate(copy.title, vars[rule.key])).not.toMatch(/[{}]/);
          expect(fillTemplate(copy.body, vars[rule.key])).not.toMatch(/[{}]/);
        }
      }
    }
  });

  it('보내는 문구에는 광고 표시와 수신거부 방법이 붙는다', () => {
    // when
    const ko = planRetentionPush({
      user: user({ weekListenedSec: 1500 }),
      market: market(),
      history: [],
      language: MessageLanguage.KO,
      weekStart: WEEK_START,
      now: NOW,
    });
    const en = planRetentionPush({
      user: user({ weekListenedSec: 1500, market: UserMarket.GLOBAL }),
      market: market(),
      history: [],
      language: MessageLanguage.EN,
      weekStart: WEEK_START,
      now: NOW,
    });

    // then
    expect(ko?.title).toMatch(/^\(광고\) /);
    expect(ko?.body).toMatch(/수신거부: 설정 > 알림$/);
    expect(en?.title).toBe(
      '(Ad) 10 more min puts you in the top 10% this week',
    );
    expect(en?.body).toBe(
      'One episode tonight is enough\nOpt out: Settings > Notifications',
    );
  });

  it('빈도 제한에 걸리면 알림을 정하지 않는다', () => {
    expect(
      planRetentionPush({
        user: user({ weekListenedSec: 1500 }),
        market: market(),
        history: [sent(RetentionRuleKey.STREAK_KEEP, 2)],
        language: MessageLanguage.KO,
        weekStart: WEEK_START,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('변형 배정·기록 종류', () => {
  it('같은 주에는 같은 변형, 범위는 변형 수 안이다', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    const variants = ids.map((id) =>
      assignVariant(id, RetentionRuleKey.STREAK_KEEP, WEEK_START, 2),
    );

    expect(variants).toEqual(
      ids.map((id) =>
        assignVariant(id, RetentionRuleKey.STREAK_KEEP, WEEK_START, 2),
      ),
    );
    expect(new Set(variants)).toEqual(new Set([0, 1]));
  });

  it('notification_logs.type 은 retention.<규칙>.<변형> 이고 되읽을 수 있다', () => {
    const type = retentionLogType(RetentionRuleKey.WEEKLY_RANK_GAP, 1);

    expect(type).toBe('retention.weekly_rank_gap.b');
    expect(parseRetentionLogType(type)).toBe(RetentionRuleKey.WEEKLY_RANK_GAP);
    expect(parseRetentionLogType('retention.removed_rule.a')).toBeNull();
    expect(parseRetentionLogType('drip_arrival')).toBeNull();
  });
});
