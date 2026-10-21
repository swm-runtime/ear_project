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

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 시리즈 화면 편 행의 제목 — 앞머리의 `{시리즈 제목} {N} — `를 떼고 소제목만 남긴다(PM 2026-10-22 "시리즈명 1 이거 없애고
 * 소제목만"). 시리즈 화면은 머리에 시리즈 제목이, 행 왼쪽에 화수 번호가 이미 있어 같은 글자가 줄마다 반복됐다.
 * 구분자는 시리즈마다 다르다(`—` · `-` · `–` · `:`). 꼴이 맞지 않거나 떼고 나서 비면 원래 제목 그대로 둔다 —
 * 서버 제목은 바꾸지 않는다(탐색·라이브러리·플레이어는 원래 제목)
 */
export const seriesEpisodeSubtitle = (title: string, seriesTitle: string): string => {
  const prefix = seriesTitle.trim();
  if (prefix.length === 0) return title;
  const match = new RegExp(`^${escapeRegExp(prefix)}\\s*\\d+\\s*[—–\\-:]\\s*`).exec(title);
  if (!match) return title;
  const rest = title.slice(match[0].length).trim();
  return rest.length > 0 ? rest : title;
};

/**
 * 머리 [재생]이 틀 편 — **아직 다 듣지 않은 가장 앞 편**(듣다 만 편이면 서버 재생 위치에서 이어진다), 전부 완청이면 1화부터
 * (PM 2026-10-22 — 앨범 화면의 재생 버튼). 순서는 서버가 준 목록(episode_no 오름차순) 그대로. 편이 없으면 null.
 * 한 편만 튼다 — 끝난 뒤 다음 편으로 넘어가는 연속 재생은 없다(보류 그대로)
 */
export const pickSeriesPlayEpisode = (episodes: readonly SeriesEpisode[]): SeriesEpisode | null =>
  episodes.find((episode) => !toSeriesEpisodeState(episode).isCompleted) ?? episodes[0] ?? null;
