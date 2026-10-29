/**
 * KAN-294 — 시리즈 편 행의 잠금 표시. 서버가 잠갔다고 준 편(`content.isLocked`)에만 자물쇠가 보이고 낭독 라벨에 "잠김"이 붙는다.
 * 화수로 앱이 다시 계산하지 않는다 — 4화라도 서버가 false 면 자물쇠가 없다(프로·체험 사용자)
 */
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import type { SeriesEpisode } from '../explore.types';
import SeriesEpisodeRow from './SeriesEpisodeRow';

// 재생 중 막대는 reanimated 를 끌어온다(테스트 환경에서 worklets 가 뜨지 않는다) — 이 테스트의 관심 밖이다
jest.mock('./NowPlayingBars', () => () => null);

interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

const episode = (episodeNo: number, isLocked: boolean): SeriesEpisode => ({
  episodeNo,
  item: {
    type: 'content',
    content: {
      id: `e${episodeNo}`,
      title: `키워드 ${episodeNo} — 소제목`,
      authorName: '',
      sourceName: '이어',
      sourceUrl: null,
      durationSec: 600,
      thumbnailUrl: 'https://example.com/t.webp',
      contentVersion: 1,
      topicIds: [],
      tags: [],
      language: 'ko',
      series: { id: 's1', title: '키워드', episodeNo, totalEpisodes: 16 },
      isLocked,
    },
    library: null,
    isCountedToday: false,
    isCompleted: false,
  },
  progress: null,
});

const render = (target: SeriesEpisode) => {
  let renderer!: Renderer;
  act(() => {
    renderer = create(
      <SeriesEpisodeRow
        episode={target}
        seriesTitle="키워드"
        isNowPlaying={false}
        isPlaying={false}
        onPress={() => undefined}
        onMorePress={() => undefined}
      />,
    );
  });
  return renderer;
};

const lockNodes = (renderer: Renderer) =>
  renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === 'series-episode-lock',
  );
const rowLabel = (renderer: Renderer): string =>
  renderer.root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      typeof node.props.onPress === 'function' &&
      typeof node.props.accessibilityLabel === 'string' &&
      (node.props.accessibilityLabel as string).includes('화'),
  )[0].props.accessibilityLabel as string;

describe('SeriesEpisodeRow — 잠긴 편 표시(KAN-294)', () => {
  it('서버가 잠갔다고 준 편이면 자물쇠가 보이고 낭독 라벨에 "잠김"이 붙는다', () => {
    // given · when
    const renderer = render(episode(4, true));

    // then
    expect(lockNodes(renderer)).toHaveLength(1);
    expect(rowLabel(renderer)).toContain('잠김');
    renderer.unmount();
  });

  it('잠기지 않은 편이면(같은 4화라도 서버가 false — 프로·체험) 자물쇠도 "잠김"도 없다', () => {
    // given · when
    const renderer = render(episode(4, false));

    // then
    expect(lockNodes(renderer)).toHaveLength(0);
    expect(rowLabel(renderer)).not.toContain('잠김');
    renderer.unmount();
  });
});
