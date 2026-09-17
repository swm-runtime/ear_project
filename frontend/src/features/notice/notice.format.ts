/**
 * 공지 날짜 "YYYY.MM.DD"(settings-uiux.md 4.7 S8·S9 — 확정 형식). 기기 로컬 시각 기준이다.
 * 표시 전용 포맷팅이다 — 기기 시각을 정책 판정에 쓰지 않는다는 원칙과 무관하다.
 */
export const formatNoticeDate = (publishedAt: string): string => {
  const date = new Date(publishedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};
