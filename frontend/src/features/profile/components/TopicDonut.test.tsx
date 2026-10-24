import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import { PROFILE_COPY } from '../profile.copy';
import type { TopicDistribution, TopicHighlight } from '../profile.types';
import TopicDonut from './TopicDonut';

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
  findAll(predicate: (node: Node) => boolean): Node[];
}
interface Renderer {
  root: Node;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

const DISTRIBUTION: TopicDistribution = {
  topics: [
    { topicId: 't-career', name: '커리어', ratio: 70 },
    { topicId: 't-it', name: 'IT·개발', ratio: 30 },
  ],
  othersRatio: 0,
};

let renderer: Renderer | null = null;
function render(highlight: TopicHighlight | null, onUnexploredPress = jest.fn()) {
  act(() => {
    renderer = create(
      <TopicDonut
        distribution={DISTRIBUTION}
        embedded
        highlight={highlight}
        onUnexploredPress={onUnexploredPress}
      />,
    );
  });
  return { root: (renderer as Renderer).root, onUnexploredPress };
}

/** 누를 수 있는 버튼 — jest 프리셋이 Pressable 을 다른 타입으로 바꿔 끼워 역할·핸들러로 찾는다 */
const buttons = (root: Node): Node[] =>
  root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );

/** 글자 노드에 이 문자열이 그대로 있는가 */
const hasText = (root: Node, text: string): boolean =>
  root.findAll((node) => node.children.some((child) => child === text)).length > 0;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe('TopicDonut 주제 한 줄(profile.md 4.7-1)', () => {
  it('안 들어본 주제는 헤드라인 옆 버튼이고, 누르면 그 주제 id 로 부른다', () => {
    // given
    const highlight: TopicHighlight = { kind: 'unexplored', topicId: 't-history', name: '역사' };
    const { root, onUnexploredPress } = render(highlight);

    // when
    const button = buttons(root)[0];
    act(() => (button.props.onPress as () => void)());

    // then
    expect(hasText(root, PROFILE_COPY.stats.topicHighlight(highlight).main)).toBe(true);
    expect(button.props.accessibilityLabel).toBe('아직 안 들어본 주제, 역사');
    expect(onUnexploredPress).toHaveBeenCalledWith('t-history');
  });

  it('같은 직군 1위는 표시 전용이다 — 누를 자리가 없다', () => {
    const highlight: TopicHighlight = { kind: 'peerTop', topicId: 't-econ', name: '경제' };
    const { root } = render(highlight);

    expect(hasText(root, '같은 직군 1위 · 경제')).toBe(true);
    expect(buttons(root)).toHaveLength(0);
  });

  it('값이 없으면 한 줄을 그리지 않고 헤드라인은 그대로다', () => {
    const { root } = render(null);

    expect(buttons(root)).toHaveLength(0);
    expect(hasText(root, PROFILE_COPY.stats.topTopicLabel)).toBe(true);
  });

  it('헤드라인 하나가 목록 전체를 읽는다 — 옆 한 줄은 따로 읽힌다', () => {
    const { root } = render({ kind: 'topicCount', count: 2 });

    const labels = root
      .findAll((node) => node.props.accessible === true)
      .map((node) => node.props.accessibilityLabel);
    expect(labels).toContain('커리어 70%, IT·개발 30%');
    expect(labels).toContain('이번 주 2개 주제를 들었어요');
  });
});
