import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

/** 영어 단위 — 1 이면 단수 */
const enUnit = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** 스크린리더용 시간 단위(KAN-194) */
const ko = {
  hours: (count: number) => `${count}시간`,
  minutes: (count: number) => `${count}분`,
  seconds: (count: number) => `${count}초`,
} as const;
const en: LocalizedCopy<typeof ko> = {
  hours: (count: number) => enUnit(count, 'hour'),
  minutes: (count: number) => enUnit(count, 'minute'),
  seconds: (count: number) => enUnit(count, 'second'),
};
const COPY = localized({ ko, en });

/**
 * 시간 표기(player-uiux.md 6장) — `MM:SS`, 1시간 이상이면 `H:MM:SS`.
 * 화면의 시간은 표시일 뿐 판정 근거가 아니다.
 */
export const formatPlaybackTime = (totalSec: number): string => {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** 스크린리더용 — "09:12"가 "영 구 콜론 일 이"로 읽히지 않게 한다(player-uiux.md 7장) */
export const formatPlaybackTimeA11y = (totalSec: number): string => {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(COPY.hours(hours));
  if (minutes > 0) parts.push(COPY.minutes(minutes));
  parts.push(COPY.seconds(seconds));
  return parts.join(' ');
};
