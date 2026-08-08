import { ContentTopicView } from '@/modules/content/content.types';
import { ContentListenedSecView } from '@/modules/playback/playback.types';

import {
  buildTopicDistribution,
  buildWeeklyBuckets,
  calculateStreakDays,
} from './profile.stats';

const CONTENT_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const CONTENT_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_CAREER = 'cccccccc-1111-4111-8111-111111111111';
const TOPIC_MONEY = 'dddddddd-1111-4111-8111-111111111111';

function listened(
  contentId: string,
  listenedSec: number,
): ContentListenedSecView {
  return { contentId, listenedSec };
}

function topicOf(
  contentId: string,
  topicId: string,
  name: string,
): ContentTopicView {
  return { contentId, topicId, name };
}

describe('profile.stats', () => {
  describe('calculateStreakDays', () => {
    it('오늘 들었으면 오늘부터 이어진 날짜를 센다', () => {
      // given
      const playDates = ['2026-08-08', '2026-08-07', '2026-08-06'];

      // when
      const streak = calculateStreakDays(playDates, '2026-08-08');

      // then
      expect(streak).toBe(3);
    });

    it('오늘 아직 듣지 않았어도 어제까지 이어진 기록을 그대로 돌려준다', () => {
      // given — profile.md 4.5: 오늘 들으면 +1 되고, 하루가 지났다고 깎지 않는다
      const playDates = [
        '2026-08-07',
        '2026-08-06',
        '2026-08-05',
        '2026-08-04',
        '2026-08-03',
      ];

      // when
      const streak = calculateStreakDays(playDates, '2026-08-08');

      // then
      expect(streak).toBe(5);
    });

    it('어제도 오늘도 듣지 않았으면 0이다', () => {
      // given
      const playDates = ['2026-08-06', '2026-08-05'];

      // when
      const streak = calculateStreakDays(playDates, '2026-08-08');

      // then
      expect(streak).toBe(0);
    });

    it('중간에 하루라도 비면 그 앞은 세지 않는다', () => {
      // given — 8-05가 비어 있다
      const playDates = ['2026-08-08', '2026-08-07', '2026-08-04'];

      // when
      const streak = calculateStreakDays(playDates, '2026-08-08');

      // then
      expect(streak).toBe(2);
    });

    it('기록이 하나도 없으면 0이다', () => {
      // given / when
      const streak = calculateStreakDays([], '2026-08-08');

      // then
      expect(streak).toBe(0);
    });

    it('월 경계를 넘어도 연속으로 센다', () => {
      // given — 7월 31일과 8월 1일은 이어진 날이다
      const playDates = ['2026-08-01', '2026-07-31', '2026-07-30'];

      // when
      const streak = calculateStreakDays(playDates, '2026-08-01');

      // then
      expect(streak).toBe(3);
    });
  });

  describe('buildWeeklyBuckets', () => {
    it('기록 없는 요일도 0으로 자리를 지켜 7칸을 채운다', () => {
      // given
      const weekDates = [
        '2026-08-03',
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
        '2026-08-08',
        '2026-08-09',
      ];
      const listenedSecByDate = new Map([
        ['2026-08-03', 1220],
        ['2026-08-05', 845],
      ]);

      // when
      const buckets = buildWeeklyBuckets(weekDates, listenedSecByDate);

      // then
      expect(buckets).toEqual([1220, 0, 845, 0, 0, 0, 0]);
    });

    it('한 주 전체가 비어도 0 배열을 돌려준다 — 빈 주를 따로 표현하지 않는다', () => {
      // given
      const weekDates = Array.from(
        { length: 7 },
        (_, index) => `2026-08-0${index + 3}`,
      );

      // when
      const buckets = buildWeeklyBuckets(weekDates, new Map());

      // then
      expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('buildTopicDistribution', () => {
    it('여러 주제에 속한 콘텐츠는 각 주제에 청취 시간을 그대로 더한다', () => {
      // given — 한 콘텐츠(100초)가 두 주제에 속하면 두 주제 모두 100초를 받는다
      const listenedByContent = [listened(CONTENT_A, 100)];
      const topicViews = [
        topicOf(CONTENT_A, TOPIC_CAREER, '커리어'),
        topicOf(CONTENT_A, TOPIC_MONEY, '재테크'),
      ];

      // when
      const distribution = buildTopicDistribution(
        listenedByContent,
        topicViews,
      );

      // then — 분할 배분하지 않으므로 둘 다 50%가 아니라 총량 200 대비 50%씩이다
      expect(distribution.topics).toEqual([
        { topicId: TOPIC_CAREER, name: '커리어', ratio: 50 },
        { topicId: TOPIC_MONEY, name: '재테크', ratio: 50 },
      ]);
      expect(distribution.othersRatio).toBe(0);
    });

    it('상위 5개만 개별 항목으로 두고 나머지는 기타로 묶는다', () => {
      // given — 주제 7개
      const listenedByContent = Array.from({ length: 7 }, (_, index) =>
        listened(`content-${index}`, (7 - index) * 100),
      );
      const topicViews = listenedByContent.map((row, index) =>
        topicOf(row.contentId, `topic-${index}`, `주제${index}`),
      );

      // when
      const distribution = buildTopicDistribution(
        listenedByContent,
        topicViews,
      );

      // then
      expect(distribution.topics).toHaveLength(5);
      expect(distribution.othersRatio).toBeGreaterThan(0);
    });

    it('반올림 오차를 흡수해 합이 정확히 100이 된다', () => {
      // given — 3등분은 33.33…%라 그대로 반올림하면 99가 된다
      const listenedByContent = [
        listened('content-0', 100),
        listened('content-1', 100),
        listened('content-2', 100),
      ];
      const topicViews = [
        topicOf('content-0', 'topic-0', '주제0'),
        topicOf('content-1', 'topic-1', '주제1'),
        topicOf('content-2', 'topic-2', '주제2'),
      ];

      // when
      const distribution = buildTopicDistribution(
        listenedByContent,
        topicViews,
      );

      // then
      const sum =
        distribution.topics.reduce((total, topic) => total + topic.ratio, 0) +
        distribution.othersRatio;
      expect(sum).toBe(100);
    });

    it('오차는 가장 큰 항목이 흡수해 순위가 뒤바뀌지 않는다', () => {
      // given
      const listenedByContent = [
        listened('content-0', 100),
        listened('content-1', 100),
        listened('content-2', 100),
      ];
      const topicViews = [
        topicOf('content-0', 'topic-0', '주제0'),
        topicOf('content-1', 'topic-1', '주제1'),
        topicOf('content-2', 'topic-2', '주제2'),
      ];

      // when
      const distribution = buildTopicDistribution(
        listenedByContent,
        topicViews,
      );

      // then — 첫 항목이 +1을 받고, 내림차순 정렬이 유지된다
      const ratios = distribution.topics.map((topic) => topic.ratio);
      expect(ratios[0]).toBeGreaterThanOrEqual(ratios[1]);
      expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
    });

    it('청취 시간이 0인 콘텐츠는 집계에 넣지 않는다', () => {
      // given
      const listenedByContent = [
        listened(CONTENT_A, 100),
        listened(CONTENT_B, 0),
      ];
      const topicViews = [
        topicOf(CONTENT_A, TOPIC_CAREER, '커리어'),
        topicOf(CONTENT_B, TOPIC_MONEY, '재테크'),
      ];

      // when
      const distribution = buildTopicDistribution(
        listenedByContent,
        topicViews,
      );

      // then
      expect(distribution.topics).toEqual([
        { topicId: TOPIC_CAREER, name: '커리어', ratio: 100 },
      ]);
    });

    it('청취 기록이 없으면 빈 목록과 0을 돌려준다', () => {
      // given / when
      const distribution = buildTopicDistribution([], []);

      // then
      expect(distribution).toEqual({ topics: [], othersRatio: 0 });
    });
  });
});
