import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import { SKELETON_A11Y_LABEL, SkeletonBlock, SkeletonGroup, SkeletonLine } from './Skeleton';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다.
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
  act(callback: () => Promise<void>): Promise<void>;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

/** OS 동작 줄이기 설정을 고정하고, 반짝임 루프는 시작 여부만 기록하는 가짜로 바꾼다 */
const arrange = (isReduceMotion: boolean) => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(isReduceMotion);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
  const start = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop: jest.fn(), reset: jest.fn() });
  return { start };
};

const renderSkeleton = async (element: ReactNode) => {
  let renderer!: Renderer;
  // 동작 줄이기 조회(비동기)가 끝날 때까지 기다린다
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
};

const hostNodes = (renderer: Renderer, predicate: (props: Record<string, unknown>) => boolean) =>
  renderer.root.findAll((node) => typeof node.type === 'string' && predicate(node.props));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SkeletonGroup', () => {
  it('OS 동작 줄이기가 켜져 있으면 반짝임 애니메이션을 시작하지 않는다', async () => {
    // given
    const { start } = arrange(true);

    // when
    const renderer = await renderSkeleton(
      <SkeletonGroup>
        <SkeletonLine />
      </SkeletonGroup>,
    );

    // then
    expect(start).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('OS 동작 줄이기가 꺼져 있으면 반짝임 애니메이션을 시작한다', async () => {
    // given
    const { start } = arrange(false);

    // when
    const renderer = await renderSkeleton(
      <SkeletonGroup>
        <SkeletonLine />
      </SkeletonGroup>,
    );

    // then
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it('로딩 영역 하나에 "불러오는 중" 라벨 하나만 두고 블록은 낭독에서 숨긴다', async () => {
    // given
    arrange(true);

    // when
    const renderer = await renderSkeleton(
      <SkeletonGroup>
        <SkeletonBlock width={48} height={48} />
        <SkeletonLine />
        <SkeletonLine width="40%" />
      </SkeletonGroup>,
    );
    const labelled = hostNodes(renderer, (props) => props.accessibilityLabel !== undefined);
    const blocks = hostNodes(renderer, (props) => props.importantForAccessibility !== undefined);

    // then
    expect({
      labels: labelled.map((node) => node.props.accessibilityLabel),
      blocksHidden: blocks.map(
        (node) =>
          node.props.accessibilityElementsHidden === true &&
          node.props.importantForAccessibility === 'no-hide-descendants',
      ),
    }).toEqual({ labels: [SKELETON_A11Y_LABEL], blocksHidden: [true, true, true] });
    await act(async () => renderer.unmount());
  });
});
