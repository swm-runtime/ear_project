/* eslint-disable no-restricted-imports -- 영어 날짜·복수형 회귀는 각 feature 의 카피·포맷을 직접 읽어야 한다(copy-ko.snapshot.test 와 같은 이유). 테스트 전용 */
import { describe, expect, it, jest } from '@jest/globals';

import {
  formatContentDuration,
  formatPublishedDate,
} from '@/features/content-detail/content-detail.format';
import { formatNoticeDate } from '@/features/notice/notice.format';
import { formatPlaybackTimeA11y } from '@/features/player/player.format';
import { PROFILE_COPY } from '@/features/profile/profile.copy';
import { SETTINGS_COPY } from '@/features/settings/settings.copy';

// 표시 언어를 영어(en-US 기기)로 고정한다 — jest.setup.js 의 한국어 고정을 이 파일에서만 덮는다
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/shared/i18n/locale'),
  APP_LANGUAGE: 'en',
  DISPLAY_LOCALE: 'en-US',
}));

/** 기기 시간대와 무관하게 같은 날짜가 나오도록 로컬 정오의 순간을 만든다 */
const localNoon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0).toISOString();

describe('영어 날짜·복수형(KAN-197) — Intl, en-US 기기', () => {
  it('프로필 플랜 줄 — ISO 순간은 기기 시간대의 "Oct 15"', () => {
    expect(PROFILE_COPY.plan.renewsAt(localNoon(2026, 10, 15))).toBe('Renews Oct 15');
  });

  it('서버 날짜 라벨(last_free_date)은 시간대를 거치지 않는다', () => {
    expect(PROFILE_COPY.plan.trial('2026-10-05')).toBe('Free trial · Unlimited until Oct 5');
    expect(SETTINGS_COPY.plan.trial('2026-10-05')).toBe('Free trial · Unlimited until Oct 5');
  });

  it('주 범위는 달을 넘어도 서버 week_start 라벨에서 +6일', () => {
    expect(PROFILE_COPY.stats.weekRange('2026-10-26')).toBe('Oct 26 – Nov 1');
  });

  it('복수형 — 1 은 단수, 나머지는 복수', () => {
    expect(PROFILE_COPY.stats.streakValue(1)).toBe('1 day');
    expect(PROFILE_COPY.stats.streakValue(12)).toBe('12 days');
    expect(SETTINGS_COPY.plan.free(1)).toBe('Free plan · 1 episode a day');
    expect(formatPlaybackTimeA11y(61)).toBe('1 minute 1 second');
    expect(formatPlaybackTimeA11y(3725)).toBe('1 hour 2 minutes 5 seconds');
  });

  it('누적 청취 타일 값은 숫자만 — 라벨 "Episodes played" 가 단위를 말한다(2026-10-18 영어 QA)', () => {
    expect(PROFILE_COPY.stats.completedValue(1)).toBe('1');
    expect(PROFILE_COPY.stats.completedValue(12)).toBe('12');
  });

  it('주간 그래프 축 최대값은 좁은 축 칸에 맞게 "72m"', () => {
    expect(PROFILE_COPY.stats.axisMax(72 * 60)).toBe('72m');
    expect(PROFILE_COPY.stats.axisMax(30)).toBe('<1m');
  });

  it('상세 길이 — 초가 0 이면 "5 min", 아니면 "5 min 8 sec"(2026-10-18 영어 QA)', () => {
    expect(formatContentDuration(300)).toBe('5 min');
    expect(formatContentDuration(308)).toBe('5 min 8 sec');
    expect(formatContentDuration(861)).toBe('14 min 21 sec');
  });

  it('주간 비교 두 줄은 짧게 — 화면은 "vs. prior Thursday" · "12h 38m more", 낭독은 풀어 쓴다(2026-10-19 실기기 잘림)', () => {
    const day = PROFILE_COPY.stats.dayHighlight(
      { kind: 'moreThanLastWeek', diffSec: 12 * 3600 + 38 * 60 },
      3,
      false,
    );
    expect(day.lead).toBe('vs. prior Thursday');
    expect(day.main).toBe('12h 38m more');
    expect(day.a11y).toBe('You listened 12 hr 38 min more than Thursday the week before');
    expect(
      PROFILE_COPY.stats.dayHighlight({ kind: 'moreThanLastWeek', diffSec: 30 }, 3, true).main,
    ).toBe('<1m more');

    const week = PROFILE_COPY.stats.highlight(
      { kind: 'moreThanPrevious', diffSec: 45 * 60 },
      false,
    );
    expect(week.lead).toBe('vs. prior week');
    expect(week.main).toBe('45m more');
    expect(PROFILE_COPY.stats.highlight({ kind: 'moreThanPrevious', diffSec: 60 }, true).lead).toBe(
      'vs. last week',
    );
  });

  it('들은 날 수·그날 편 수도 화면은 수만 — "Listened to 1 e…" 잘림(2026-10-19 실기기), 낭독은 문장', () => {
    const day = PROFILE_COPY.stats.dayHighlight({ kind: 'listenedContents', count: 1 }, 1, false);
    expect(day.lead).toBe('That day');
    expect(day.main).toBe('1 episode');
    expect(day.a11y).toBe('You listened to 1 episode that day');
    const week = PROFILE_COPY.stats.highlight({ kind: 'listenedDays', days: 3 }, true);
    expect(week.lead).toBe('This week');
    expect(week.main).toBe('3 days');
    expect(week.a11y).toBe('You listened 3 days this week');
  });

  it('발행일·공지 날짜는 "Aug 12, 2026"', () => {
    expect(formatPublishedDate(localNoon(2026, 8, 12))).toBe('Aug 12, 2026');
    expect(formatNoticeDate(localNoon(2026, 8, 12))).toBe('Aug 12, 2026');
  });
});
