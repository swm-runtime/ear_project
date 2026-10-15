import { formatFullDate, toLocalDate } from '@/shared/i18n/format';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

import type { ContentDetailSeries } from './content-detail.types';

/** 상세 화면의 길이·발행일·시리즈 표기(KAN-194) */
const ko = {
  duration: (minutes: number, seconds: number) =>
    `${minutes}분 ${String(seconds).padStart(2, '0')}초`,
  publishedDate: (year: number, month: number, day: number) =>
    formatFullDate({ year, month, day }, 'ko'),
  series: (totalEpisodes: number, episodeNo: number) => `${totalEpisodes}부작 중 ${episodeNo}화`,
} as const;
const en: LocalizedCopy<typeof ko> = {
  duration: (minutes: number, seconds: number) => `${minutes} min ${seconds} sec`,
  /** `Intl` — 기기 로캘 순서(en-US "Oct 15, 2026" · en-GB "15 Oct 2026", KAN-197) */
  publishedDate: (year: number, month: number, day: number) =>
    formatFullDate({ year, month, day }, 'en'),
  series: (totalEpisodes: number, episodeNo: number) => `Episode ${episodeNo} of ${totalEpisodes}`,
};
const COPY = localized({ ko, en });

/**
 * 오디오 길이 "N분 N초" — 초 단위까지 표기한다(content-detail.md 4.2, 확정 2026-08-23).
 * 목록 행의 분 단위와 달리 상세는 정확한 값을 보여주는 자리다. 초 자릿수·1분 미만·정각
 * 표기는 uiux 9장 미결 — 확정 전에는 시안(두 자리 패딩 "M분 SS초")을 따른다.
 */
export const formatContentDuration = (durationSec: number): string => {
  const safeSec = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  return COPY.duration(minutes, seconds);
};

/**
 * 발행일 "YYYY년 M월 D일" — 형식 제안(content-detail-uiux.md 6장 TODO, 확정 시 갱신).
 * `published_at` 은 ISO UTC 순간이라 **기기 시간대의 날짜**로 그린다(표시 전용 — `spec/api/global-api.md` 2.4).
 * 기기 시각을 정책 판정에 쓰지 않는다는 원칙과 무관하다.
 */
export const formatPublishedDate = (publishedAt: string): string => {
  const { year, month, day } = toLocalDate(publishedAt);
  return COPY.publishedDate(year, month, day);
};

/** 시리즈 "N부작 중 M화"(content-detail.md 4.3-1 — 확정 카피) */
export const formatSeriesLabel = (series: ContentDetailSeries): string =>
  COPY.series(series.totalEpisodes, series.episodeNo);
