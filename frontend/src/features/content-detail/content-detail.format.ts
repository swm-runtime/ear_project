import { formatFullDate, toLocalDate } from '@/shared/i18n/format';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

import type { ContentDetailSeries } from './content-detail.types';

/** 상세 화면의 길이·발행일·시리즈 표기(KAN-194) */
const ko = {
  // 초가 0 이면 "15분" — "15분 00초"로 적지 않는다(PM 확정 2026-10-18). 초가 있으면 두 자리 패딩 "12분 34초"·"15분 08초"
  duration: (minutes: number, seconds: number) =>
    seconds === 0 ? `${minutes}분` : `${minutes}분 ${String(seconds).padStart(2, '0')}초`,
  publishedDate: (year: number, month: number, day: number) =>
    formatFullDate({ year, month, day }, 'ko'),
  series: (totalEpisodes: number, episodeNo: number) => `${totalEpisodes}부작 중 ${episodeNo}화`,
  seriesWithTitle: (title: string, totalEpisodes: number, episodeNo: number) =>
    `${title} · ${totalEpisodes}부작 중 ${episodeNo}화`,
} as const;
const en: LocalizedCopy<typeof ko> = {
  // 초가 0 이면 "5 min" — "5 min 0 sec" 는 영어로 어색하다(2026-10-18 영어 QA). 한국어도 같은 규칙이다(정각 "15분", PM 확정 2026-10-18)
  duration: (minutes: number, seconds: number) =>
    seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`,
  /** `Intl` — 기기 로캘 순서(en-US "Oct 15, 2026" · en-GB "15 Oct 2026", KAN-197) */
  publishedDate: (year: number, month: number, day: number) =>
    formatFullDate({ year, month, day }, 'en'),
  series: (totalEpisodes: number, episodeNo: number) => `Episode ${episodeNo} of ${totalEpisodes}`,
  seriesWithTitle: (title: string, totalEpisodes: number, episodeNo: number) =>
    `${title} · Episode ${episodeNo} of ${totalEpisodes}`,
};
const COPY = localized({ ko, en });

/**
 * 오디오 길이 "N분 N초" — 초 단위까지 표기한다(content-detail.md 4.2, 확정 2026-08-23).
 * 목록 행의 분 단위와 달리 상세는 정확한 값을 보여주는 자리다. 초는 두 자리 패딩("15분 08초"),
 * **정각은 초를 빼고 "15분"**(PM 확정 2026-10-18 — content-detail-uiux.md 4.4). 1분 미만은 시안("0분 45초")을 따른다.
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

/**
 * 시리즈 줄 "{시리즈 제목} · N부작 중 M화"(content-detail.md 4.3-1 — KAN-225). 시리즈 이름이 없는 응답(구버전 서버)은
 * 종전 "N부작 중 M화" 그대로다. 콘텐츠 제목은 따로 줄이지 않는다(시리즈 이름을 품은 원래 제목 그대로)
 */
export const formatSeriesLabel = (
  series: Pick<ContentDetailSeries, 'title' | 'episodeNo' | 'totalEpisodes'>,
): string =>
  series.title !== null
    ? COPY.seriesWithTitle(series.title, series.totalEpisodes, series.episodeNo)
    : COPY.series(series.totalEpisodes, series.episodeNo);
