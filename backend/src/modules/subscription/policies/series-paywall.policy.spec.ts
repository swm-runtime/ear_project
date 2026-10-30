import {
  DEFAULT_SERIES_FREE_EPISODES,
  SERIES_ALL_UNLOCKED,
  isSeriesEpisodeLocked,
  parseSeriesFreeEpisodes,
  parseSeriesPaywallEnabled,
  resolveSeriesEpisodeAccess,
  seriesEpisodeUnlockedSql,
} from './series-paywall.policy';

const SERIES_ID = 'series-1';

describe('series-paywall.policy (KAN-290)', () => {
  describe('isSeriesEpisodeLocked', () => {
    const locked = { lockedAfterEpisodeNo: 3 };

    it('무료 편수 뒤 편만 잠근다 — 1~3편은 열리고 4편부터 잠긴다', () => {
      expect(
        [1, 2, 3, 4, 5].map((episodeNo) =>
          isSeriesEpisodeLocked({ seriesId: SERIES_ID, episodeNo }, locked),
        ),
      ).toEqual([false, false, false, true, true]);
    });

    it('시리즈가 아닌 콘텐츠는 늘 열려 있다', () => {
      expect(
        isSeriesEpisodeLocked({ seriesId: null, episodeNo: null }, locked),
      ).toBe(false);
    });

    it('잠그지 않는 접근이면 4편 이후도 열려 있다', () => {
      expect(
        isSeriesEpisodeLocked(
          { seriesId: SERIES_ID, episodeNo: 10 },
          SERIES_ALL_UNLOCKED,
        ),
      ).toBe(false);
    });
  });

  describe('resolveSeriesEpisodeAccess', () => {
    const base = {
      enabled: true,
      freeEpisodes: 3,
      isPaidSubscriber: false,
      isTrialActive: false,
    };

    it('스위치가 켜져 있고 유료 요금제·체험이 아니면 무료 편수 뒤를 잠근다', () => {
      expect(resolveSeriesEpisodeAccess(base)).toEqual({
        lockedAfterEpisodeNo: 3,
      });
    });

    it('유료 요금제(데일리·프로)·체험 중·스위치 꺼짐은 잠그지 않는다', () => {
      expect(
        resolveSeriesEpisodeAccess({ ...base, isPaidSubscriber: true }),
      ).toBe(SERIES_ALL_UNLOCKED);
      expect(resolveSeriesEpisodeAccess({ ...base, isTrialActive: true })).toBe(
        SERIES_ALL_UNLOCKED,
      );
      expect(resolveSeriesEpisodeAccess({ ...base, enabled: false })).toBe(
        SERIES_ALL_UNLOCKED,
      );
    });
  });

  describe('설정 해석', () => {
    it('스위치는 true 명시만 켠다', () => {
      expect(parseSeriesPaywallEnabled('true')).toBe(true);
      expect(parseSeriesPaywallEnabled(' true ')).toBe(true);
      for (const value of [undefined, null, '', 'false', 'TRUE', '1']) {
        expect(parseSeriesPaywallEnabled(value)).toBe(false);
      }
    });

    it('무료 편수는 비우면 3, 양의 정수면 그 값이다', () => {
      expect(parseSeriesFreeEpisodes(undefined)).toBe(
        DEFAULT_SERIES_FREE_EPISODES,
      );
      expect(parseSeriesFreeEpisodes('')).toBe(3);
      expect(parseSeriesFreeEpisodes('0')).toBe(3);
      expect(parseSeriesFreeEpisodes('5')).toBe(5);
    });
  });

  describe('seriesEpisodeUnlockedSql', () => {
    it('TS 판정과 같은 조건을 SQL로 쓴다 — 꺼짐(NULL)·단편·무료 편·열리는 티어·체험 중이면 통과', () => {
      expect(
        seriesEpisodeUnlockedSql({
          seriesId: 'c.series_id',
          episodeNo: 'c.episode_no',
          userTier: 'u.tier',
          userTrialEndsAt: 'u.trial_ends_at',
          lockedAfterParam: '$9',
          unlockedTiersParam: '$10',
          nowParam: '$11',
        }),
      ).toBe(
        '($9::int IS NULL OR c.series_id IS NULL OR c.episode_no IS NULL OR c.episode_no <= $9::int OR u.tier = ANY($10::text[]) OR (u.trial_ends_at IS NOT NULL AND u.trial_ends_at > $11::timestamptz))',
      );
    });
  });
});
