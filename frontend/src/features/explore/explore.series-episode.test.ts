import { describe, expect, it } from '@jest/globals';

import {
  pickSeriesPlayEpisode,
  seriesEpisodeStateLabel,
  seriesEpisodeSubtitle,
  toSeriesEpisodeState,
} from './explore.series-episode';
import type { ExploreLibraryState, SeriesEpisode, SeriesEpisodeProgress } from './explore.types';

const episode = (
  library: ExploreLibraryState | null,
  progress: SeriesEpisodeProgress | null,
  durationSec = 1260,
): SeriesEpisode => ({
  episodeNo: 1,
  item: {
    type: 'content',
    content: {
      id: 'c1',
      title: '키워드로 빠르게 배우는 CS 지식 1 - 소프트웨어를 만드는 방법',
      authorName: '',
      sourceName: '이어 스튜디오',
      sourceUrl: null,
      durationSec,
      thumbnailUrl: 'https://example.com/1.webp',
      contentVersion: 1,
      topicIds: [],
      tags: [],
      language: 'ko',
      series: {
        id: 's1',
        title: '키워드로 빠르게 배우는 CS 지식',
        episodeNo: 1,
        totalEpisodes: 16,
      },
    },
    library,
    isCountedToday: false,
    isCompleted: library?.status === 'completed',
  },
  progress,
});

describe('toSeriesEpisodeState — 편 행의 내 상태는 서버 값 그대로다(explore.md 4.7)', () => {
  it('담지 않았고 재생 위치도 없으면 상태 글자·진행 바가 없다', () => {
    // given / when
    const state = toSeriesEpisodeState(episode(null, null));

    // then
    expect(state).toMatchObject({ isSaved: false, isCompleted: false, progressRatio: null });
    expect(seriesEpisodeStateLabel(state)).toBeNull();
  });

  it('library 가 있으면 담음으로 보인다', () => {
    const state = toSeriesEpisodeState(
      episode({ itemId: 'i1', source: 'drip', status: 'unplayed' }, null),
    );

    expect(state.isSaved).toBe(true);
    expect(seriesEpisodeStateLabel(state)).toBe('담음');
  });

  it('library.status 가 completed 면 완청이고 진행 바는 꽉 찬다 — 재생 위치와 무관하다', () => {
    const state = toSeriesEpisodeState(
      episode(
        { itemId: 'i1', source: 'save', status: 'completed' },
        { positionSec: 100, maxReachedSec: 1200 },
      ),
    );

    expect(state.isCompleted).toBe(true);
    expect(state.progressRatio).toBe(1);
    expect(state.remainingMinutes).toBeNull();
    expect(seriesEpisodeStateLabel(state)).toBe('완청');
  });

  it('듣다 만 편은 position_sec / 길이로 진행 바를 그리고 남은 분을 올림으로 적는다', () => {
    // given — 1260초 중 372초 → 888초 남음 → 15분(올림)
    const state = toSeriesEpisodeState(
      episode(
        { itemId: 'i1', source: 'save', status: 'in_progress' },
        { positionSec: 372, maxReachedSec: 372 },
      ),
    );

    // then
    expect(state.progressRatio).toBeCloseTo(372 / 1260);
    expect(state.remainingMinutes).toBe(15);
    expect(seriesEpisodeStateLabel(state)).toBe('15분 남음');
  });

  it('라이브러리에서 지웠어도 서버가 재생 위치를 주면 그대로 보인다(담음이 아니다)', () => {
    const state = toSeriesEpisodeState(episode(null, { positionSec: 600, maxReachedSec: 600 }));

    expect(state.isSaved).toBe(false);
    expect(seriesEpisodeStateLabel(state)).toBe('11분 남음');
  });

  it('재생 위치가 0 이면 진행 바를 그리지 않는다(0 으로 채운 값과 "없음"을 같게 본다)', () => {
    const state = toSeriesEpisodeState(episode(null, { positionSec: 0, maxReachedSec: 0 }));

    expect(state.progressRatio).toBeNull();
    expect(state.remainingMinutes).toBeNull();
  });
});

describe('seriesEpisodeSubtitle — 시리즈 화면 편 행 제목', () => {
  it('앞머리 "{시리즈 제목} {N} — "를 떼고 소제목만 남긴다', () => {
    expect(
      seriesEpisodeSubtitle(
        '키워드로 훑어보는 경제 상식 2 — 금리: 돈의 가격은 어떻게 정해지나',
        '키워드로 훑어보는 경제 상식',
      ),
    ).toBe('금리: 돈의 가격은 어떻게 정해지나');
  });

  it('구분자가 하이픈이어도 뗀다(시리즈마다 다르다)', () => {
    expect(
      seriesEpisodeSubtitle(
        '키워드로 빠르게 배우는 CS 지식 12 - 네트워크',
        '키워드로 빠르게 배우는 CS 지식',
      ),
    ).toBe('네트워크');
  });

  it('꼴이 맞지 않으면 원래 제목 그대로 둔다', () => {
    expect(seriesEpisodeSubtitle('금리의 모든 것', '키워드로 훑어보는 경제 상식')).toBe(
      '금리의 모든 것',
    );
    expect(
      seriesEpisodeSubtitle('키워드로 훑어보는 경제 상식 특별편', '키워드로 훑어보는 경제 상식'),
    ).toBe('키워드로 훑어보는 경제 상식 특별편');
  });

  it('떼고 나서 비면 원래 제목 그대로 둔다', () => {
    expect(seriesEpisodeSubtitle('시리즈 3 — ', '시리즈')).toBe('시리즈 3 — ');
  });

  it('시리즈 제목에 정규식 특수문자가 있어도 글자 그대로 맞춘다', () => {
    expect(seriesEpisodeSubtitle('C++ (기초) 1 - 포인터', 'C++ (기초)')).toBe('포인터');
  });
});

describe('pickSeriesPlayEpisode — 머리 [재생]이 틀 편', () => {
  const numbered = (episodeNo: number, library: ExploreLibraryState | null): SeriesEpisode => ({
    ...episode(library, null),
    episodeNo,
  });
  const completed: ExploreLibraryState = { itemId: 'i', source: 'save', status: 'completed' };

  it('아직 다 듣지 않은 가장 앞 편을 고른다', () => {
    const picked = pickSeriesPlayEpisode([
      numbered(1, completed),
      numbered(2, null),
      numbered(3, null),
    ]);

    expect(picked?.episodeNo).toBe(2);
  });

  it('전부 완청이면 1화부터', () => {
    const picked = pickSeriesPlayEpisode([numbered(1, completed), numbered(2, completed)]);

    expect(picked?.episodeNo).toBe(1);
  });

  it('담지 않고 끝까지 들은 편(is_completed)도 완청이고, 머리 [재생]은 그 편을 건너뛴다(KAN-249)', () => {
    // given — 1화는 담지 않았지만 서버가 완청이라고 준다
    const first = {
      ...episode(null, null),
      item: { ...episode(null, null).item, isCompleted: true },
    };
    const second = { ...episode(null, null), episodeNo: 2 };

    // then
    expect(toSeriesEpisodeState(first).isCompleted).toBe(true);
    expect(pickSeriesPlayEpisode([first, second])).toBe(second);
  });

  it('편이 없으면 null(버튼을 그리지 않는다)', () => {
    expect(pickSeriesPlayEpisode([])).toBeNull();
  });
});
