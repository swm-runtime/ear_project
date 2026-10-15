import { formatFullDate, toLocalDate } from '@/shared/i18n/format';
import { APP_LANGUAGE, type AppLanguage } from '@/shared/i18n/locale';

/**
 * 공지 날짜 "YYYY.MM.DD"(settings-uiux.md 4.7 S8·S9 — 확정 형식). 기기 로컬 시각 기준이다.
 * 표시 전용 포맷팅이다 — 기기 시각을 정책 판정에 쓰지 않는다는 원칙과 무관하다.
 * 영어는 점 구분 숫자 날짜가 낯설어 `Intl` 로 그린다 — en-US "Oct 15, 2026" · en-GB "15 Oct 2026"(KAN-197)
 */
export const formatNoticeDate = (
  publishedAt: string,
  language: AppLanguage = APP_LANGUAGE,
): string => {
  const date = toLocalDate(publishedAt);
  if (language === 'en') return formatFullDate(date, 'en');
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}.${month}.${day}`;
};
