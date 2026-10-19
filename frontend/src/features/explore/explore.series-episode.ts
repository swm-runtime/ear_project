import { EXPLORE_COPY } from './explore.copy';
import type { SeriesEpisode } from './explore.types';

/**
 * 시리즈 화면 편 행의 내 상태(explore.md 4.7) — **전부 서버 값**에서 옮긴다(담음 = `library != null`, 완청 =
 * `library.status === 'completed'`, 재생 위치 = `progress.position_sec`). 클라이언트가 완청을 다시 판정하지 않는다
 * (완청 판정의 소유자는 서버 — player.md 4.4)
 */
export interface SeriesEpisodeState {
  /** 행의 길이(분) — 탐색 타일과 같은 반올림(최소 1분) */
  minutes: number;
  isSaved: boolean;
  isCompleted: boolean;
  /** 진행 바 비율 0~1 — 완청이면 1, 재생 위치가 없거나 0 이면 null(바를 그리지 않는다) */
  progressRatio: number | null;
  /** 듣다 만 편의 남은 분(최소 1) — 완청이거나 재생 위치가 없으면 null */
  remainingMinutes: number | null;
}

export const toSeriesEpisodeState = (episode: SeriesEpisode): SeriesEpisodeState => {
  const { durationSec } = episode.item.content;
  const minutes = Math.max(1, Math.round(durationSec / 60));
  const library = episode.item.library;
  const isCompleted = library?.status === 'completed';
  const positionSec = episode.progress?.positionSec ?? 0;
  const hasPosition = !isCompleted && positionSec > 0 && durationSec > 0;
  return {
    minutes,
    isSaved: library !== null,
    isCompleted,
    progressRatio: isCompleted ? 1 : hasPosition ? Math.min(1, positionSec / durationSec) : null,
    remainingMinutes: hasPosition
      ? Math.max(1, Math.ceil(Math.max(0, durationSec - positionSec) / 60))
      : null,
  };
};

/**
 * 행에 적는 상태 글자 하나 — 완청 > 듣는 중(남은 분) > 담음 순. 아무것도 아니면 null(자리를 비운다).
 * 진행 바만 두면 색·길이만으로 상태를 말하게 되므로 글자를 함께 둔다(design.md §1)
 */
export const seriesEpisodeStateLabel = (state: SeriesEpisodeState): string | null => {
  if (state.isCompleted) return EXPLORE_COPY.series.state.completed;
  if (state.remainingMinutes !== null)
    return EXPLORE_COPY.series.state.remaining(state.remainingMinutes);
  if (state.isSaved) return EXPLORE_COPY.series.state.saved;
  return null;
};
