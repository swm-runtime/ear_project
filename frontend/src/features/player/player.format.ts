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
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  parts.push(`${seconds}초`);
  return parts.join(' ');
};
